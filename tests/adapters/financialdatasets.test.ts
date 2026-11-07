import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { DAILY_CAPS } from "@/flows/usage";
import {
  companyFacts, displayName, fetchCompanyFacts, fetchFundInside, fundInside, fundsCovered, toCompanyFacts, toFundInside,
} from "@/adapters/financialdatasets/client";
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
// The shape of a real /company/facts response (fields per the OpenAPI schema; values as Apple's filings give them).
const AAPL = { company_facts: {
  ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", industry: "Consumer Electronics", sector: "Technology", exchange: "NASDAQ",
  is_active: true, location: "Cupertino, CA", sec_filings_url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193",
  sic_code: "3571", sic_industry: "Electronic Computers", sic_sector: "Manufacturing",
} };
const answer = (a: Answer) => (typeof a === "function" ? a() : a.clone());

/** Fake Financial Datasets: the free tickers lists, then whatever `holdings` / `facts` answer for the paid calls. */
function fake(holdings: Answer = json(VTI), tickers = ["VTI", "SPY", "VOO"], facts: Answer = json(AAPL), companies = ["AAPL", "MSFT", "VTI", "SPY"]) {
  const f = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async (url) => {
    const u = new URL(String(url));
    if (u.pathname === "/index-funds/tickers/") return json({ tickers });
    if (u.pathname === "/index-funds/") return answer(holdings);
    if (u.pathname === "/company/facts/tickers/") return json({ resource: "company_facts", tickers: companies });
    if (u.pathname === "/company/facts") return answer(facts);
    return json({ error: "not faked" }, 404);
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const callsTo = (f: ReturnType<typeof fake>, path: string) => f.mock.calls.filter(([u]) => new URL(String(u)).pathname === path);
const paidCalls = (f: ReturnType<typeof fake>) => callsTo(f, "/index-funds/");
const factCalls = (f: ReturnType<typeof fake>) => callsTo(f, "/company/facts");

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

describe("toCompanyFacts (shaping a /company/facts response)", () => {
  it("keeps the plain facts: name without its suffix, sector, industry, where it's based; no employees unless given", () => {
    expect(toCompanyFacts(AAPL)).toEqual({
      name: "Apple", sector: "Technology", industry: "Consumer Electronics", location: "Cupertino, CA", employees: null,
    });
  });

  it("an employee count is kept when the response has one; blank fields become null", () => {
    const f = toCompanyFacts({ company_facts: { ...AAPL.company_facts, sector: "", location: null, number_of_employees: 164_000 } });
    expect(f).toMatchObject({ sector: null, location: null, employees: 164_000 });
  });

  it("refuses a response with no company name (so nothing empty is ever cached)", () => {
    expect(() => toCompanyFacts({})).toThrow();
    expect(() => toCompanyFacts({ company_facts: { ...AAPL.company_facts, name: " " } })).toThrow();
  });
});

describe("companyFacts", () => {
  it("returns a company's facts and takes one market_data use for the one paid call", async () => {
    const fam = await family();
    const f = fake();
    expect(await companyFacts("AAPL", fam)).toMatchObject({ name: "Apple", sector: "Technology" });
    expect(factCalls(f)).toHaveLength(1);
    expect(new URL(String(factCalls(f)[0][0])).search).toBe("?ticker=AAPL");
    expect(new Headers(factCalls(f)[0][1]?.headers).get("X-API-KEY")).toBe(KEY);
    expect(factCalls(f)[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(await used(fam)).toBe(1); // both free lists took nothing
  });

  it("a fund (on the index-funds list) never asks the paid company endpoint, even when the company list has it", async () => {
    const fam = await family();
    const f = fake();
    expect(await companyFacts("VTI", fam)).toBeNull();
    expect(factCalls(f)).toHaveLength(0);
    expect(await used(fam)).toBe(0);
  });

  it("a ticker the company list doesn't cover is null without a paid call", async () => {
    const fam = await family();
    const f = fake();
    expect(await companyFacts("ZZZZ", fam)).toBeNull();
    expect(factCalls(f)).toHaveLength(0);
    expect(await used(fam)).toBe(0);
  });

  it("a stock and a fund on one page: at most one paid call between them", async () => {
    const f = fake();
    const fam = await family();
    await Promise.all([companyFacts("AAPL", fam), fundInside("AAPL", fam)]);
    expect(paidCalls(f).length + factCalls(f).length).toBe(1);
    const fam2 = await family();
    await Promise.all([companyFacts("VTI", fam2), fundInside("VTI", fam2)]);
    expect(paidCalls(f).length + factCalls(f).length).toBe(2);
  });

  it("no key: null, without any call", async () => {
    delete process.env.FINANCIALDATASETS_API_KEY;
    const f = fake();
    expect(await companyFacts("AAPL", await family())).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("a 404, a timeout or a body with no name is null for the page, and the cached step throws (a miss is never kept)", async () => {
    for (const facts of [
      json({ error: "Not Found", message: "Ticker AAPL not found" }, 404),
      () => Promise.reject(new DOMException("The operation was aborted.", "AbortError")),
      json({ company_facts: {} }),
    ]) {
      const fam = await family();
      fake(json(VTI), undefined, facts);
      expect(await companyFacts("AAPL", fam)).toBeNull();
      await expect(fetchCompanyFacts("AAPL", fam)).rejects.toThrow();
    }
  });

  it("capped for today: null, and no paid call is made", async () => {
    const fam = await family();
    const day = new Date().toISOString().slice(0, 10);
    await db.insert(t.usage).values({ familyId: fam, kind: "market_data", day, count: DAILY_CAPS.market_data });
    const f = fake();
    expect(await companyFacts("AAPL", fam)).toBeNull();
    await expect(fetchCompanyFacts("AAPL", fam)).rejects.toThrow(/cap/i);
    expect(factCalls(f)).toHaveLength(0);
    expect(await used(fam)).toBe(DAILY_CAPS.market_data);
  });

  it("either free list failing hides the card rather than breaking the page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "down" }, 500)));
    expect(await companyFacts("AAPL", await family())).toBeNull();
  });
});
