// Decision 031: the goal-price cache, on its own so Zoe's week (flows/teen.ts) can read it without an import cycle.
// ponytail: one in-memory cache per server instance; keyed by product (and her shops for the price), never by family,
// so it can't leak one family's data to another. A shared cache (KV) if instances multiply.

/** Presentational facts, so a few hours is fine (the skill's caching guidance); prices aren't family data. */
export const CACHE_MS = 3 * 3_600_000;
const CACHE_MAX = 500;

const cache = new Map<string, { at: number; ttl: number; value: unknown }>();
export function put(key: string, value: unknown, realNow: number, ttl = CACHE_MS): void {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!); // oldest first
  cache.set(key, { at: realNow, ttl, value });
}
export function peek<T>(key: string, realNow: number): { value: T } | null {
  const hit = cache.get(key);
  return hit && realNow - hit.at < hit.ttl ? { value: hit.value as T } : null;
}
/** Tests only. */
export const clearGoalPriceCache = () => cache.clear();

/**
 * Today's goal price only if it's already cached (decision 031, step 6): suggestion cards and the after-purchase line use
 * it where it's known, and never wait on Channel3 for it. Null: not checked recently; use the stored price.
 */
export function cachedGoalPriceCents(productId: string | null, domains: string[], realNow = Date.now()): number | null {
  if (!productId) return null;
  return peek<{ priceCents: number } | null>(`p:${productId}:${[...domains].sort().join(",")}`, realNow)?.value?.priceCents ?? null;
}
