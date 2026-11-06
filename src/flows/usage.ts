import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";

export type UsageKind = (typeof t.usage.kind.enumValues)[number];

/** Per-family DAILY caps (real time) on top of the hourly/5s throttle: the demo key is public, so model and Channel3 spend is bounded. */
export const DAILY_CAPS: Record<UsageKind, number> = { shop_agent: 150, shop_lookup: 400, month_ask: 60, fund_words: 300, shop_sites: 200, teen_shop_sites: 200, push: 200 };
export const DAILY_CAP_MESSAGE = "That's a lot for one day — try again tomorrow.";

/**
 * Counts one use and says whether it is allowed. One atomic upsert: the increment only happens while count < cap,
 * so concurrent requests cannot overshoot. A refused call is not counted. Call BEFORE any model/Channel3 call.
 */
export async function takeDaily(db: Db, familyId: string, kind: UsageKind, realNow: number = Date.now()): Promise<boolean> {
  const day = new Date(realNow).toISOString().slice(0, 10);
  const cap = DAILY_CAPS[kind];
  const res = await db.insert(t.usage).values({ familyId, kind, day, count: 1 }).onConflictDoUpdate({
    target: [t.usage.familyId, t.usage.kind, t.usage.day],
    set: { count: sql`${t.usage.count} + 1` },
    setWhere: sql`${t.usage.count} < ${cap}`,
  }).returning({ count: t.usage.count });
  return res.length > 0;
}
