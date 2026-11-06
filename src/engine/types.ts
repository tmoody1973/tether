export type Cents = number;
export type Outcome = "ALLOW" | "NEEDS_APPROVAL" | "REFUSE";

export interface CartItem { sku: string; title: string; qty: number; unitCents: Cents }
export interface Cart { merchantId: string; items: CartItem[]; totalCents: Cents; sourceUrl?: string }

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
}

export interface LedgerView {
  spentThisWeekCents: Cents; merchantsUsed: ReadonlySet<string>; savingsCents: Cents;
}

export interface Reason { constraint: string; detail: string; numbers?: Record<string, Cents> }
export interface Decision { outcome: Outcome; reasons: Reason[]; semanticRules: string[] }
/** R40: liftsBudget lets Amara's yes cover one over-budget cart, by at most overCents beyond the week. */
export interface ApprovalGrant { cartHash: string; expiresAt: string; liftsBudget?: boolean; overCents?: Cents }
