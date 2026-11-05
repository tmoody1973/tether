import type { Cart, Constraint, LedgerView, Reason } from "./types";

type Loose = Record<string, unknown>;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ids = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;

const malformed = (type: string): Reason =>
  ({ constraint: "malformed_constraint", detail: `Malformed ${type} constraint - failing closed` });

/** Constraint types that may yield NEEDS_APPROVAL (and only these). */
export const APPROVAL_CONSTRAINTS: ReadonlySet<string> = new Set([
  "approval.over_amount",
  "approval.first_time_merchant",
]);

/**
 * Returns a Reason when the constraint is violated, else null.
 * Fail closed: unknown types => `unknown_constraint`; known types with bad
 * fields => `malformed_constraint`. Neither is an approval reason, so an
 * approval can never clear them. `checkout.semantic_category` never fails on
 * the cart here (that is Gate 2's job) but must be well-formed.
 */
export function evaluate(constraint: Constraint, cart: Cart, ledger: LedgerView, now: Date): Reason | null {
  const c = constraint as Loose;
  if (typeof c?.type !== "string") {
    return { constraint: "unknown_constraint", detail: "UNKNOWN CONSTRAINT TYPE (missing type) - failing closed" };
  }
  const type = c.type;
  const total = cart.totalCents;
  switch (type) {
    case "payment.amount_range":
      if (!isNum(c.minCents) || !isNum(c.maxCents)) return malformed(type);
      if (total >= c.minCents && total <= c.maxCents) return null;
      return { constraint: type, detail: `Cart total ${total} is outside the allowed range`,
        numbers: { cartCents: total, minCents: c.minCents, maxCents: c.maxCents } };
    case "payment.budget": {
      if (!isNum(c.maxCents) || c.period !== "WEEKLY") return malformed(type);
      const spent = ledger.spentThisWeekCents;
      if (spent + total <= c.maxCents) return null;
      return { constraint: type, detail: "Purchase would exceed the weekly budget",
        numbers: { remainingCents: Math.max(0, c.maxCents - spent), spentCents: spent, maxCents: c.maxCents, cartCents: total } };
    }
    case "payment.allowed_payees": {
      const list = ids(c.merchantIds);
      if (!list) return malformed(type);
      return list.includes(cart.merchantId) ? null
        : { constraint: type, detail: `Merchant ${cart.merchantId} is not an allowed payee` };
    }
    case "payment.execution_date": {
      const from = Date.parse(String(c.notBefore));
      const to = Date.parse(String(c.notAfter));
      if (Number.isNaN(from) || Number.isNaN(to)) return malformed(type);
      const t = now.getTime();
      return t >= from && t <= to ? null : { constraint: type, detail: "Grant is not valid at this time" };
    }
    case "approval.over_amount":
      if (!isNum(c.overCents)) return malformed(type);
      if (total <= c.overCents) return null;
      return { constraint: type, detail: "Purchase is over the amount that needs approval",
        numbers: { cartCents: total, overCents: c.overCents } };
    case "approval.first_time_merchant":
      return ledger.merchantsUsed.has(cart.merchantId) ? null
        : { constraint: type, detail: `First purchase from ${cart.merchantId}` };
    case "checkout.semantic_category":
      return ids(c.merchantIds) ? null : malformed(type);
    default:
      return { constraint: "unknown_constraint", detail: `UNKNOWN CONSTRAINT TYPE ${type} - failing closed` };
  }
}
