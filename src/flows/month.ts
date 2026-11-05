import { and, desc, eq, gt, isNull } from "drizzle-orm";
import * as t from "@/db/schema";
import { appendJournal, getActiveGrant } from "@/db/repo";
import { reviewMonth, type Level, type Review } from "@/engine/ladder";
import { savingsCents, weekRecords } from "@/ledger/ledger";
import { GrantError, installLevel, withFamilyLock } from "@/flows/grant";
import type { Deps } from "@/flows/purchase";

export type MonthResult = Review & { release?: { releaseId: string; savedCents: number; matchCents: number } };

export async function runMonthReview(deps: Deps, familyId: string): Promise<MonthResult> {
  return withFamilyLock(deps, familyId, async (tx, now) => {
    const cur = await getActiveGrant(tx, familyId);
    if (!cur) throw new GrantError("no active grant to review");
    // Only weeks closed after the latest level change count, so one streak promotes once.
    const [last] = await tx.select().from(t.levelChanges).where(eq(t.levelChanges.familyId, familyId)).orderBy(desc(t.levelChanges.at)).limit(1);
    const fresh = last
      ? new Set((await tx.select({ k: t.weeks.weekKey }).from(t.weeks)
        .where(and(eq(t.weeks.familyId, familyId), gt(t.weeks.closedAt, last.at)))).map((r) => r.k))
      : null;
    const weeks = (await weekRecords(tx, familyId)).filter((w) => !fresh || fresh.has(w.weekKey));
    const review = reviewMonth(weeks, cur.level as Level);
    if (review.action !== "PROMOTE") return review;
    const next = (cur.level + 1) as Level;
    const grant = await installLevel(tx, familyId, next, now);
    await tx.insert(t.levelChanges).values({
      id: crypto.randomUUID(), familyId, fromLevel: cur.level, toLevel: next, by: "engine", reason: review.reason, at: now,
    });
    const open = await tx.select().from(t.releases).where(and(eq(t.releases.familyId, familyId), isNull(t.releases.confirmedAt)));
    if (open.length > 0) {
      const o = open[0];
      return { ...review, release: { releaseId: o.id, savedCents: o.savedCents, matchCents: o.matchCents } };
    }
    const savedCents = Math.max(0, await savingsCents(tx, familyId)); // no unconfirmed releases here, so nothing to subtract
    const matchCents = Math.round((savedCents * grant.matchPct) / 100);
    const releaseId = crypto.randomUUID();
    await tx.insert(t.releases).values({ id: releaseId, familyId, savedCents, matchCents });
    return { ...review, release: { releaseId, savedCents, matchCents } };
  });
}

/** Marks the release confirmed and journals the saved amount out of savings. Safe to call twice. */
export async function confirmRelease(deps: Deps, releaseId: string): Promise<void> {
  const [r] = await deps.db.select().from(t.releases).where(eq(t.releases.id, releaseId));
  if (!r) throw new GrantError(`unknown release ${releaseId}`);
  await withFamilyLock(deps, r.familyId, async (tx, now) => {
    const [won] = await tx.update(t.releases).set({ confirmedAt: now })
      .where(and(eq(t.releases.id, releaseId), isNull(t.releases.confirmedAt))).returning();
    if (!won) return; // already confirmed
    await appendJournal(tx, { familyId: r.familyId, kind: "release", amountCents: r.savedCents, ref: releaseId, at: now });
  });
}
