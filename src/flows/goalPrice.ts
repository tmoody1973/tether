// Decision 031: Zoe's goal at today's price, from Channel3. Facts only (no advice). Never holds a page up for long.
import type { Db } from "@/db/client";
import type { Channel3Adapter, PriceFacts } from "@/adapters/channel3/client";
import { takeDaily } from "@/flows/usage";
import { allowedShops } from "@/flows/teen";
import { peek, put } from "@/flows/goalPriceCache";

export { cachedGoalPriceCents, clearGoalPriceCache } from "@/flows/goalPriceCache";

/** Today's price (the free retrieve) gets this long. */
export const GOAL_PRICE_TIMEOUT_MS = 4_000;
/** The paid 90-day history gets less, on its own (review MEDIUM 1): it can never cost Zoe today's price. */
export const HISTORY_TIMEOUT_MS = 2_500;
/** A failed or slow history call is remembered this long, per product, so repeat visits don't pay for it again. */
const HISTORY_RETRY_MS = 15 * 60_000;

export interface GoalPrice {
  /** none: no Channel3 product behind the goal (she named it herself), so nothing is checked and nothing is said. */
  state: "ok" | "failed" | "none";
  todayCents: number | null;
  /** Only when Channel3's 90-day reading is about the price shown (review MEDIUM 2); else null and the line is left out. */
  status: PriceFacts["status"] | null;
}

/** `p`, or "late" once `ms` have passed. */
async function within<T>(p: Promise<T>, ms: number): Promise<T | "late"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => { timer = setTimeout(() => resolve("late"), ms); });
  try { return await Promise.race([p, late]); } finally { clearTimeout(timer); }
}

/** Channel3's tracked price is the price on screen, give or take 1% (at least a cent) for rounding. */
export const samePrice = (trackedCents: number, shownCents: number): boolean =>
  Math.abs(trackedCents - shownCents) <= Math.max(1, Math.round(shownCents / 100));

/**
 * Today's price of her goal from Channel3's free retrieve, restricted to her shops like every other lookup, within
 * GOAL_PRICE_TIMEOUT_MS; a failure, timeout, 404 or no offer in her shops gives "failed" and the page uses the stored
 * price. Alongside, on its own shorter budget, where the price sits in the last 90 days (a paid call, counted against
 * the family's daily caps, only when not cached). History never decides whether the price shows; its status is kept
 * only when it describes the price shown.
 */
export async function goalPrice(
  deps: { db: Db; channel3: Channel3Adapter }, familyId: string, goal: { channel3ProductId: string | null } | null,
  realNow = Date.now(), timeoutMs = GOAL_PRICE_TIMEOUT_MS, historyMs = HISTORY_TIMEOUT_MS,
): Promise<GoalPrice> {
  const productId = goal?.channel3ProductId;
  if (!productId) return { state: "none", todayCents: null, status: null };
  const failed: GoalPrice = { state: "failed", todayCents: null, status: null };
  const shops = await allowedShops(deps.db, familyId).catch(() => null);
  if (!shops || shops.domains.length === 0) return failed;
  const domains = [...shops.domains].sort();
  const history = historyFor(deps, familyId, productId, realNow, historyMs); // runs alongside, bounded on its own
  const key = `p:${productId}:${domains.join(",")}`;
  const hit = peek<{ priceCents: number } | null>(key, realNow);
  const product = hit ? hit.value : await within(deps.channel3.retrieve(productId, domains).then((v) => {
    put(key, v, realNow); // an answer (even "not in her shops") is cached; a throw isn't
    return v;
  }), timeoutMs).catch((err: unknown) => {
    console.error("goal price: Channel3 unavailable", err instanceof Error ? err.message : err);
    return null;
  });
  const facts = await history;
  if (!product || product === "late") return failed;
  const status = facts && samePrice(facts.currentCents, product.priceCents) ? facts.status : null;
  return { state: "ok", todayCents: product.priceCents, status };
}

/** The 90-day facts: cached for hours when answered, for 15 minutes when not, so a slow or failing call isn't paid twice. */
async function historyFor(
  deps: { db: Db; channel3: Channel3Adapter }, familyId: string, productId: string, realNow: number, ms: number,
): Promise<PriceFacts | null> {
  const key = `h:${productId}`;
  const hit = peek<PriceFacts | null>(key, realNow);
  if (hit) return hit.value;
  if (!deps.channel3.priceHistory || !(await takeDaily(deps.db, familyId, "price_history", realNow))) return null;
  const call = deps.channel3.priceHistory(productId, ms).then((v) => { put(key, v, realNow); return v; }); // a late answer still fills it
  const got = await within(call, ms).catch((err: unknown) => {
    console.error("goal price: history unavailable", err instanceof Error ? err.message : err);
    return "failed" as const;
  });
  if (got === "late" || got === "failed") {
    if (!peek(key, realNow)) put(key, null, realNow, HISTORY_RETRY_MS);
    return null;
  }
  return got;
}
