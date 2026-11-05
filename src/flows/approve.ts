import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import type { AlpacaBroker } from "@/adapters/alpaca/broker";
import { decideApproval } from "@/flows/approvals";
import { settleInvestment } from "@/flows/invest";
import { settlePurchase, type Deps } from "@/flows/purchase";

/** What Amara's one tap led to, as a short code the home page turns into words (no free text in URLs). */
export type ApproveCode =
  | "paid" | "paying" | "changed" | "rules" | "nopaypal" | "paypal-declined" | "notstarted"
  | "inv-filled" | "inv-queued" | "inv-depositing" | "inv-rejected" | "inv-waiting" | "inv-cash-held" | "inv-review"
  | "fund" | "shop";

export const APPROVE_CODES: readonly ApproveCode[] = [
  "paid", "paying", "changed", "rules", "nopaypal", "paypal-declined", "notstarted",
  "inv-filled", "inv-queued", "inv-depositing", "inv-rejected", "inv-waiting", "inv-cash-held", "inv-review", "fund", "shop",
];

export type ApproveDeps = Deps & { alpaca: () => AlpacaBroker };

/**
 * R36: approve settles in one tap. The decision is recorded first (and stands whatever happens next);
 * a purchase is then charged and an investment placed. Settling never throws past here: a failure to
 * start is reported as "nothing was charged / nothing has moved yet".
 */
export async function approveAndSettle(deps: ApproveDeps, familyId: string, approvalId: string): Promise<ApproveCode> {
  const { subject, subjectId } = await decideApproval(deps, approvalId, "approved", familyId); // throws if not open / not hers
  if (subject === "fund" || subject === "shop") return subject;
  if (subject === "purchase") {
    try {
      const r = await settlePurchase(deps, subjectId);
      if (r.status === "paid") return "paid";
      if (r.status === "paying") return "paying";
      if (r.status === "failed") return "paypal-declined";
      if (r.reason === "CART_MISMATCH" || r.reason === "UNAVAILABLE") return "changed";
      if (r.reason === "NO_PAYMENT_METHOD") return "nopaypal";
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
