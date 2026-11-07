import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";

export type UsageKind = (typeof t.usage.kind.enumValues)[number];

/** Per-family DAILY caps (real time) on top of the hourly/5s throttle: the demo key is public, so model and Channel3 spend is bounded. */
export const DAILY_CAPS: Record<UsageKind, number> = { shop_agent: 150, shop_lookup: 400, month_ask: 60, fund_words: 300, shop_sites: 200, teen_shop_sites: 200, push: 200, market_data: 40, market_news: 20 };
export const DAILY_CAP_MESSAGE = "That's a lot for one day — try again tomorrow.";

/**
 * The paid lookups (a model or a paid data API) that self-started families (decision 026) ALSO take from one shared
 * daily pot, the same size as one family's cap: 30 new families can't cost 30 times one family. Add new paid kinds here.
 */
export const POOLED_KINDS: readonly UsageKind[] = ["shop_agent", "shop_lookup", "month_ask", "fund_words", "market_data", "market_news"];

const utcDay = (realNow: number) => new Date(realNow).toISOString().slice(0, 10);

/**
 * Counts one use and says whether it is allowed. One atomic upsert: the increment only happens while count < cap,
 * so concurrent requests cannot overshoot. A refused call is not counted. Call BEFORE any model/Channel3 call.
 * A self-started family's paid lookups must also fit the shared pot (takePool).
 */
export async function takeDaily(db: Db, familyId: string, kind: UsageKind, realNow: number = Date.now()): Promise<boolean> {
  const day = utcDay(realNow);
  const cap = DAILY_CAPS[kind];
  const res = await db.insert(t.usage).values({ familyId, kind, day, count: 1 }).onConflictDoUpdate({
    target: [t.usage.familyId, t.usage.kind, t.usage.day],
    set: { count: sql`${t.usage.count} + 1` },
    setWhere: sql`${t.usage.count} < ${cap}`,
  }).returning({ count: t.usage.count });
  if (res.length === 0) return false;
  if (!POOLED_KINDS.includes(kind)) return true;
  // ponytail: a pot refusal leaves this family's own count one higher; it only ever errs toward fewer calls.
  const [f] = await db.select({ sub: t.families.paypalSub }).from(t.families).where(eq(t.families.id, familyId));
  return f?.sub ? takePool(db, kind, cap, realNow) : true;
}

/** One use of a site-wide daily counter (usage_pool), atomic like takeDaily: false once `cap` is reached today. */
export async function takePool(db: Db, kind: string, cap: number, realNow: number = Date.now()): Promise<boolean> {
  const res = await db.insert(t.usagePool).values({ kind, day: utcDay(realNow), count: 1 }).onConflictDoUpdate({
    target: [t.usagePool.kind, t.usagePool.day],
    set: { count: sql`${t.usagePool.count} + 1` },
    setWhere: sql`${t.usagePool.count} < ${cap}`,
  }).returning({ count: t.usagePool.count });
  return res.length > 0;
}
