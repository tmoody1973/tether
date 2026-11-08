// Decision 030: a PayPal refund of one of Zoe's purchases gives the money back. If the purchase's week is still open
// it goes back into that week (she can spend it); if the week has closed it is added to what Amara has promised.
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { appendJournal } from "@/db/repo";
import { weekKey } from "@/ledger/ledger";
import { withFamilyLock } from "@/flows/grant";
import type { PaypalTx } from "@/adapters/paypal/transactions";
import type { Deps } from "@/flows/purchase";

/** PayPal T-code groups that give a payment back: T11 reversals and refunds, T12 chargebacks. */
export const UNDO_CODE = /^T1[12]\d\d$/;

const REFUND_KINDS = ["refund", "refund_promised"] as const;

/** What has been given back for one capture so far: into her week, and added to what's promised. */
export interface RefundSplit { weekCents: number; promisedCents: number }

/**
 * Pure. How much PayPal shows refunded for each capture: the sum of its undo rows (partial refunds add up), or the whole
 * charge when the capture itself shows as reversed (status V) and no undo row has arrived yet. Never more than was charged.
 */
export function refundedByCapture(rows: PaypalTx[], charged: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [captureId, amountCents] of charged) {
    const undone = rows.filter((r) => r.referenceId === captureId && r.amountCents < 0 && UNDO_CODE.test(r.eventCode ?? ""))
      .reduce((s, r) => s - r.amountCents, 0);
    const reversed = rows.some((r) => r.id === captureId && r.status === "V") ? amountCents : 0;
    const total = Math.min(amountCents, Math.max(undone, reversed));
    if (total > 0) out.set(captureId, total);
  }
  return out;
}

const captureOf = (ref: string | null) => (ref ?? "").split("#")[0];

/** The refund rows already written, per capture. */
async function recorded(db: Db, familyId: string): Promise<Map<string, RefundSplit>> {
  const rows = await db.select({ kind: t.journal.kind, ref: t.journal.ref, cents: t.journal.amountCents }).from(t.journal)
    .where(and(eq(t.journal.familyId, familyId), inArray(t.journal.kind, [...REFUND_KINDS])));
  const out = new Map<string, RefundSplit>();
  for (const r of rows) {
    const s = out.get(captureOf(r.ref)) ?? { weekCents: 0, promisedCents: 0 };
    out.set(captureOf(r.ref), r.kind === "refund" ? { ...s, weekCents: s.weekCents + r.cents } : { ...s, promisedCents: s.promisedCents + r.cents });
  }
  return out;
}

/**
 * Writes what is newly refunded for each of this family's captures, once: under the family lock, only the difference
 * between PayPal's refunded total and what is already written, keyed "<captureId>#<total>" (unique index), so a replay
 * or a second reconcile writes nothing. Only paid purchases with a receipt and no decline reversal qualify, so a
 * declined charge (already reversed by R37) can never be counted again. Returns what each capture has had back.
 */
export async function applyRefunds(
  deps: Pick<Deps, "db" | "now">, familyId: string, refunded: Map<string, number>,
): Promise<Map<string, RefundSplit>> {
  if (refunded.size === 0) return new Map(); // nothing refunded: no lock, no query (this runs while Activity renders)
  return withFamilyLock(deps, familyId, async (tx, now) => {
    const done = await recorded(tx, familyId);
    const receipts = await tx.select({ captureId: t.receipts.captureId, p: t.purchases })
      .from(t.receipts).innerJoin(t.purchases, eq(t.purchases.id, t.receipts.purchaseId))
      .where(and(eq(t.purchases.familyId, familyId), inArray(t.receipts.captureId, [...refunded.keys()])));
    const closed = new Set((await tx.select({ k: t.weeks.weekKey }).from(t.weeks).where(eq(t.weeks.familyId, familyId))).map((w) => w.k));
    for (const { captureId, p } of receipts) {
      const total = Math.min(refunded.get(captureId) ?? 0, p.cart.totalCents);
      const had = done.get(captureId) ?? { weekCents: 0, promisedCents: 0 };
      const delta = total - had.weekCents - had.promisedCents;
      if (delta <= 0 || p.status !== "paid") continue;
      const journal = await tx.select({ kind: t.journal.kind, at: t.journal.at }).from(t.journal)
        .where(and(eq(t.journal.familyId, familyId), eq(t.journal.ref, p.id)));
      const spend = journal.find((j) => j.kind === "spend");
      if (!spend || journal.some((j) => j.kind === "spend_reversal")) continue; // never on top of a decline's reversal
      const open = !closed.has(weekKey(spend.at));
      // Open week: dated at the spend, so it counts in that week's spending. Closed: added to what's promised, today.
      const kind = open ? "refund" : "refund_promised";
      await appendJournal(tx, { familyId, kind, amountCents: delta, at: open ? spend.at : now, ref: `${captureId}#${total}`, note: p.id });
      done.set(captureId, open ? { ...had, weekCents: had.weekCents + delta } : { ...had, promisedCents: had.promisedCents + delta });
    }
    return done;
  });
}
