// Decision 031: her goal at today's price (Channel3), facts only, never holding a page up, counted against the caps.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import type { Channel3Adapter } from "@/adapters/channel3/client";
import { createChannel3, type Channel3Like } from "@/adapters/channel3/client";
import { signGrant, revoke } from "@/flows/grant";
import { cachedGoalPriceCents, clearGoalPriceCache, goalPrice } from "@/flows/goalPrice";
import { setGoal, teenGoals } from "@/flows/teenGoals";
import { PRICE_CHECK_FAILED, cardSetsBack, goalPriceLine, priceStatusLine } from "@/ui/teenWords";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });
beforeEach(() => clearGoalPriceCache());

let n = 0;
const NOW = new Date("2026-11-04T12:00:00Z");
async function family(withRules = true) {
  n++;
  const fam = await repo.insertFamily(db, { name: "F", teenToken: `gp-${n}`, guardianName: "Amara", teenName: "Zoe" });
  await db.insert(t.merchants).values({ id: `gp-m${n}`, name: "Best Buy", domain: `gp${n}.example`, class: "general", opensAtLevel: 1, channel3WebsiteId: `gp${n}.example` });
  if (withRules) await signGrant({ db, now: async () => NOW }, fam.id, { level: 1 });
  await db.insert(t.goals).values({ familyId: fam.id, title: "Headphones", targetCents: 16999, channel3ProductId: "prod-1" });
  return fam.id;
}
const c3 = (over: Partial<Channel3Adapter> = {}): Channel3Adapter => ({
  retrieve: vi.fn(async (id: string, allowed: string[]) => ({ id, title: "Headphones", priceCents: 14999, domain: allowed[0], available: true, condition: "new" as const })),
  priceHistory: vi.fn(async () => ({ currentCents: 14999, status: "low" as const })),
  search: vi.fn(), lookup: vi.fn(), websites: vi.fn(), shopsSelling: vi.fn(), ...over,
}) as unknown as Channel3Adapter;
const historyCount = async (familyId: string) =>
  (await db.select().from(t.usage).where(and(eq(t.usage.familyId, familyId), eq(t.usage.kind, "price_history"))))[0]?.count ?? 0;

describe("goal price words (031)", () => {
  it("less, more, the same; weeks closer or further, plural right; no advice", () => {
    const base = { savedCents: 3400, commitmentCents: 1000, who: "you" };
    expect(goalPriceLine({ ...base, todayCents: 14999, pickedCents: 16999 })).toBe("$149.99 today, $20.00 less than when you picked it. That's 2 weeks closer.");
    expect(goalPriceLine({ ...base, todayCents: 17999, pickedCents: 16999 })).toBe("$179.99 today, $10.00 more than when you picked it. That's 1 week further.");
    expect(goalPriceLine({ ...base, todayCents: 16999, pickedCents: 16999 })).toBe("$169.99 today, the same as when you picked it.");
    expect(goalPriceLine({ ...base, todayCents: 16998, pickedCents: 16999 })).toBe("$169.98 today, $0.01 less than when you picked it."); // same week count
    expect(goalPriceLine({ ...base, commitmentCents: 0, todayCents: 14999, pickedCents: 16999 })).toBe("$149.99 today, $20.00 less than when you picked it.");
    expect(goalPriceLine({ ...base, who: "Zoe", todayCents: 14999, pickedCents: 16999 })).toBe("$149.99 today, $20.00 less than when Zoe picked it. That's 2 weeks closer.");
    expect(["low", "typical", "high"].map((s) => priceStatusLine(s as "low"))).toEqual([
      "Today's price is low for the last 90 days.", "Today's price is typical for the last 90 days.", "Today's price is high for the last 90 days.",
    ]);
    expect(PRICE_CHECK_FAILED).toBe("Couldn't check today's price.");
    for (const line of [goalPriceLine({ ...base, todayCents: 14999, pickedCents: 16999 }), priceStatusLine("low")]) expect(line).not.toMatch(/buy now|wait|should/i);
  });

  it("the card's sets-back line: from the full cost; nothing without a goal or once it's met", () => {
    const goal = { title: "Headphones", targetCents: 16999 };
    expect(cardSetsBack(goal, null, 3400, 2002, 1000)).toBe("This sets Headphones back 3 weeks.");
    expect(cardSetsBack(goal, 14999, 3400, 900, 1000)).toBe("This sets Headphones back 1 week.");
    expect(cardSetsBack(null, null, 0, 900, 1000)).toBeNull();
    expect(cardSetsBack(goal, 3000, 3400, 900, 1000)).toBeNull(); // today's price already saved for
    expect(cardSetsBack(goal, null, 3400, 900, 0)).toBeNull(); // no weekly promise to count with
  });
});

