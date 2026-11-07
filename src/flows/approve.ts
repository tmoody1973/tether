import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import type { AlpacaBroker } from "@/adapters/alpaca/broker";
import { isLeveragedProduct, LEVERAGED_TEXT } from "@/engine/invest";
import { ApprovalError, decideApproval } from "@/flows/approvals";
import { settleInvestment } from "@/flows/invest";
import { settlePurchase, type Deps } from "@/flows/purchase";

/** What Amara's one tap led to, as a short code the home page turns into words (no free text in URLs). */
export type ApproveCode =
  | "paid" | "paying" | "changed" | "rules" | "nopaypal" | "paypal-off" | "paypal-declined" | "notstarted"
  | "inv-filled" | "inv-queued" | "inv-depositing" | "inv-rejected" | "inv-waiting" | "inv-cash-held" | "inv-review"
  | "fund" | "shop" | "shop-later";

export const APPROVE_CODES: readonly ApproveCode[] = [
  "paid", "paying", "changed", "rules", "nopaypal", "paypal-off", "paypal-declined", "notstarted",
  "inv-filled", "inv-queued", "inv-depositing", "inv-rejected", "inv-waiting", "inv-cash-held", "inv-review", "fund", "shop", "shop-later",
];

/** assetName: a symbol's name from Alpaca's asset list (null: not listed), for the leveraged check below. */
export type ApproveDeps = Deps & { alpaca: () => AlpacaBroker; assetName?: (symbol: string) => Promise<string | null> };

/** The symbol an add-to-list or investment approval is about; null for purchases and shops. */
async function approvalSymbol(db: Db, approvalId: string): Promise<string | null> {
  const [a] = await db.select({ subject: t.approvals.subject, id: t.approvals.subjectId }).from(t.approvals).where(eq(t.approvals.id, approvalId));
  if (a?.subject === "investment") return (await db.select({ s: t.investments.symbol }).from(t.investments).where(eq(t.investments.id, a.id)))[0]?.s ?? null;
  if (a?.subject === "fund") return (await db.select({ s: t.fundProposals.symbol }).from(t.fundProposals).where(eq(t.fundProposals.id, a.id)))[0]?.s ?? null;
  return null;
}

/**
 * Defence in depth: Zoe's propose already refuses leveraged and inverse products, so this only catches a proposal
 * made before that rule. Nothing is recorded; the request stays open for her to decline.
 * ponytail: a failed name lookup lets her yes through (logged), since the propose check is the gate; fail closed if that changes.
 */
async function refuseLeveraged(deps: ApproveDeps, approvalId: string): Promise<void> {
  if (!deps.assetName) return;
  const symbol = await approvalSymbol(deps.db, approvalId);
  if (!symbol) return;
  const name = await deps.assetName(symbol).catch((err: unknown) => {
    console.error("approve: asset name unavailable", symbol, err instanceof Error ? err.message : err);
    return null;
  });
  if (name && isLeveragedProduct(name)) throw new ApprovalError(LEVERAGED_TEXT);
}

/**
 * R36: approve settles in one tap. The decision is recorded first (and stands whatever happens next);
 * a purchase is then charged and an investment placed. Settling never throws past here: a failure to
 * start is reported as "nothing was charged / nothing has moved yet".
 */
export async function approveAndSettle(deps: ApproveDeps, familyId: string, approvalId: string): Promise<ApproveCode> {
  await refuseLeveraged(deps, approvalId);
  const { subject, subjectId, shopApplied } = await decideApproval(deps, approvalId, "approved", familyId); // throws if not open / not hers
  if (subject === "shop") return shopApplied === false ? "shop-later" : "shop"; // no rules in force: recorded for next signing
  if (subject === "fund") return subject;
  if (subject === "purchase") {
    try {
      const r = await settlePurchase(deps, subjectId);
      if (r.status === "paid") return "paid";
      if (r.status === "paying") return "paying";
      if (r.status === "failed") return "paypal-declined";
      if (r.reason === "CART_MISMATCH" || r.reason === "UNAVAILABLE") return "changed";
      if (r.reason === "NO_PAYMENT_METHOD") return "nopaypal";
      if (r.reason === "PAYPAL_UNAVAILABLE") return "paypal-off";
      if (r.status === "refused" || r.status === "needs_approval") return "rules";
      return "notstarted";
    } catch (err) {
      console.error("approveAndSettle: purchase settle failed", subjectId, err instanceof Error ? err.message : err);
      return "notstarted";
    }
  }
  try {
    const r = await settleInvestment({ db: deps.db, now: deps.now, secret: deps.secret, alpaca: deps.alpaca() }, subjectId);
    const map: Record<string, ApproveCode> = {
      filled: "inv-filled", queued: "inv-queued", depositing: "inv-depositing", rejected: "inv-rejected",
      approved: "inv-waiting", cash_held: "inv-cash-held", needs_review: "inv-review",
    };
    return map[r.status] ?? "inv-waiting";
  } catch (err) {
    console.error("approveAndSettle: investment settle failed", subjectId, err instanceof Error ? err.message : err);
    return "inv-waiting";
  }
}

/** Amount and shop of this family's purchase approval, for the "Approved and paid — $X at shop" line. */
export async function approvedPurchase(db: Db, familyId: string, approvalId: string): Promise<{ amountCents: number; shop: string } | null> {
  const [a] = await db.select().from(t.approvals).where(eq(t.approvals.id, approvalId));
  if (!a || a.familyId !== familyId || a.subject !== "purchase") return null;
  const [p] = await db.select().from(t.purchases).where(eq(t.purchases.id, a.subjectId));
  if (!p) return null;
  const [m] = await db.select({ name: t.merchants.name }).from(t.merchants).where(eq(t.merchants.id, p.cart.merchantId));
  return { amountCents: p.cart.totalCents, shop: m?.name ?? "the shop" };
}
