import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "./client";
import * as t from "./schema";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
const id = () => crypto.randomUUID();
// Drizzle returns plain objects from selects/returning; spread guards against proxies.
const plain = <T extends object>(r: T): T => ({ ...r });
const one = <T extends object>(rows: T[]): T | null => (rows[0] ? plain(rows[0]) : null);

export type Family = Row<typeof t.families>;
export type GrantRow = Row<typeof t.grants>;
export type PurchaseRow = Row<typeof t.purchases>;
export type PurchaseStatus = PurchaseRow["status"];
export type JournalRow = Row<typeof t.journal>;
export type ReceiptRow = Row<typeof t.receipts>;

export async function insertFamily(
  db: Db,
  v: Pick<Family, "name" | "teenToken" | "guardianName" | "teenName"> & Partial<Pick<Family, "id" | "clockOffsetMs">>,
): Promise<Family> {
  const [row] = await db.insert(t.families).values({ ...v, id: v.id ?? id() }).returning();
  return plain(row);
}

export async function getFamilyByTeenToken(db: Db, teenToken: string): Promise<Family | null> {
  return one(await db.select().from(t.families).where(eq(t.families.teenToken, teenToken)).limit(1));
}

export async function getActiveGrant(db: Db, familyId: string): Promise<GrantRow | null> {
  return one(
    await db.select().from(t.grants)
      .where(and(eq(t.grants.familyId, familyId), eq(t.grants.status, "active")))
      .orderBy(desc(t.grants.version)).limit(1),
  );
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

/** Atomic: true if this call recorded the token, false if it was already consumed. */
export async function consumeToken(db: Db, tokenId: string): Promise<boolean> {
  const rows = await db.insert(t.consumedTokens).values({ tokenId }).onConflictDoNothing().returning();
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

/** A guardian approval for this purchase and exact cart that has not expired at `now`. */
export async function getValidApproval(
  db: Db, purchaseId: string, cartHash: string, now: Date,
): Promise<Row<typeof t.approvals> | null> {
  return one(await db.select().from(t.approvals).where(and(
    eq(t.approvals.subject, "purchase"), eq(t.approvals.subjectId, purchaseId),
    eq(t.approvals.cartHash, cartHash), eq(t.approvals.result, "approved"), gt(t.approvals.expiresAt, now),
  )).orderBy(desc(t.approvals.expiresAt)).limit(1));
}


export interface MonthReceipt {
  at: Date; shop: string; amountCents: number; status: PurchaseStatus; ruleVersion: number; amaraApproved: boolean;
}

/** One family's receipts whose capture time falls in `month` ('YYYY-MM', UTC). Family always comes from the caller. */
export async function receiptsForMonth(db: Db, familyId: string, month: string): Promise<MonthReceipt[]> {
  const rows = await db.select({ r: t.receipts, p: t.purchases, m: t.merchants, a: t.approvals, j: t.journal })
    .from(t.receipts)
    .innerJoin(t.purchases, eq(t.purchases.id, t.receipts.purchaseId))
    .leftJoin(t.merchants, eq(t.merchants.id, sql`${t.purchases.cart}->>'merchantId'`))
    .leftJoin(t.approvals, eq(t.approvals.id, t.receipts.approvalId))
    .leftJoin(t.journal, and(eq(t.journal.kind, "spend"), eq(t.journal.ref, t.purchases.id)))
    .where(eq(t.purchases.familyId, familyId));
  // The spend journal row carries the demo-clock time; receipts.createdAt is wall-clock.
  const dated = rows.map((row) => ({ ...row, at: row.j?.at ?? row.r.createdAt }));
  return dated.filter(({ at }) => at.toISOString().startsWith(month)).map(({ r, p, m, a, at }) => ({
    at, shop: m?.name ?? "unknown shop", amountCents: p.cart.totalCents,
    status: p.status, ruleVersion: r.grantVersion, amaraApproved: a?.result === "approved",
  }));
}

/** Capture ids of every receipt belonging to this family (used to filter PayPal's shared merchant account). */
export async function captureIdsForFamily(db: Db, familyId: string): Promise<Set<string>> {
  const rows = await db.select({ id: t.receipts.captureId }).from(t.receipts)
    .innerJoin(t.purchases, eq(t.purchases.id, t.receipts.purchaseId))
    .where(eq(t.purchases.familyId, familyId));
  return new Set(rows.map((r) => r.id));
}
