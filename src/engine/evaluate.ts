import type { Cart, Constraint, LedgerView, Reason } from "./types";

type Loose = Record<string, unknown>;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ids = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;

/**
 * Returns a Reason when the constraint is violated, else null.
 * Fail closed: every check is written as a positive "ok if ..." test, so a
 * malformed known constraint (missing/NaN fields) is a violation, never a pass.
 * `checkout.semantic_category` never fails here; it is Gate 2's job.
 */
export function evaluate(constraint: Constraint, cart: Cart, ledger: LedgerView, now: Date): Reason | null {
  const c = constraint as Loose;
  const total = cart.totalCents;
  switch (constraint.type) {
    case "payment.amount_range":
      if (isNum(c.minCents) && isNum(c.maxCents) && total >= c.minCents && total <= c.maxCents) return null;
      return { constraint: constraint.type, detail: `Cart total ${total} is outside the allowed range`,
        numbers: { cartCents: total, minCents: c.minCents as number, maxCents: c.maxCents as number } };
    case "payment.budget": {
      const spent = ledger.spentThisWeekCents;
      if (isNum(c.maxCents) && c.period === "WEEKLY" && spent + total <= c.maxCents) return null;
      const max = isNum(c.maxCents) ? c.maxCents : 0;
      return { constraint: constraint.type, detail: "Purchase would exceed the weekly budget",
        numbers: { remainingCents: Math.max(0, max - spent), spentCents: spent, maxCents: max, cartCents: total } };
    }
    case "payment.allowed_payees":
      if (ids(c.merchantIds)?.includes(cart.merchantId)) return null;
      return { constraint: constraint.type, detail: `Merchant ${cart.merchantId} is not an allowed payee` };
    case "payment.execution_date": {
      const t = now.getTime();
      if (t >= Date.parse(String(c.notBefore)) && t <= Date.parse(String(c.notAfter))) return null;
      return { constraint: constraint.type, detail: "Grant is not valid at this time" };
    }
    case "approval.over_amount":
      if (isNum(c.overCents) && total <= c.overCents) return null;
      return { constraint: constraint.type, detail: "Purchase is over the amount that needs approval",
        numbers: { cartCents: total, overCents: isNum(c.overCents) ? c.overCents : 0 } };
    case "approval.first_time_merchant":
      if (ledger.merchantsUsed.has(cart.merchantId)) return null;
      return { constraint: constraint.type, detail: `First purchase from ${cart.merchantId}` };
    case "checkout.semantic_category":
      return null;
    default:
      return { constraint: constraint.type, detail: "UNKNOWN CONSTRAINT TYPE - failing closed" };
  }
}
