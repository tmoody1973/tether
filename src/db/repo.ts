import { and, desc, eq } from "drizzle-orm";
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
  v: Omit<typeof t.journal.$inferInsert, "id" | "at"> & { at?: Date },
): Promise<JournalRow> {
  const [row] = await db.insert(t.journal).values({ ...v, id: id() }).returning();
  return plain(row);
}

export async function insertReceipt(db: Db, v: Omit<typeof t.receipts.$inferInsert, "id" | "createdAt">): Promise<ReceiptRow> {
  const [row] = await db.insert(t.receipts).values({ ...v, id: id() }).returning();
  return plain(row);
}