describe("goalPrice (031)", () => {
  it("today's price and the 90-day status, from her shops; the history call is counted once, then cached", async () => {
    const f = await family();
    const ch = c3();
    expect(await goalPrice({ db, channel3: ch }, f, { channel3ProductId: "prod-1" })).toEqual({ state: "ok", todayCents: 14999, status: "low" });
    expect(ch.retrieve).toHaveBeenCalledWith("prod-1", [`gp${n}.example`]);
    expect(await historyCount(f)).toBe(1);
    await goalPrice({ db, channel3: ch }, f, { channel3ProductId: "prod-1" });
    expect(ch.priceHistory).toHaveBeenCalledTimes(1);
    expect(ch.retrieve).toHaveBeenCalledTimes(1);
    expect(await historyCount(f)).toBe(1);
    expect(cachedGoalPriceCents("prod-1", [`gp${n}.example`])).toBe(14999);
  });

  it("no product behind the goal: nothing checked, nothing said", async () => {
    const f = await family();
    const ch = c3();
    expect(await goalPrice({ db, channel3: ch }, f, { channel3ProductId: null })).toEqual({ state: "none", todayCents: null, status: null });
    expect(ch.retrieve).not.toHaveBeenCalled();
  });

  it("not sold in her shops, Channel3 down, or no rules: 'failed' (the page keeps the stored price)", async () => {
    const f = await family();
    expect((await goalPrice({ db, channel3: c3({ retrieve: vi.fn(async () => null) }) }, f, { channel3ProductId: "prod-1" })).state).toBe("failed");
    clearGoalPriceCache();
    expect((await goalPrice({ db, channel3: c3({ retrieve: vi.fn(async () => { throw new Error("down"); }) }) }, f, { channel3ProductId: "prod-1" })).state).toBe("failed");
    const stopped = await family();
    await revoke({ db, now: async () => NOW, paypal: { request: vi.fn() } as never }, stopped);
    expect((await goalPrice({ db, channel3: c3() }, stopped, { channel3ProductId: "prod-1" })).state).toBe("failed");
  });

  it("a Channel3 that doesn't answer: back within the time limit, 'failed'", async () => {
    const f = await family();
    const hang = c3({ retrieve: vi.fn(() => new Promise<never>(() => undefined)) });
    const started = Date.now();
    expect((await goalPrice({ db, channel3: hang }, f, { channel3ProductId: "prod-1" }, Date.now(), 50)).state).toBe("failed");
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("no history, a failed history call, or the day's cap used up: the price still shows, without a status", async () => {
    const f = await family();
    expect(await goalPrice({ db, channel3: c3({ priceHistory: vi.fn(async () => null) }) }, f, { channel3ProductId: "prod-1" })).toEqual({ state: "ok", todayCents: 14999, status: null });
    clearGoalPriceCache();
    const failing = c3({ priceHistory: vi.fn(async () => { throw new Error("500"); }) });
    expect((await goalPrice({ db, channel3: failing }, f, { channel3ProductId: "prod-1" })).status).toBeNull();
    clearGoalPriceCache();
    await db.update(t.usage).set({ count: 60 }).where(and(eq(t.usage.familyId, f), eq(t.usage.kind, "price_history")));
    const ch = c3();
    expect((await goalPrice({ db, channel3: ch }, f, { channel3ProductId: "prod-1" })).status).toBeNull();
    expect(ch.priceHistory).not.toHaveBeenCalled();
  });

  it("a goal she names herself drops the Channel3 product (no stale price)", async () => {
    const f = await family();
    expect((await teenGoals(db, f, NOW)).goalProductId).toBe("prod-1");
    await setGoal({ db }, f, "A bike", 25000);
    expect((await teenGoals(db, f, NOW)).goalProductId).toBeNull();
  });
});

describe("Channel3 adapter: price history (031)", () => {
  it("maps the statistics; no retries; a short timeout; 404 or non-USD is 'no history'", async () => {
    const retrieveHistory = vi.fn(async () => ({ statistics: { current_price: 149.99, current_status: "typical" as "low" | "typical" | "high", currency: "USD", mean: 1, std_dev: 1, min_price: 1, max_price: 2 } }));
    const sdk = { products: {}, websites: {}, priceTracking: { retrieveHistory } } as unknown as Channel3Like;
    expect(await createChannel3(sdk).priceHistory!("prod-1", 4000)).toEqual({ currentCents: 14999, status: "typical" });
    expect(retrieveHistory).toHaveBeenCalledWith({ canonical_product_id: "prod-1", days: 90 }, { timeoutInSeconds: 4, maxRetries: 0 });
    retrieveHistory.mockRejectedValueOnce(Object.assign(new Error("HTTP 404"), { statusCode: 404 }));
    expect(await createChannel3(sdk).priceHistory!("prod-1", 4000)).toBeNull();
    retrieveHistory.mockResolvedValueOnce({ statistics: { current_price: 1, current_status: "low", currency: "EUR", mean: 1, std_dev: 1, min_price: 1, max_price: 1 } });
    expect(await createChannel3(sdk).priceHistory!("prod-1", 4000)).toBeNull();
  });
});
