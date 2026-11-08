export type Cents = number;
export type Outcome = "ALLOW" | "NEEDS_APPROVAL" | "REFUSE";

/** Decision 030: an offer's condition as Channel3 states it ("unknown" when it doesn't say). */
export type ItemCondition = "new" | "used" | "unknown";

/**
 * imageUrl: the product's Channel3 photo (https only), for display. condition: the offer's condition; re-read at settle,
 * so a change since Zoe saw it changes the cart's fingerprint and the purchase is refused (decision 030).
 */
export interface CartItem { sku: string; title: string; qty: number; unitCents: Cents; imageUrl?: string; condition?: ItemCondition }

/**
 * Decision 030: a cart priced under rules that carry cost estimates has itemsCents + estTaxCents + estShippingCents =
 * totalCents, and every check (budget, approvals, permission slip, PayPal) uses totalCents. Carts priced under older
 * rules, and investment carts, have no estimate fields: totalCents is the items alone. Build carts with `pricedCart`.
 */
export interface Cart {
  merchantId: string; items: CartItem[]; totalCents: Cents; sourceUrl?: string;
  itemsCents?: Cents; estTaxCents?: Cents; estShippingCents?: Cents;
}

/** Decision 030: what Amara set for estimating the real cost. Sales tax in basis points (8.25% = 825), shipping per order. */
export interface CostTerms { salesTaxBps: number; shippingCents: Cents }

/** Decision 030: Amara's standing consent. every: each purchase asks her. upTo: purchases over upToCents ask her (null: none do). */
export type SpendingMode = { mode: "every" } | { mode: "upTo"; upToCents: Cents | null };

export type Constraint =
  | { type: "payment.amount_range"; minCents: Cents; maxCents: Cents }
  | { type: "payment.budget"; maxCents: Cents; period: "WEEKLY" }
  | { type: "payment.allowed_payees"; merchantIds: string[] }
  | { type: "payment.execution_date"; notBefore: string; notAfter: string }
  | { type: "approval.over_amount"; overCents: Cents }
  | { type: "approval.first_time_merchant" }
  | { type: "checkout.semantic_category"; merchantIds: string[]; rule: "BOOKS_ONLY" }
  | { type: string; [k: string]: unknown };

export interface Grant {
  id: string; familyId: string; version: number; level: 1 | 2 | 3;
  weeklyCents: Cents; commitmentFloorPct: number; matchPct: number;
  constraints: Constraint[]; fundAllowlist: string[]; signedAt: string; expiresAt: string;
  /**
   * Decision 029: a weekly-amount change waits for next week. Until `until` (the next Monday 00:00 UTC after signing)
   * the weekly amount is still `weeklyCents` from the rules these replaced. Read a grant through `asOf`, never directly.
   */
  thisWeek?: { weeklyCents: Cents; until: string };
  /** Decision 030: Amara's chosen spending mode. Absent: the level's own approval rule. Turned into approval constraints. */
  spending?: SpendingMode;
  /** Decision 030: false = Amara turned investing off. Absent or true: on wherever the level allows it. */
  investing?: boolean;
  /** Decision 030: cost estimates for every cart priced under these rules. Absent (older rules): no estimates. */
  costs?: CostTerms;
}

export interface LedgerView {
  spentThisWeekCents: Cents; merchantsUsed: ReadonlySet<string>; savingsCents: Cents;
}

export interface Reason { constraint: string; detail: string; numbers?: Record<string, Cents> }
export interface Decision {
  outcome: Outcome; reasons: Reason[]; semanticRules: string[];
  /** I4: the refusal sentence Zoe was shown, stored the first time it's written so a re-render asks no model. */
  explained?: string;
}
/** R40: liftsBudget lets Amara's yes cover one over-budget cart, by at most overCents beyond the week. */
export interface ApprovalGrant { cartHash: string; expiresAt: string; liftsBudget?: boolean; overCents?: Cents }
