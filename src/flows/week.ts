import { eq } from "drizzle-orm";
import * as t from "@/db/schema";
import { appendJournal } from "@/db/repo";
import { weekKey, weekRecords } from "@/ledger/ledger";
import { GrantError, withFamilyLock } from "@/flows/grant";
import type { Deps } from "@/flows/purchase";

const DAY_MS = 86_400_000;

/** Monday 00:00 UTC of the ISO week containing d. */
const weekStart = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));

/**
 * Closes the ISO week before the demo clock's current week: records it, journals the unspent
 * allowance as savings, then promotes any pending commitment. No-op if that week is already closed.
 */
export async function closeWeek(deps: Deps, familyId: string): Promise<{ closed: boolean; weekKey: string }> {
  return withFamilyLock(deps, familyId, async (tx, now) => {
    const thisMonday = weekStart(now);
    const key = weekKey(new Date(thisMonday.getTime() - DAY_MS));
    const [fam] = await tx.select().from(t.families).where(eq(t.families.id, familyId));
    const grants = (await tx.select().from(t.grants).where(eq(t.grants.familyId, familyId))).sort((x, y) => y.version - x.version);
    const grant = grants.find((g) => g.signedAt < thisMonday) ?? grants[0]; // the grant in force that week
    if (!grant) throw new GrantError("no grant to close the week against");
    const ins = await tx.insert(t.weeks).values({
      familyId, weekKey: key, allowanceCents: grant.body.weeklyCents, commitmentCents: fam.commitmentCents, closedAt: now,
    }).onConflictDoNothing().returning({ k: t.weeks.weekKey });
    if (ins.length === 0) return { closed: false, weekKey: key };
    const rec = (await weekRecords(tx, familyId)).find((w) => w.weekKey === key)!;
    await appendJournal(tx, {
      familyId, kind: "week_close", amountCents: Math.max(0, rec.allowanceCents - rec.spentCents), ref: key, at: now,
    });
    await tx.update(t.families).set({
      commitmentCents: fam.pendingCommitmentCents ?? fam.commitmentCents, pendingCommitmentCents: null,
    }).where(eq(t.families.id, familyId));
    return { closed: true, weekKey: key };
  });
}
