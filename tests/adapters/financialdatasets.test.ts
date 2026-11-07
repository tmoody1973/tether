import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { DAILY_CAPS } from "@/flows/usage";
import { displayName, fetchFundInside, fundInside, fundsCovered, toFundInside } from "@/adapters/financialdatasets/client";
import VTI from "../fixtures/fd-vti-holdings.json";

// 'use cache' is inert outside Next; cacheLife() would throw outside a cache scope, so it's a no-op here.
vi.mock("next/cache", () => ({ cacheLife: () => undefined }));

const KEY = "test-fd-key"; // never the real key: tests never call Financial Datasets
let db: Db;
beforeAll(async () => {
  process.env.DATABASE_URL = "pglite:memory";
  db = await getDb();
});
beforeEach(() => { process.env.FINANCIALDATASETS_API_KEY = KEY; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.FINANCIALDATASETS_API_KEY; });

type Answer = Response | (() => Promise<Response>);
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
/** Fake Financial Datasets: the free tickers list, then whatever `holdings` answers for /index-funds/?ticker=… */
function fake(holdings: Answer = json(VTI), tickers = ["VTI", "SPY", "VOO"]) {
  const f = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async (url) => {
    const u = new URL(String(url));
    if (u.pathname === "/index-funds/tickers/") return json({ tickers });
    if (u.pathname === "/index-funds/") return typeof holdings === "function" ? holdings() : holdings.clone();
    return json({ error: "not faked" }, 404);
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const paidCalls = (f: ReturnType<typeof fake>) => f.mock.calls.filter(([u]) => new URL(String(u)).pathname === "/index-funds/");

let n = 0;
async function family() {
  n++;
  return (await repo.insertFamily(db, { name: "F", teenToken: `fd-${n}`, guardianName: "Amara", teenName: "Zoe" })).id;
}
const used = async (familyId: string) =>
  (await db.select().from(t.usage).where(and(eq(t.usage.familyId, familyId), eq(t.usage.kind, "market_data"))))[0]?.count ?? 0;

describe("toFundInside (shaping a real VTI response)", () => {
  it("merges rows with the same name, strips company suffixes, sorts by share, and sums the ten it was given", () => {
    const inside = toFundInside(VTI);
    expect(inside.rows.map((r) => r.name)).toEqual([
      "NVIDIA", "Apple", "Alphabet", "Microsoft", "Amazon.com", "Broadcom", "Micron Technology", "Meta Platforms", "Tesla",
    ]);
    expect(inside.rows[2].pct).toBeCloseTo(2.895474860135 + 2.280013198965, 9); // GOOGL + GOOG
    expect(inside.topPct).toBeCloseTo(32.03, 2);
    expect(inside.asOf.toISOString()).toBe("2026-06-30T00:00:00.000Z");
  });

  it("strips a trailing Inc/Corp/Corporation/Ltd/Co/Plc and its punctuation, and only a trailing one", () => {
    expect(displayName("Apple Inc.")).toBe("Apple");
    expect(displayName("Foo, Inc.")).toBe("Foo");
    expect(displayName("Exxon Mobil Corporation")).toBe("Exxon Mobil");
    expect(displayName("Taiwan Semiconductor Manufacturing Co Ltd")).toBe("Taiwan Semiconductor Manufacturing");
    expect(displayName("Shell PLC")).toBe("Shell");
    expect(displayName("Corning Inc")).toBe("Corning");
    expect(displayName("Coinbase Global Inc Class A")).toBe("Coinbase Global Inc Class A");
  });

  it("refuses a response with no holdings or no date (so nothing empty is ever cached)", () => {
    expect(() => toFundInside({ ...VTI, holdings: [] })).toThrow();
    expect(() => toFundInside({ ...VTI, fund: { ...VTI.fund, as_of: "" } })).toThrow();
  });
});

describe("fundInside", () => {
  it("returns the fund's top holdings and takes one market_data use for the one paid call", async () => {
    const fam = await family();
    const f = fake();
    const inside = await fundInside("VTI", fam);
    expect(inside?.rows[0]).toEqual({ name: "NVIDIA", pct: 6.355382492074 });
    expect(paidCalls(f)).toHaveLength(1);
    expect(new URL(String(paidCalls(f)[0][0])).search).toBe("?ticker=VTI&limit=10&asset_class=equity");
    expect(await used(fam)).toBe(1); // the free tickers list took nothing
  });

  it("sends the key as X-API-KEY on every call", async () => {
    const f = fake();
    await fundInside("VTI", await family());
    expect(f.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const [, init] of f.mock.calls) expect(new Headers(init?.headers).get("X-API-KEY")).toBe(KEY);
  });

  it("a ticker it doesn't cover (a company) is null without a paid call or a use taken", async () => {
    const fam = await family();
    const f = fake();
    expect(await fundInside("AAPL", fam)).toBeNull();
    expect(paidCalls(f)).toHaveLength(0);
    expect(await used(fam)).toBe(0);
  });

  it("no key: null and an empty coverage list, without any call", async () => {
    delete process.env.FINANCIALDATASETS_API_KEY;
    const f = fake();
    expect(await fundInside("VTI", await family())).toBeNull();
    expect(await fundsCovered()).toEqual(new Set());
    expect(f).not.toHaveBeenCalled();
  });

  it("a 404, a timeout or a broken body is null for the page, and the cached step throws (a miss is never kept)", async () => {
    for (const answer of [
      json({ error: "not found" }, 404),
      () => Promise.reject(new DOMException("The operation was aborted.", "AbortError")),
      json({ fund: VTI.fund, holdings: [] }),
    ]) {
      const fam = await family();
      fake(answer);
      expect(await fundInside("VTI", fam)).toBeNull();
      await expect(fetchFundInside("VTI", fam)).rejects.toThrow();
    }
  });

  it("every call carries a timeout signal", async () => {
    const f = fake();
    await fundInside("VTI", await family());
    for (const [, init] of f.mock.calls) expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("capped for today: null, and no paid call is made", async () => {
    const fam = await family();
    const day = new Date().toISOString().slice(0, 10);
    await db.insert(t.usage).values({ familyId: fam, kind: "market_data", day, count: DAILY_CAPS.market_data });
    const f = fake();
    expect(await fundInside("VTI", fam)).toBeNull();
    await expect(fetchFundInside("VTI", fam)).rejects.toThrow(/cap/i);
    expect(paidCalls(f)).toHaveLength(0);
    expect(await used(fam)).toBe(DAILY_CAPS.market_data);
  });

  it("the tickers list failing hides the card rather than breaking the page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "down" }, 500)));
    expect(await fundsCovered()).toEqual(new Set());
    expect(await fundInside("VTI", await family())).toBeNull();
  });
});
