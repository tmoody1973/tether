import { pgTable, text, integer, bigint, boolean, jsonb, timestamp, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Cart, Decision, Grant } from "@/engine/types";
import type { AuthToken } from "@/engine/token";
import type { ChargeArgs } from "@/adapters/paypal/orders";

/** The permission slip and order details a charge was sent with, plus the decision and approval it was debited under. */
export interface ChargeIntent { token: AuthToken; args: ChargeArgs; decision: Decision; approvalId: string | null }

/** The shared demo family's seeded end state (Task 19): what resetDemo puts back without charging PayPal again. */
export interface DemoSnapshot {
  now: string; // demo-clock time the seed ended at; reset puts the clock back here
  grant: Grant; // the rules in force at the end of the seed; reset re-installs them as a new version
  commitmentCents: number;
  goal: { title: string; targetCents: number; channel3ProductId: string | null };
  ask: { cart: Cart; note: string } | null; // the over-budget ask waiting on Amara's home (null: none could be found)
  shop: { domain: string; reason: string }; // the open shop suggestion
}

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = (name = "created_at") => ts(name).notNull().defaultNow();

export const families = pgTable("families", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  teenToken: text("teen_token").notNull().unique(),
  // Amara's private way in (R32): /g/enter/<guardianToken> sets her session cookie.
  guardianToken: text("guardian_token").notNull().unique().$defaultFn(() => randomBytes(24).toString("base64url")),
  clockOffsetMs: bigint("clock_offset_ms", { mode: "number" }).notNull().default(0),
  guardianName: text("guardian_name").notNull(),
  teenName: text("teen_name").notNull(),
  commitmentCents: integer("commitment_cents").notNull().default(0),
  pendingCommitmentCents: integer("pending_commitment_cents"), // takes effect at the next week close
  alpacaAccountId: text("alpaca_account_id"), // the family's one investing account, created once and reused
  // Zoe's latest nudge to Amara (demo clock). note null = "renew my rules"; text = she asked about something the rules can't pay for.
  teenNudgeAt: ts("teen_nudge_at"),
  teenNudgeNote: text("teen_nudge_note"),
  teenSeenLevelAt: ts("teen_seen_level_at"), // the level change Zoe last tapped "Nice" on; a newer one shows the level-up moment
  demo: jsonb("demo").$type<DemoSnapshot>(), // set only on the shared demo family
  // Demo reset: journal rows written (real time) in (from, to] stay on the record but no longer count in any total.
  ledgerVoidFrom: ts("ledger_void_from"),
  ledgerVoidTo: ts("ledger_void_to"),
  // Started with Log in with PayPal (decision 026). paypal_sub is PayPal's identity id, NOT unique: one parent may own
  // several families. All null on the demo family and on seeded ones; a family with paypal_sub set is "self-started".
  paypalSub: text("paypal_sub"),
  paypalPayerId: text("paypal_payer_id"),
  paypalEmail: text("paypal_email"),
  parentGivenName: text("parent_given_name"),
  createdAt: createdAt(), // REAL time; a self-started family is retired 7 days after this
  teenLinkSentAt: ts("teen_link_sent_at"), // Amara pressed Done on "Send Zoe the link": the first-run checklist's step 3
}, (f) => [index("families_paypal_sub_idx").on(f.paypalSub)]);

export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  class: text("class").notNull(),
  channel3WebsiteId: text("channel3_website_id"),
  paypalPayeeEmail: text("paypal_payee_email"),
  opensAtLevel: integer("opens_at_level").notNull(),
  addedByFamilyId: text("added_by_family_id"), // set for teen-suggested shops: visible to that family only
});

export const grants = pgTable("grants", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => families.id),
  version: integer("version").notNull(),
  level: integer("level").notNull(),
  body: jsonb("body").$type<Grant>().notNull(),
  signedAt: ts("signed_at").notNull(),
  expiresAt: ts("expires_at").notNull(),
  status: text("status", { enum: ["active", "expired", "revoked"] }).notNull(),
}, (g) => [uniqueIndex("grants_family_version_uq").on(g.familyId, g.version)]);

