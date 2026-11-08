// Decision 030: a PayPal refund of one of Zoe's purchases gives the money back. If the purchase's week is still open
// it goes back into that week (she can spend it); if the week has closed it is added to what Amara has promised.
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { appendJournal } from "@/db/repo";
import { weekKey, weekRecords } from "@/ledger/ledger";
import { unspentCents } from "@/engine/ladder";
import { withFamilyLock } from "@/flows/grant";
import type { PaypalTx } from "@/adapters/paypal/transactions";
import type { Deps } from "@/flows/purchase";

/** PayPal T-code groups that give a payment back: T11 reversals and refunds, T12 chargebacks. */
export const UNDO_CODE = /^T1[12]\d\d$/;

const REFUND_KINDS = ["refund", "refund_promised"] as const;

/** For one capture: back into her week, added to what's promised, and the gross PayPal refunded (030). */
export interface RefundSplit { weekCents: number; promisedCents: number; grossCents: number }

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

interface Written { capture: string; total: number; kind: string; cents: number; purchaseId: string | null }

/** The refund rows already written. ref "<capture>#<total>": the gross refunded so far for that capture. */
async function written(db: Db, familyId: string): Promise<Written[]> {
  const rows = await db.select({ kind: t.journal.kind, ref: t.journal.ref, cents: t.journal.amountCents, note: t.journal.note }).from(t.journal)
    .where(and(eq(t.journal.familyId, familyId), inArray(t.journal.kind, [...REFUND_KINDS])));
  return rows.map((r) => {
    const [capture, total] = (r.ref ?? "").split("#");
    return { capture, total: Number(total) || 0, kind: r.kind, cents: r.cents, purchaseId: r.note };
  }).sort((a, b) => a.total - b.total);
}

/** Per capture: what went back to her week, what was added to what's promised, and the gross PayPal refunded. */
function splits(rows: Written[]): Map<string, RefundSplit> {
  const out = new Map<string, RefundSplit>();
  for (const r of rows) {
    const s = out.get(r.capture) ?? { weekCents: 0, promisedCents: 0, grossCents: 0 };
    out.set(r.capture, {
      weekCents: s.weekCents + (r.kind === "refund" ? r.cents : 0),
      promisedCents: s.promisedCents + (r.kind === "refund_promised" ? r.cents : 0),
      grossCents: Math.max(s.grossCents, r.total),
    });
  }
  return out;
}

/**
 * Writes what is newly refunded for each of this family's captures, once: under the family lock, only the difference
 * between PayPal's refunded total and the gross already written, keyed "<captureId>#<total>" (unique index), so a
 * replay or a second reconcile writes nothing. Only paid purchases with a receipt and no decline reversal qualify, so a
 * declined charge (already reversed by R37) can never be counted again. Returns what each capture has had back.
 *
 * Open week: the refund goes back into that week (dated at the spend), and week close then saves what's unspent.
 * Closed week (review MEDIUM 2): only the share that came out of her allowance is added to what's promised, by week
 * close's own formula: unspent(allowance, spent − refund) − unspent(allowance, spent). A refund of money Amara approved
 * past the week adds nothing, so the result doesn't depend on whether the refund was seen before or after the close.
 */
export async function applyRefunds(
  deps: Pick<Deps, "db" | "now">, familyId: string, refunded: Map<string, number>,
): Promise<Map<string, RefundSplit>> {
  if (refunded.size === 0) return new Map(); // nothing refunded: no lock, no query (this runs while Activity renders)
  return withFamilyLock(deps, familyId, async (tx, now) => {
    const rows = await written(tx, familyId);
    const receipts = await tx.select({ captureId: t.receipts.captureId, p: t.purchases })
      .from(t.receipts).innerJoin(t.purchases, eq(t.purchases.id, t.receipts.purchaseId))
      .where(and(eq(t.purchases.familyId, familyId), inArray(t.receipts.captureId, [...refunded.keys()])));
    const [journal, weeks] = await Promise.all([
      tx.select({ kind: t.journal.kind, at: t.journal.at, ref: t.journal.ref }).from(t.journal)
        .where(and(eq(t.journal.familyId, familyId), inArray(t.journal.kind, ["spend", "spend_reversal"]))),
      weekRecords(tx, familyId),
    ]);
    const spendAt = new Map(journal.filter((j) => j.kind === "spend" && j.ref).map((j) => [j.ref as string, j.at]));
    const reversed = new Set(journal.filter((j) => j.kind === "spend_reversal").map((j) => j.ref));
    const weekOf = (purchaseId: string | null) => { const at = purchaseId ? spendAt.get(purchaseId) : undefined; return at ? weekKey(at) : null; };
    for (const { captureId, p } of receipts) {
      const total = Math.min(refunded.get(captureId) ?? 0, p.cart.totalCents);
      const delta = total - (splits(rows).get(captureId)?.grossCents ?? 0);
      const at = spendAt.get(p.id);
      if (delta <= 0 || p.status !== "paid" || !at || reversed.has(p.id)) continue; // never on top of a decline's reversal
      const week = weeks.find((w) => w.weekKey === weekKey(at));
      const ref = `${captureId}#${total}`;
      if (!week) {
        await appendJournal(tx, { familyId, kind: "refund", amountCents: delta, at, ref, note: p.id });
        rows.push({ capture: captureId, total, kind: "refund", cents: delta, purchaseId: p.id });
        continue;
      }
      // Gross refunded after this week closed, for any of its purchases: it isn't in `week.spentCents` yet.
      const prev = new Map<string, number>();
      let after = 0;
      for (const r of rows) {
        if (r.kind === "refund_promised" && weekOf(r.purchaseId) === week.weekKey) after += r.total - (prev.get(r.capture) ?? 0);
        prev.set(r.capture, r.total);
      }
      const spent = week.spentCents - after;
      const credit = unspentCents(week.allowanceCents, spent - delta) - unspentCents(week.allowanceCents, spent);
      await appendJournal(tx, { familyId, kind: "refund_promised", amountCents: credit, at: now, ref, note: p.id });
      rows.push({ capture: captureId, total, kind: "refund_promised", cents: credit, purchaseId: p.id });
    }
    return splits(rows);
  });
}
