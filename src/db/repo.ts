import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "./client";
import * as t from "./schema";
import { counted } from "@/ledger/ledger";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
const id = () => crypto.randomUUID();
// Drizzle returns plain objects from selects/returning; spread guards against proxies.
const plain = <T extends object>(r: T): T => ({ ...r });
const one = <T extends object>(rows: T[]): T | null => (rows[0] ? plain(rows[0]) : null);

export type Family = Row<typeof t.families>;
/** Key prefix of a demo family a re-seed archived: its records stay, its old guardian cookies count as signed out. */
export const ARCHIVED_PREFIX = "archived-";
export type GrantRow = Row<typeof t.grants>;
export type PurchaseRow = Row<typeof t.purchases>;
export type PurchaseStatus = PurchaseRow["status"];
export type JournalRow = Row<typeof t.journal>;
export type ReceiptRow = Row<typeof t.receipts>;

export async function insertFamily(
  db: Db,
  v: Pick<Family, "name" | "teenToken" | "guardianName" | "teenName"> & Partial<Pick<Family, "id" | "clockOffsetMs" | "guardianToken">>,
): Promise<Family> {
  const [row] = await db.insert(t.families).values({ ...v, id: v.id ?? id() }).returning();
  return plain(row);
}

export async function getFamilyByTeenToken(db: Db, teenToken: string): Promise<Family | null> {
  return one(await db.select().from(t.families).where(eq(t.families.teenToken, teenToken)).limit(1));
}

export async function getFamily(db: Db, familyId: string): Promise<Family | null> {
  return one(await db.select().from(t.families).where(eq(t.families.id, familyId)).limit(1));
}

export async function getFamilyByGuardianToken(db: Db, guardianToken: string): Promise<Family | null> {
  if (!guardianToken) return null;
  return one(await db.select().from(t.families).where(eq(t.families.guardianToken, guardianToken)).limit(1));
}

export async function getActiveGrant(db: Db, familyId: string): Promise<GrantRow | null> {
  return one(
    await db.select().from(t.grants)
      .where(and(eq(t.grants.familyId, familyId), eq(t.grants.status, "active")))
      .orderBy(desc(t.grants.version)).limit(1),
  );
}

/** The newest grant whatever its status: after a revoke there is no active grant, but her level is still this one's. */
export async function getLatestGrant(db: Db, familyId: string): Promise<GrantRow | null> {
  return one(await db.select().from(t.grants).where(eq(t.grants.familyId, familyId)).orderBy(desc(t.grants.version)).limit(1));
}

export async function insertGrant(db: Db, v: Omit<typeof t.grants.$inferInsert, "id"> & { id?: string }): Promise<GrantRow> {
  const [row] = await db.insert(t.grants).values({ ...v, id: v.id ?? id() }).returning();
  return plain(row);
}

export async function insertPurchase(db: Db, v: Omit<typeof t.purchases.$inferInsert, "id" | "createdAt">): Promise<PurchaseRow> {
  const [row] = await db.insert(t.purchases).values({ ...v, id: id() }).returning();
  return plain(row);
}

export async function updatePurchaseStatus(db: Db, purchaseId: string, status: PurchaseStatus): Promise<PurchaseRow | null> {
  return one(await db.update(t.purchases).set({ status }).where(eq(t.purchases.id, purchaseId)).returning());
}

/** Atomic: true if this call recorded the token, false if it was already consumed. `purchaseId` ties it to a family (R35). */
export async function consumeToken(db: Db, tokenId: string, purchaseId: string | null = null): Promise<boolean> {
  const rows = await db.insert(t.consumedTokens).values({ tokenId, purchaseId }).onConflictDoNothing().returning();
  return rows.length > 0;
}

export async function appendJournal(
  db: Db,
  v: Omit<typeof t.journal.$inferInsert, "id" | "at"> & { at: Date }, // demo-clock time, always caller-supplied
): Promise<JournalRow> {
  const [row] = await db.insert(t.journal).values({ ...v, id: id() }).returning();
  return plain(row);
}

export async function insertReceipt(db: Db, v: Omit<typeof t.receipts.$inferInsert, "id" | "createdAt">): Promise<ReceiptRow> {
  const [row] = await db.insert(t.receipts).values({ ...v, id: id() }).returning();
  return plain(row);
}

/** Idempotent on capture id (unique index): the webhook and a resume can never write two receipts for one capture. */
export async function insertReceiptOnce(db: Db, v: Omit<typeof t.receipts.$inferInsert, "id" | "createdAt">): Promise<void> {
  await db.insert(t.receipts).values({ ...v, id: id() }).onConflictDoNothing({ target: t.receipts.captureId });
}

export async function getReceiptByCaptureId(db: Db, captureId: string): Promise<ReceiptRow | null> {
  return one(await db.select().from(t.receipts).where(eq(t.receipts.captureId, captureId)).limit(1));
}

export async function getPurchase(db: Db, purchaseId: string): Promise<PurchaseRow | null> {
  return one(await db.select().from(t.purchases).where(eq(t.purchases.id, purchaseId)).limit(1));
}

/** Compare-and-set: moves the purchase only if it is currently in `from`. Null if it was not. */
export async function transitionPurchase(
  db: Db, purchaseId: string, from: PurchaseStatus, to: PurchaseStatus,
): Promise<PurchaseRow | null> {
  return one(await db.update(t.purchases).set({ status: to })
    .where(and(eq(t.purchases.id, purchaseId), eq(t.purchases.status, from))).returning());
}