export const vault = pgTable("vault", {
  familyId: text("family_id").primaryKey().references(() => families.id),
  paymentTokenId: text("payment_token_id").notNull(),
  createdAt: createdAt(),
  deletedAt: ts("deleted_at"),
});

export const purchases = pgTable("purchases", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => families.id),
  cart: jsonb("cart").$type<Cart>().notNull(),
  cartHash: text("cart_hash").notNull(),
  decision: jsonb("decision").$type<Decision>().notNull(),
  status: text("status", {
    enum: ["proposed", "needs_approval", "approved", "refused", "paying", "paid", "failed", "expired"],
  }).notNull(),
  createdAt: createdAt(),
  // R37: what was sent to PayPal, kept so an unknown outcome can be re-sent with the same PayPal-Request-Id.
  charge: jsonb("charge").$type<ChargeIntent>(),
  chargeError: text("charge_error"), // last unknown-outcome error while the purchase stays `paying`
  // R38: REAL (wall-clock, never demo-clock) times. PayPal forgets a PayPal-Request-Id after 6 hours, after which
  // a re-send would charge again; the first send time bounds every re-send, the last attempt throttles resumes.
  chargeSentAt: ts("charge_sent_at"),
  chargeAttemptedAt: ts("charge_attempted_at"),
  paypalOrderId: text("paypal_order_id"), // stored as soon as create-order returns one: resume reads it back
});

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => families.id),
  subject: text("subject", { enum: ["purchase", "investment", "fund", "shop"] }).notNull(),
  subjectId: text("subject_id").notNull(),
  cartHash: text("cart_hash"),
  expiresAt: ts("expires_at").notNull(),
  result: text("result", { enum: ["approved", "declined"] }),
  decidedAt: ts("decided_at"),
  expiredAt: ts("expired_at"),
  note: text("note"),
  // R40: Amara's yes may cover one over-budget cart, by at most over_cents past the week (set from the refusal she saw).
  liftsBudget: boolean("lifts_budget").notNull().default(false),
  overCents: integer("over_cents"),
}, (a) => [uniqueIndex("approvals_one_open_uq").on(a.familyId, a.subject, a.subjectId)
  .where(sql`${a.result} is null and ${a.expiredAt} is null`)]);

export const consumedTokens = pgTable("consumed_tokens", {
  tokenId: text("token_id").primaryKey(),
  consumedAt: createdAt("consumed_at"),
  // R35: PayPal's custom_field carries the token id, so this is how a PayPal row is tied back to one family's purchase.
  purchaseId: text("purchase_id").references(() => purchases.id),
});

export const receipts = pgTable("receipts", {
  id: text("id").primaryKey(),
  purchaseId: text("purchase_id").notNull().references(() => purchases.id),
  captureId: text("capture_id").notNull(),
  grantId: text("grant_id").notNull().references(() => grants.id),
  grantVersion: integer("grant_version").notNull(),
  cartHash: text("cart_hash").notNull(),
  decision: jsonb("decision").$type<Decision>().notNull(),
  approvalId: text("approval_id").references(() => approvals.id),
  createdAt: createdAt(),
}, (r) => [uniqueIndex("receipts_capture_uq").on(r.captureId)]); // webhook + resume can never write two

export const journalKinds = ["spend", "spend_reversal", "week_close", "release", "invest", "invest_reversal"] as const;
export const journal = pgTable("journal", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => families.id),
  at: ts("at").notNull().defaultNow(),
  kind: text("kind", { enum: journalKinds }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  ref: text("ref"),
  note: text("note"),
  createdAt: createdAt(), // REAL time the row was written (`at` is the demo clock); a demo reset voids by this
}, (j) => [uniqueIndex("journal_invest_ref_uq").on(j.kind, j.ref).where(sql`${j.kind} in ('invest', 'invest_reversal')`)]);

