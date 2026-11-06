import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { purchaseTokensForFamily, receiptsForMonth } from "@/db/repo";
import type { PaypalHttp } from "@/adapters/paypal/http";
import { listTransactions } from "@/adapters/paypal/transactions";

const DAY_MS = 86_400_000;
// ponytail: one 31-day search (Transaction Search's widest range) from the month's first slip; a month whose slips
// span more than 31 real days would miss late rows — split into several searches if that ever happens.
const MAX_WINDOW_MS = 31 * DAY_MS;
/** PayPal T-code groups that give a payment back: T11 reversals and refunds, T12 chargebacks. */
const UNDO_CODE = /^T1[12]\d\d$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type ReconFlag =
  /** PayPal charged this family (custom_field = one of its tokens) but Tether holds no receipt for that capture. */
  | { kind: "paypal_only"; captureId: string; amountCents: number }
  /** A receipt whose capture PayPal's list doesn't show (yet: Transaction Search lags up to ~3 hours). */
  | { kind: "unconfirmed"; captureId: string; amountCents: number; shop: string }
  /** A receipt PayPal shows as reversed or refunded. */
  | { kind: "refunded"; captureId: string; amountCents: number; shop: string };

export interface Reconciliation { receiptsChecked: number; flags: ReconFlag[] }

export const FLAG_WORDS: Record<ReconFlag["kind"], string> = {
  paypal_only: "PayPal charged, Tether has no receipt",
  unconfirmed: "Receipt not confirmed by PayPal",
  refunded: "Refunded in PayPal",
};
export const LAG_NOTE = "PayPal's list can lag a few hours.";

/**
 * R35: compares one family's month (demo-clock month, 'YYYY-MM') with PayPal's Transaction Search.
 * Tether's merchant account holds every family's charges, so a PayPal row counts as this family's only if its
 * custom_field is one of this family's permission-slip token ids. Rows with no family link are ignored, never shown.
 */
export async function reconcileMonth(
  deps: { db: Db; paypal: PaypalHttp }, familyId: string, month: string, realNow: Date = new Date(),
): Promise<Reconciliation> {
  if (!MONTH_RE.test(month)) throw new Error(`bad month ${month}`);
  const { db } = deps;
  const [receipts, tokens, spends] = await Promise.all([
    receiptsForMonth(db, familyId, month),
    purchaseTokensForFamily(db, familyId),
    db.select({ ref: t.journal.ref, at: t.journal.at }).from(t.journal)
      .where(and(eq(t.journal.familyId, familyId), eq(t.journal.kind, "spend"))),
  ]);
  // A purchase belongs to the month its money left the budget (demo clock), receipt or not.
  const monthPurchases = new Set(spends.filter((s) => s.at.toISOString().startsWith(month)).map((s) => s.ref));
  const monthTokens = tokens.filter((tk) => monthPurchases.has(tk.purchaseId));
  if (receipts.length === 0 && monthTokens.length === 0) return { receiptsChecked: 0, flags: [] };

  // PayPal dates rows in real time, not demo time: search from just before the first slip was used.
  const firstUse = monthTokens.length
    ? Math.min(...monthTokens.map((tk) => tk.consumedAt.getTime()))
    : realNow.getTime() - MAX_WINDOW_MS + DAY_MS;
  const start = new Date(firstUse - DAY_MS);
  const end = new Date(Math.min(realNow.getTime(), start.getTime() + MAX_WINDOW_MS));
  const rows = await listTransactions(deps.paypal, start, end);

  const mine = new Set(monthTokens.map((tk) => tk.tokenId));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const captures = new Set(receipts.map((r) => r.captureId));
  const undone = new Set([
    ...rows.filter((r) => r.status === "V").map((r) => r.id),
    // Only reversal/refund/chargeback T-codes (T11xx, T12xx) undo a payment. Other negative rows that reference a
    // capture, like the sandbox's automatic T2002 sweep to a partner account, move money on and refund nothing.
    ...rows.filter((r) => r.amountCents < 0 && r.referenceId && UNDO_CODE.test(r.eventCode ?? "")).map((r) => r.referenceId as string),
  ]);

  const flags: ReconFlag[] = [
    // a reversed charge (status V) took no money in the end, so it isn't "charged without a receipt"
    ...rows.filter((r) => r.customField && mine.has(r.customField) && r.amountCents > 0 && r.status !== "V" && !captures.has(r.id))
      .map((r): ReconFlag => ({ kind: "paypal_only", captureId: r.id, amountCents: r.amountCents })),
    ...receipts.flatMap((r): ReconFlag[] => {
      const base = { captureId: r.captureId, amountCents: r.amountCents, shop: r.shop };
      if (undone.has(r.captureId)) return [{ kind: "refunded", ...base }];
      return byId.has(r.captureId) ? [] : [{ kind: "unconfirmed", ...base }];
    }),
  ];
  return { receiptsChecked: receipts.length, flags };
}
