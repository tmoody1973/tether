import { evaluate } from "./evaluate";
import { cartHash as hashCart } from "./hash";
import type { ApprovalGrant, Cart, Decision, Grant, LedgerView } from "./types";

const isApproval = (constraint: string) => constraint.startsWith("approval.");

export function decide(
  grant: Grant, cart: Cart, ledger: LedgerView, now: Date,
  approval?: ApprovalGrant, cartHash?: string,
): Decision {
  const all = grant.constraints.flatMap((c) => evaluate(c, cart, ledger, now) ?? []);

  const hash = cartHash ?? hashCart(cart);
  const approved = approval !== undefined && approval.cartHash === hash
    && now.getTime() <= Date.parse(approval.expiresAt);
  const reasons = approved ? all.filter((r) => !isApproval(r.constraint)) : all;

  const semanticRules = grant.constraints.some((c) =>
    c.type === "checkout.semantic_category"
    && Array.isArray(c.merchantIds) && c.merchantIds.includes(cart.merchantId))
    ? ["checkout.semantic_category"] : [];

  const outcome = reasons.some((r) => !isApproval(r.constraint)) ? "REFUSE"
    : reasons.length > 0 ? "NEEDS_APPROVAL" : "ALLOW";
  return { outcome, reasons, semanticRules };
}