export const weeks = pgTable("weeks", {
  familyId: text("family_id").notNull().references(() => families.id),
  weekKey: text("week_key").notNull(),
  allowanceCents: integer("allowance_cents").notNull(),
  commitmentCents: integer("commitment_cents").notNull(),
  closedAt: ts("closed_at"),
}, (t) => [primaryKey({ columns: [t.familyId, t.weekKey] })]);

export const goals = pgTable("goals", {
  familyId: text("family_id").primaryKey().references(() => families.id),
  title: text("title").notNull(),
  targetCents: integer("target_cents").notNull(),
  channel3ProductId: text("channel3_product_id"),
});

export const levelChanges = pgTable("level_changes", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => families.id),
  fromLevel: integer("from_level").notNull(),
  toLevel: integer("to_level").notNull(),
  by: text("by", { enum: ["engine", "guardian"] }).notNull(),
  reason: text("reason").notNull(),
  at: ts("at").notNull().defaultNow(),
});

export const releases = pgTable("releases", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => families.id),
  savedCents: integer("saved_cents").notNull(),
  matchCents: integer("match_cents").notNull(),
  confirmedAt: ts("confirmed_at"),
});

export const fundAllowlist = pgTable("fund_allowlist", {
  familyId: text("family_id").notNull().references(() => families.id),
  symbol: text("symbol").notNull(),
  addedAt: createdAt("added_at"),
}, (t) => [primaryKey({ columns: [t.familyId, t.symbol] })]);

export const fundProposals = pgTable("fund_proposals", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => families.id),
  symbol: text("symbol").notNull(),
  answers: jsonb("answers").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull(),
});

export const investments = pgTable("investments", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => families.id),
  symbol: text("symbol").notNull(),
  amountCents: integer("amount_cents").notNull(),
  answers: jsonb("answers").$type<Record<string, unknown>>().notNull(),
  status: text("status", {
    // expired (M3): Zoe asked, Amara's approval window ran out unanswered; nothing moved, she can ask again.
    enum: ["proposed", "approved", "depositing", "queued", "filled", "rejected", "cash_held", "needs_review", "expired"],
  }).notNull(),
  alpacaAccountId: text("alpaca_account_id"),
  transferId: text("transfer_id"),
  orderId: text("order_id"),
  debitedAt: ts("debited_at"), // real time of the debit; transfers are matched against it when a deposit outcome is unknown
  receiptNote: text("receipt_note"),
  retryCount: integer("retry_count").notNull().default(0), // index of the latest retry order client id
  error: text("error"), // last Alpaca error when the outcome is unknown or the order was rejected
});

/** Real-time daily usage counters for the public demo key (R45): one row per family, kind and UTC day. */
export const usage = pgTable("usage", {
  familyId: text("family_id").notNull().references(() => families.id),
  kind: text("kind", { enum: ["shop_agent", "shop_lookup", "month_ask", "fund_words", "shop_sites", "teen_shop_sites", "push", "market_data"] }).notNull(),
  day: text("day").notNull(), // YYYY-MM-DD, real UTC date (never the demo clock)
  count: integer("count").notNull().default(0),
}, (u) => [primaryKey({ columns: [u.familyId, u.kind, u.day] })]);

/**
 * Site-wide daily counters (real UTC day) for the public "start your own family" door: new families, new Alpaca
 * accounts, and the one shared pot of paid lookups every self-started family also draws from. Kind is free text.
 */
export const usagePool = pgTable("usage_pool", {
  kind: text("kind").notNull(),
  day: text("day").notNull(),
  count: integer("count").notNull().default(0),
}, (u) => [primaryKey({ columns: [u.kind, u.day] })]);

/**
 * Amara's own say over Zoe's shops, kept per family so it outlives any one set of rules: every grant built from a level
 * is that level's default shops plus the ones she added, minus the ones she removed. One row per shop: the latest choice.
 */
export const shopChoices = pgTable("shop_choices", {
  familyId: text("family_id").notNull().references(() => families.id),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  choice: text("choice", { enum: ["added", "removed"] }).notNull(),
  updatedAt: ts("updated_at").notNull(),
}, (s) => [primaryKey({ columns: [s.familyId, s.merchantId] })]);
