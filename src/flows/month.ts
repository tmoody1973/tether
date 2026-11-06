import { and, desc, eq, gt, isNull, lte } from "drizzle-orm";
import * as t from "@/db/schema";
import { appendJournal, getActiveGrant, getLatestGrant } from "@/db/repo";
import type { Db } from "@/db/client";
import { commitmentKept, reviewMonth, type Level, type Review, type WeekRecord } from "@/engine/ladder";
import { savingsCents, weekRecords } from "@/ledger/ledger";
import { GrantError, installLevel, withFamilyLock } from "@/flows/grant";
import type { Deps } from "@/flows/purchase";

/** Weeks that count toward the next review: only those closed after the latest level change, so one streak promotes once. */
export async function reviewWeeks(db: Db, familyId: string): Promise<WeekRecord[]> {
  const [last] = await db.select().from(t.levelChanges).where(eq(t.levelChanges.familyId, familyId)).orderBy(desc(t.levelChanges.at)).limit(1);
  const fresh = last
    ? new Set((await db.select({ k: t.weeks.weekKey }).from(t.weeks)
      .where(and(eq(t.weeks.familyId, familyId), gt(t.weeks.closedAt, last.at)))).map((r) => r.k))
    : null;
  return (await weekRecords(db, familyId)).filter((w) => !fresh || fresh.has(w.weekKey));
}

export type MonthResult = Review & { release?: { releaseId: string; savedCents: number; matchCents: number } };

export async function runMonthReview(deps: Pick<Deps, "db" | "now">, familyId: string): Promise<MonthResult> {
  return withFamilyLock(deps, familyId, async (tx, now) => {
    const cur = await getActiveGrant(tx, familyId);
    if (!cur || cur.expiresAt <= now) throw new GrantError("no rules in force to review"); // I2: ended rules never promote
    const weeks = await reviewWeeks(tx, familyId);
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
export async function confirmRelease(deps: Pick<Deps, "db" | "now">, releaseId: string, familyId?: string): Promise<void> {
  const [r] = await deps.db.select().from(t.releases).where(eq(t.releases.id, releaseId));
  if (!r || (familyId !== undefined && r.familyId !== familyId)) throw new GrantError(`unknown release ${releaseId}`);
  await withFamilyLock(deps, r.familyId, async (tx, now) => {
    const [won] = await tx.update(t.releases).set({ confirmedAt: now })
      .where(and(eq(t.releases.id, releaseId), isNull(t.releases.confirmedAt))).returning();
    if (!won) return; // already confirmed
    // I1 belt and braces: never journal more than is saved now, so savings can't go below 0; the release shows that amount.
    const amountCents = Math.min(r.savedCents, Math.max(0, await savingsCents(tx, r.familyId)));
    if (amountCents !== r.savedCents) await tx.update(t.releases).set({ savedCents: amountCents }).where(eq(t.releases.id, releaseId));
    await appendJournal(tx, { familyId: r.familyId, kind: "release", amountCents, ref: releaseId, at: now });
  });
}

export interface ReviewView {
  teenName: string; level: Level | null; stopped: boolean;
  /** The shared demo family: Stop keeps its saved PayPal (C1). */
  demo: boolean;
  /** The latest level change, if any: an engine promotion shows as "moved up, on evidence". */
  latestChange: { fromLevel: number; toLevel: number; by: "engine" | "guardian"; reason: string; at: Date } | null;
  /** The weeks behind the latest promotion, or, otherwise, the weeks counting toward the next review (last 4). */
  evidence: { weeks: number; kept: number; insideBudget: number; savedCents: number; allowanceCents: number };
  next: Review | null;
  release: { id: string; savedCents: number; matchCents: number } | null;
}

/** Read model for the monthly review page: the same weeks runMonthReview reads, without changing anything. */
export async function monthReviewView(db: Db, familyId: string): Promise<ReviewView> {
  const [fam] = await db.select().from(t.families).where(eq(t.families.id, familyId));
  if (!fam) throw new GrantError(`unknown family ${familyId}`);
  const [latest, [change], [release]] = await Promise.all([
    getLatestGrant(db, familyId),
    db.select().from(t.levelChanges).where(eq(t.levelChanges.familyId, familyId)).orderBy(desc(t.levelChanges.at)).limit(1),
    db.select().from(t.releases).where(and(eq(t.releases.familyId, familyId), isNull(t.releases.confirmedAt))).limit(1),
  ]);
  const level = latest ? (latest.level as Level) : null;
  let weeks: WeekRecord[];
  if (change?.by === "engine") {
    const before = new Set((await db.select({ k: t.weeks.weekKey }).from(t.weeks)
      .where(and(eq(t.weeks.familyId, familyId), lte(t.weeks.closedAt, change.at)))).map((r) => r.k));
    weeks = (await weekRecords(db, familyId)).filter((w) => before.has(w.weekKey)).slice(-4);
  } else {
    weeks = (await reviewWeeks(db, familyId)).slice(-4);
  }
  return {
    teenName: fam.teenName, level, stopped: latest?.status === "revoked", demo: fam.demo !== null,
    latestChange: change ? { fromLevel: change.fromLevel, toLevel: change.toLevel, by: change.by, reason: change.reason, at: change.at } : null,
    evidence: {
      weeks: weeks.length, kept: weeks.filter(commitmentKept).length,
      insideBudget: weeks.filter((w) => w.spentCents <= w.allowanceCents).length,
      savedCents: weeks.reduce((s, w) => s + Math.max(0, w.allowanceCents - w.spentCents), 0),
      allowanceCents: weeks.reduce((s, w) => s + w.allowanceCents, 0),
    },
    next: level ? reviewMonth(await reviewWeeks(db, familyId), level) : null,
    release: release ? { id: release.id, savedCents: release.savedCents, matchCents: release.matchCents } : null,
  };
}