export async function getMerchant(db: Db, merchantId: string): Promise<Row<typeof t.merchants> | null> {
  return one(await db.select().from(t.merchants).where(eq(t.merchants.id, merchantId)).limit(1));
}

export async function getVault(db: Db, familyId: string): Promise<Row<typeof t.vault> | null> {
  return one(await db.select().from(t.vault)
    .where(and(eq(t.vault.familyId, familyId), isNull(t.vault.deletedAt))).limit(1));
}

/** Stores (or replaces) the family's saved-PayPal reference; a new save clears an earlier revoke. */
export async function saveVault(db: Db, familyId: string, paymentTokenId: string): Promise<void> {
  await db.insert(t.vault).values({ familyId, paymentTokenId })
    .onConflictDoUpdate({ target: t.vault.familyId, set: { paymentTokenId, deletedAt: null, createdAt: sql`now()` } });
}

/** A guardian approval for this purchase and exact cart that has not expired at `now`. */
export async function getValidApproval(
  db: Db, purchaseId: string, cartHash: string, now: Date,
): Promise<Row<typeof t.approvals> | null> {
  return one(await db.select().from(t.approvals).where(and(
    eq(t.approvals.subject, "purchase"), eq(t.approvals.subjectId, purchaseId),
    eq(t.approvals.cartHash, cartHash), eq(t.approvals.result, "approved"), gt(t.approvals.expiresAt, now),
  )).orderBy(desc(t.approvals.expiresAt)).limit(1));
}


/** One line of what she bought. The title comes from the shop (via Channel3): untrusted text, shown as data only. */
export type ReceiptItem = { title: string; qty: number };
const ITEM_TITLE_MAX = 80;
/** A cart's items for Amara and the month assistant: titles trimmed to 80 characters, with quantities. */
export const cartItems = (cart: PurchaseRow["cart"]): ReceiptItem[] =>
  cart.items.map((i) => ({ title: i.title.trim().slice(0, ITEM_TITLE_MAX), qty: i.qty }));

export interface MonthReceipt {
  at: Date; shop: string; items: ReceiptItem[]; amountCents: number; status: PurchaseStatus; ruleVersion: number; amaraApproved: boolean;
  purchaseId: string; captureId: string; grantId: string; cartHash: string; approvalId: string | null;
  /** Set aside by a demo reset: still a real PayPal charge on the record, but it counts in no total (R44). */
  setAside: boolean;
}

/** One family's receipts whose capture time falls in `month` ('YYYY-MM', UTC), oldest first. Family always comes from the caller. */
export async function receiptsForMonth(db: Db, familyId: string, month: string): Promise<MonthReceipt[]> {
  const rows = await db.select({ r: t.receipts, p: t.purchases, m: t.merchants, a: t.approvals, j: t.journal, counts: sql<boolean>`${counted}` })
    .from(t.receipts)
    .innerJoin(t.purchases, eq(t.purchases.id, t.receipts.purchaseId))
    .leftJoin(t.merchants, eq(t.merchants.id, sql`${t.purchases.cart}->>'merchantId'`))
    .leftJoin(t.approvals, eq(t.approvals.id, t.receipts.approvalId))
    .leftJoin(t.journal, and(eq(t.journal.kind, "spend"), eq(t.journal.ref, t.purchases.id)))
    .where(eq(t.purchases.familyId, familyId));
  // The spend journal row carries the demo-clock time; receipts.createdAt is wall-clock.
  const dated = rows.map((row) => ({ ...row, at: row.j?.at ?? row.r.createdAt }));
  return dated.filter(({ at }) => at.toISOString().startsWith(month))
    .sort((x, y) => x.at.getTime() - y.at.getTime())
    .map(({ r, p, m, a, at, counts }) => ({
      at, shop: m?.name ?? "unknown shop", items: cartItems(p.cart), amountCents: p.cart.totalCents,
      status: p.status, ruleVersion: r.grantVersion, amaraApproved: a?.result === "approved",
      purchaseId: p.id, captureId: r.captureId, grantId: r.grantId, cartHash: r.cartHash, approvalId: r.approvalId,
      setAside: !counts,
    }));
}

/** One family's latest `n` receipts from any month, newest first, leaving out demo-reset rows (Home's "Recent"). */
export async function recentReceipts(db: Db, familyId: string, n: number): Promise<MonthReceipt[]> {
  // ponytail: reads every receipt of the family ("" matches every month); fine at family scale, LIMIT in SQL if not.
  return (await receiptsForMonth(db, familyId, "")).filter((r) => !r.setAside).slice(-n).reverse();
}

/** This family's permission-slip tokens (the token id is what PayPal echoes back as custom_field), with when each was used. */
export async function purchaseTokensForFamily(
  db: Db, familyId: string,
): Promise<{ tokenId: string; purchaseId: string; consumedAt: Date }[]> {
  return db.select({ tokenId: t.consumedTokens.tokenId, purchaseId: t.purchases.id, consumedAt: t.consumedTokens.consumedAt })
    .from(t.consumedTokens)
    .innerJoin(t.purchases, eq(t.purchases.id, t.consumedTokens.purchaseId))
    .where(eq(t.purchases.familyId, familyId));
}
