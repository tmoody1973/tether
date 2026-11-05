import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { families } from "@/db/schema";

/** Demo clock: real time plus the family's offset. Pass realNow in tests. */
export async function now(db: Db, familyId: string, realNow: number = Date.now()): Promise<Date> {
  const [row] = await db.select({ off: families.clockOffsetMs }).from(families).where(eq(families.id, familyId));
  if (!row) throw new Error(`unknown family ${familyId}`);
  return new Date(realNow + row.off);
}

export async function advance(db: Db, familyId: string, ms: number): Promise<void> {
  await db.update(families)
    .set({ clockOffsetMs: sql`${families.clockOffsetMs} + ${ms}` })
    .where(eq(families.id, familyId));
}

/** Deps.now for app code: reads the family's offset on `conn` (the transaction, when inside one), else on `db`. */
export const clockFor = (db: Db) => (familyId: string, conn: Db = db): Promise<Date> => now(conn, familyId);
