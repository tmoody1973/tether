import { and, eq, gt, gte, isNotNull, isNull, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { getFamily } from "@/db/repo";
import { cartHash } from "@/engine/hash";
import { liftableOverage, requestApproval } from "@/flows/approvals";
import { installGrant, withFamilyLock } from "@/flows/grant";
import { proposePurchase, type Deps } from "@/flows/purchase";
import type { DemoKeys } from "@/flows/seed";

const WEEK_MS = 7 * 86_400_000;
/** R44: the demo freshens itself when a judge comes in this long (REAL time) after the last seed or reset. */
export const DEMO_STALE_MS = 6 * 3_600_000;

export class DemoResetError extends Error {
  constructor(message: string) { super(message); this.name = "DemoResetError"; }
}

export type ResetResult = { needsPaypal: boolean };

/**
 * Puts the shared demo family back to its seeded end state (D11, R43) WITHOUT charging PayPal again:
 *
 * - Money rows are never deleted. Purchases, receipts and journal rows written since the seed stay on the record;
 *   the family's ledger void window (seed, reset] makes them count in no total (week, budget, savings).
 * - Non-money state written since the seed is cleared: open approvals expire, weeks closed / level changes made /
 *   releases and fund proposals created after the seed are deleted.
 * - The seeded rules are re-installed as a new version, the clock goes back to the seeded "now", Zoe's link goes
 *   back to the demo token, her goal and promise to the seeded ones; then the seeded ask and shop suggestion reopen.
 * - A vault Revoke deleted at PayPal can't be re-saved here (that needs Amara's approval at PayPal): `needsPaypal`.
 *
 * Refuses for any family that isn't the demo family. With `ifStaleMs` it does nothing (null) unless the last
 * seed/reset is at least that old in real time (R44).
 */
export async function resetDemo(
  deps: Deps, familyId: string, keys: Partial<DemoKeys>, opts: { ifStaleMs?: number } = {},
): Promise<ResetResult | null> {
  const fam = await getFamily(deps.db, familyId);
  if (!keys.guardianKey || !keys.teenToken || !fam || fam.guardianToken !== keys.guardianKey || !fam.demo) {
    throw new DemoResetError("only the demo family can be reset");
  }
  const s = fam.demo;
  const seeded = new Date(s.now);
  const ran = await withFamilyLock(deps, familyId, async (tx) => {
    if (opts.ifStaleMs !== undefined) {
      // R44 atomic claim: only when the last seed/reset is older than ifStaleMs in REAL (DB) time. Under the family
      // lock, a second judge entering at the same moment sees the fresh time and skips: one reset, never two.
      const claimed = await tx.update(t.families).set({ ledgerVoidTo: sql`now()` }).where(and(
        eq(t.families.id, familyId), isNotNull(t.families.demo),
        sql`coalesce(${t.families.ledgerVoidTo}, ${t.families.ledgerVoidFrom}) < now() - ${opts.ifStaleMs} * interval '1 millisecond'`,
      )).returning({ id: t.families.id });
      if (claimed.length === 0) return false;
    }
    await tx.update(t.approvals).set({ expiredAt: seeded })
      .where(and(eq(t.approvals.familyId, familyId), isNull(t.approvals.result), isNull(t.approvals.expiredAt)));
    await tx.delete(t.levelChanges).where(and(eq(t.levelChanges.familyId, familyId), gte(t.levelChanges.at, seeded)));
    await tx.delete(t.weeks).where(and(eq(t.weeks.familyId, familyId), gt(t.weeks.closedAt, seeded)));
    // ponytail: the seed makes no releases or fund proposals, so every one of them is post-seed activity. A CONFIRMED
    // release stays: it is Amara's record that she sent money (its journal row is set aside with the rest).
    await tx.delete(t.releases).where(and(eq(t.releases.familyId, familyId), isNull(t.releases.confirmedAt)));
    await tx.delete(t.fundProposals).where(eq(t.fundProposals.familyId, familyId));
    if (fam.ledgerVoidFrom) {
      await tx.delete(t.fundAllowlist).where(and(eq(t.fundAllowlist.familyId, familyId), gt(t.fundAllowlist.addedAt, fam.ledgerVoidFrom)));
    }
    await tx.insert(t.goals).values({ familyId, ...s.goal })
      .onConflictDoUpdate({ target: t.goals.familyId, set: s.goal });
    await tx.update(t.families).set({
      clockOffsetMs: seeded.getTime() - Date.now(), teenToken: keys.teenToken,
      commitmentCents: s.commitmentCents, pendingCommitmentCents: null,
      teenNudgeAt: null, teenNudgeNote: null, teenSeenLevelAt: null,
      ledgerVoidTo: sql`now()`, // DB time, the same clock journal.created_at is written with
    }).where(eq(t.families.id, familyId));
    const expiresAt = new Date(seeded.getTime() + WEEK_MS).toISOString();
    await installGrant(tx, familyId, (version) => ({
      ...s.grant, id: crypto.randomUUID(), version, signedAt: seeded.toISOString(), expiresAt,
      constraints: s.grant.constraints.map((c) =>
        c.type === "payment.execution_date" ? { ...c, notBefore: seeded.toISOString(), notAfter: expiresAt } : c),
    }), seeded);
    return true;
  });
  if (!ran) return null;

  // Reopen what was waiting on Amara. A fresh purchase row: the seeded one may have been approved and paid since.
  if (s.ask) {
    const { purchaseId, decision } = await proposePurchase(deps, familyId, s.ask.cart);
    if (decision.outcome === "REFUSE" && liftableOverage(decision) !== null) {
      await requestApproval(deps, familyId, "purchase", purchaseId, cartHash(s.ask.cart), s.ask.note);
    }
  }
  await requestApproval(deps, familyId, "shop", s.shop.domain, null, s.shop.reason);

  const [vault] = await deps.db.select().from(t.vault).where(eq(t.vault.familyId, familyId));
  return { needsPaypal: !vault || vault.deletedAt !== null };
}

/**
 * R44: judges arrive days apart and the demo clock runs with real time, so a stale demo (rules ended, month end
 * passed, asks expired) resets itself on entry: only when the last seed/reset is DEMO_STALE_MS old in real time, never
 * because of where the demo clock is (a judge's own level-up survives the next judge within the window).
 * Returns true when it reset.
 */
export async function freshenDemoIfStale(deps: Deps, keys: Partial<DemoKeys>, staleMs = DEMO_STALE_MS): Promise<boolean> {
  if (!keys.guardianKey || !keys.teenToken) return false;
  const [fam] = await deps.db.select({ id: t.families.id }).from(t.families)
    .where(and(eq(t.families.guardianToken, keys.guardianKey), isNotNull(t.families.demo)));
  if (!fam) return false;
  return (await resetDemo(deps, fam.id, keys, { ifStaleMs: staleMs })) !== null;
}
