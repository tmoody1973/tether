import { eq } from "drizzle-orm";
import * as t from "@/db/schema";
import { appendJournal } from "@/db/repo";
import { weekKey, weekRecords } from "@/ledger/ledger";
import { commitmentFloorCents } from "@/engine/ladder";
import { GrantError, withFamilyLock } from "@/flows/grant";
import type { Deps } from "@/flows/purchase";

const WEEK_MS = 7 * 86_400_000;

/** Monday 00:00 UTC of the ISO week containing d. */
const weekStart = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));

/** Monday of ISO week key like '2026-W45' (week 1 contains Jan 4). */
function mondayOfKey(key: string): Date {
  const [y, w] = key.split("-W").map(Number);
  return new Date(weekStart(new Date(Date.UTC(y, 0, 4))).getTime() + (w - 1) * WEEK_MS);
}

/**
 * Closes every ended ISO week after the last closed one (or after the first grant's week), in order:
 * records it, journals the unspent allowance as savings. The pending commitment is promoted after
 * the first week closed in this call. No-op when nothing has ended since the last close.
 */
export async function closeWeek(deps: Pick<Deps, "db" | "now">, familyId: string): Promise<{ closed: boolean; weekKeys: string[] }> {
  return withFamilyLock(deps, familyId, async (tx, now) => {
    const thisMonday = weekStart(now);
    const [fam] = await tx.select().from(t.families).where(eq(t.families.id, familyId));
    const grants = (await tx.select().from(t.grants).where(eq(t.grants.familyId, familyId))).sort((a, b) => a.version - b.version);
    if (grants.length === 0) throw new GrantError("no grant to close the week against");
    const keys = (await tx.select({ k: t.weeks.weekKey }).from(t.weeks).where(eq(t.weeks.familyId, familyId))).map((r) => r.k).sort();
    let monday = keys.length
      ? new Date(mondayOfKey(keys[keys.length - 1]).getTime() + WEEK_MS)
      : weekStart(grants[0].signedAt);
    let commitment = fam.commitmentCents;
    const closed: string[] = [];
    for (; monday < thisMonday; monday = new Date(monday.getTime() + WEEK_MS)) {
      const key = weekKey(monday);
      const end = new Date(monday.getTime() + WEEK_MS);
      const grant = [...grants].reverse().find((g) => g.signedAt < end) ?? grants[0]; // grant in force that week
      // Final review I2: rules that had ended before the week began, or were stopped, give no allowance: nothing is
      // saved and the week can't count as kept. ponytail: grants have no revoked-at time, so a stopped grant gives 0 for
      // every week not yet closed when it is stopped; the demo clock closes weeks as it moves, so that is at most this week.
      const inForce = grant.status !== "revoked" && grant.expiresAt > monday;
      // R33: never less than the floor Amara signed for that week, so an unset commitment can't count as kept.
      const promised = Math.max(commitment, commitmentFloorCents(grant.body.weeklyCents, grant.body.commitmentFloorPct));
      const ins = await tx.insert(t.weeks).values({
        familyId, weekKey: key, allowanceCents: inForce ? grant.body.weeklyCents : 0, closedAt: now,
        commitmentCents: inForce ? promised : Math.max(1, promised), // 0 allowance never keeps a promise of 1 cent or more
      }).onConflictDoNothing().returning({ k: t.weeks.weekKey });
      if (ins.length === 0) continue;
      const rec = (await weekRecords(tx, familyId)).find((w) => w.weekKey === key)!;
      await appendJournal(tx, {
        familyId, kind: "week_close", amountCents: Math.max(0, rec.allowanceCents - rec.spentCents), ref: key, at: now,
      });
      if (closed.length === 0 && fam.pendingCommitmentCents !== null) {
        commitment = fam.pendingCommitmentCents;
        await tx.update(t.families).set({ commitmentCents: commitment, pendingCommitmentCents: null }).where(eq(t.families.id, familyId));
      }
      closed.push(key);
    }
    return { closed: closed.length > 0, weekKeys: closed };
  });
}
