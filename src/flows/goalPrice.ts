// Decision 031: Zoe's goal at today's price, from Channel3. Facts only (no advice). Never holds a page up for long.
import type { Db } from "@/db/client";
import type { Channel3Adapter, PriceFacts } from "@/adapters/channel3/client";
import { takeDaily } from "@/flows/usage";
import { allowedShops } from "@/flows/teen";

export const GOAL_PRICE_TIMEOUT_MS = 4_000;
/** Presentational facts, so a few hours is fine (the skill's caching guidance); prices aren't family data. */
const CACHE_MS = 3 * 3_600_000;
const CACHE_MAX = 500;

export interface GoalPrice {
  /** none: no Channel3 product behind the goal (she named it herself), so nothing is checked and nothing is said. */
  state: "ok" | "failed" | "none";
  todayCents: number | null;
  status: PriceFacts["status"] | null;
}

// ponytail: one in-memory cache per server instance; keyed by product (and her shops for the price), never by family,
// so it can't leak one family's data to another. A shared cache (KV) if instances multiply.
const cache = new Map<string, { at: number; value: unknown }>();
function put(key: string, value: unknown, realNow: number): void {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!); // oldest first
  cache.set(key, { at: realNow, value });
}
async function cached<T>(key: string, realNow: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && realNow - hit.at < CACHE_MS) return hit.value as T;
  const value = await load(); // a throw isn't cached
  put(key, value, realNow);
  return value;
}
/** Tests only. */
export const clearGoalPriceCache = () => cache.clear();

/**
 * Today's price of her goal from Channel3's free retrieve, restricted to her shops like every other lookup, and where
 * it sits in the last 90 days (a paid call, counted against the family's daily caps, only when not cached). Both run
 * together under one deadline. Any failure, timeout, 404 or empty answer gives "failed" and the page uses the stored
 * price; a capped or missing history just leaves the status out.
 */
export async function goalPrice(
  deps: { db: Db; channel3: Channel3Adapter }, familyId: string, goal: { channel3ProductId: string | null } | null,
  realNow = Date.now(), timeoutMs = GOAL_PRICE_TIMEOUT_MS,
): Promise<GoalPrice> {
  const productId = goal?.channel3ProductId;
  if (!productId) return { state: "none", todayCents: null, status: null };
  const failed: GoalPrice = { state: "failed", todayCents: null, status: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"late">((resolve) => { timer = setTimeout(() => resolve("late"), timeoutMs); });
  const work = (async (): Promise<GoalPrice> => {
    const shops = await allowedShops(deps.db, familyId);
    if (!shops || shops.domains.length === 0) return failed;
    const domains = [...shops.domains].sort();
    const [product, history] = await Promise.all([
      cached(`p:${productId}:${domains.join(",")}`, realNow, () => deps.channel3.retrieve(productId, domains)),
      historyFor(deps, familyId, productId, realNow, timeoutMs),
    ]);
    if (!product) return failed;
    return { state: "ok", todayCents: product.priceCents, status: history?.status ?? null };
  })().catch((err: unknown) => {
    console.error("goal price: Channel3 unavailable", err instanceof Error ? err.message : err);
    return failed;
  });
  const out = await Promise.race([work, deadline]);
  clearTimeout(timer);
  return out === "late" ? failed : out;
}

async function historyFor(
  deps: { db: Db; channel3: Channel3Adapter }, familyId: string, productId: string, realNow: number, timeoutMs: number,
): Promise<PriceFacts | null> {
  const key = `h:${productId}`;
  const hit = cache.get(key);
  if (hit && realNow - hit.at < CACHE_MS) return hit.value as PriceFacts | null;
  if (!deps.channel3.priceHistory || !(await takeDaily(deps.db, familyId, "price_history", realNow))) return null;
  // Only an answer is cached (history or "none"); a failure is tried again next time.
  const value = await deps.channel3.priceHistory(productId, timeoutMs).catch((err: unknown) => {
    console.error("goal price: history unavailable", err instanceof Error ? err.message : err);
    return undefined;
  });
  if (value !== undefined) put(key, value, realNow);
  return value ?? null;
}

/**
 * Today's goal price only if it's already cached (decision 031, step 6): the shop's suggestion cards use it where it's
 * known, and never wait on Channel3 for it. Null: not checked recently; use the stored price.
 */
export function cachedGoalPriceCents(productId: string | null, domains: string[], realNow = Date.now()): number | null {
  if (!productId) return null;
  const hit = cache.get(`p:${productId}:${[...domains].sort().join(",")}`);
  const value = hit && realNow - hit.at < CACHE_MS ? (hit.value as { priceCents: number } | null) : null;
  return value?.priceCents ?? null;
}
