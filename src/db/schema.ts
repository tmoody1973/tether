import { pgTable, text, integer, bigint, jsonb, timestamp, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Cart, Decision, Grant } from "@/engine/types";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = (name = "created_at") => ts(name).notNull().defaultNow();

export const families = pgTable("families", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  teenToken: text("teen_token").notNull().unique(),
  clockOffsetMs: bigint("clock_offset_ms", { mode: "number" }).notNull().default(0),
  guardianName: text("guardian_name").notNull(),
  teenName: text("teen_name").notNull(),
});

export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  class: text("class").notNull(),
  channel3WebsiteId: text("channel3_website_id"),
  paypalPayeeEmail: text("paypal_payee_email"),
  opensAtLevel: integer("opens_at_level").notNull(),
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
}, (a) => [uniqueIndex("approvals_one_open_uq").on(a.familyId, a.subject, a.subjectId)
  .where(sql`${a.result} is null and ${a.expiredAt} is null`)]);

export const consumedTokens = pgTable("consumed_tokens", {
  tokenId: text("token_id").primaryKey(),
  consumedAt: createdAt("consumed_at"),
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
});

export const journalKinds = ["spend", "spend_reversal", "week_close", "release", "invest", "invest_reversal"] as const;
export const journal = pgTable("journal", {
  id: text("id").primaryKey(),
  familyId: text("family_id").notNull().references(() => families.id),
  at: ts("at").notNull().defaultNow(),
  kind: text("kind", { enum: journalKinds }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  ref: text("ref"),
  note: text("note"),
});

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
    enum: ["proposed", "approved", "depositing", "queued", "filled", "rejected"],
  }).notNull(),
  alpacaAccountId: text("alpaca_account_id"),
  transferId: text("transfer_id"),
  orderId: text("order_id"),
});
