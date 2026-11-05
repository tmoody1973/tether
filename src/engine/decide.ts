import { APPROVAL_CONSTRAINTS, evaluate } from "./evaluate";
import { cartHash as hashCart } from "./hash";
import type { ApprovalGrant, Cart, Decision, Grant, LedgerView, Reason } from "./types";

const isApproval = (constraint: string) => APPROVAL_CONSTRAINTS.has(constraint);

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
  const reasons = approved ? all.filter((r) => !isApproval(r.constraint)) : all;

  const semanticRules = grant.constraints.some((c) =>
    c?.type === "checkout.semantic_category"
    && Array.isArray(c.merchantIds) && c.merchantIds.includes(cart.merchantId))
    ? ["checkout.semantic_category"] : [];

  const outcome = reasons.some((r) => !isApproval(r.constraint)) ? "REFUSE"
    : reasons.length > 0 ? "NEEDS_APPROVAL" : "ALLOW";
  return { outcome, reasons, semanticRules };
}
