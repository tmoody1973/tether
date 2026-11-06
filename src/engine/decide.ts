import { APPROVAL_CONSTRAINTS, evaluate } from "./evaluate";
import { cartHash as hashCart } from "./hash";
import type { ApprovalGrant, Cart, Decision, Grant, LedgerView, Reason } from "./types";

const isApproval = (constraint: string) => APPROVAL_CONSTRAINTS.has(constraint);

/** How far past the week this budget refusal goes; null unless budget is the ONLY hard reason. */
export function budgetOverage(reasons: Reason[]): number | null {
  const hard = reasons.filter((r) => !isApproval(r.constraint));
  if (hard.length === 0 || !hard.every((r) => r.constraint === "payment.budget")) return null;
  const overs = hard.map((r) => {
    const n = r.numbers;
    return n?.spentCents !== undefined && n.cartCents !== undefined && n.maxCents !== undefined ? n.spentCents + n.cartCents - n.maxCents : null;
  });
  return overs.some((o) => o === null) ? null : Math.max(...(overs as number[])); // the tightest budget decides
}

/** R40: a lifting approval clears a budget-only refusal, and only while the live overage stays within what Amara saw. */
const liftable = (reasons: Reason[], overCents: number | undefined): boolean => {
  const over = budgetOverage(reasons);
  return over !== null && overCents !== undefined && over <= overCents;
};

export function decide(
  grant: Grant, cart: Cart, ledger: LedgerView, now: Date,
  approval?: ApprovalGrant, cartHash?: string,
): Decision {
  const cartBad: Reason[] = Number.isFinite(cart.totalCents) && cart.totalCents >= 0 ? []
    : [{ constraint: "malformed_cart", detail: "Cart total is not a valid amount - failing closed" }];
  const all = [...cartBad, ...grant.constraints.flatMap((c) => evaluate(c, cart, ledger, now) ?? [])];

  const hash = cartHash ?? hashCart(cart);
  const approved = approval !== undefined && approval.cartHash === hash
    && now.getTime() <= Date.parse(approval.expiresAt);
  const cleared = approved ? all.filter((r) => !isApproval(r.constraint)) : all;
  const reasons = approved && approval.liftsBudget && liftable(cleared, approval.overCents) ? [] : cleared;

  const semanticRules = grant.constraints.some((c) =>
    c?.type === "checkout.semantic_category"
    && Array.isArray(c.merchantIds) && c.merchantIds.includes(cart.merchantId))
    ? ["checkout.semantic_category"] : [];

  const outcome = reasons.some((r) => !isApproval(r.constraint)) ? "REFUSE"
    : reasons.length > 0 ? "NEEDS_APPROVAL" : "ALLOW";
  return { outcome, reasons, semanticRules };
}
