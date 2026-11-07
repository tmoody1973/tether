import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: () => testDb }));
let testDb: import("@/db/client").Db;
// 'use cache' is inert outside Next; cacheLife() would throw outside a cache scope, so it's a no-op here.
vi.mock("next/cache", () => ({ cacheLife: () => undefined }));
import { MockLanguageModelV4 } from "ai/test";
import { and, eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { askAboutMonth } from "@/ai/monthAssistant";
import type { Holding } from "@/flows/holdings";
import VTI from "../fixtures/fd-vti-holdings.json";
import AAPL_NEWS from "../fixtures/fd-aapl-news.json";

// Amara asks about Zoe's investments (decision 022): three read-only tools. fund_inside and news make paid Financial
// Datasets calls only for Zoe's own funds and the companies inside them. Never the real API: fetch is faked.

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
type Step = { calls: { name: string; input: object }[] } | { text: string };
function scripted(steps: Step[]) {
  let i = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const s = steps[Math.min(i++, steps.length - 1)];
      if ("text" in s) return { content: [{ type: "text" as const, text: s.text }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] };
      return {
        content: s.calls.map((c, n) => ({ type: "tool-call" as const, toolCallId: `c${i}-${n}`, toolName: c.name, input: JSON.stringify(c.input) })),
        finishReason: { unified: "tool-calls" as const, raw: undefined }, usage, warnings: [],
      };
    },
  });
}
const toolOutputs = (model: MockLanguageModelV4, call = 1) =>
  (model.doGenerateCalls[call].prompt as { role: string; content: unknown }[]).filter((m) => m.role === "tool")
    .flatMap((m) => m.content as { output: { value: unknown } }[]).map((c) => c.output.value);
const systemOf = (model: MockLanguageModelV4) =>
  JSON.stringify((model.doGenerateCalls[0].prompt as { role: string }[]).filter((m) => m.role === "system"));

type Answer = Response | (() => Promise<Response>);
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
function fakeFd(news: Answer = json(AAPL_NEWS)) {
  const f = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async (url) => {
    const u = new URL(String(url));
    if (u.pathname === "/index-funds/tickers/") return json({ tickers: ["VTI", "SPY", "VOO"] });
    if (u.pathname === "/index-funds/") return u.searchParams.get("ticker") === "VTI" ? json(VTI) : json({ error: "not found" }, 404);
    if (u.pathname === "/news") return typeof news === "function" ? news() : news.clone();
    return json({ error: "not faked" }, 404);
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const callsTo = (f: ReturnType<typeof fakeFd>, path: string) => f.mock.calls.filter(([u]) => new URL(String(u)).pathname === path);

const DEMO_NOW = new Date("2026-12-20T12:00:00Z");
const FILLED_AT = new Date("2026-11-06T15:00:00Z");
let db: Db;
let n = 0;
/** Zoe at Level 3 with VTI on her signed rules, VOO approved since; a filled VTI (two lots), a filled SPY, and others. */
async function family() {
  n++;
  const familyId = (await repo.insertFamily(db, { name: "F", teenToken: `inv-${n}`, guardianName: "Amara", teenName: "Zoe" })).id;
  const body = { id: `g-inv-${n}`, familyId, version: 1, level: 3 as const, weeklyCents: 2000, commitmentFloorPct: 10, matchPct: 100,
    constraints: [], fundAllowlist: ["VTI"], signedAt: "2026-11-01T00:00:00Z", expiresAt: "2027-01-01T00:00:00Z" };
  await repo.insertGrant(db, { id: body.id, familyId, version: 1, level: 3, body, signedAt: new Date(body.signedAt), expiresAt: new Date(body.expiresAt), status: "active" });
  await db.insert(t.fundAllowlist).values({ familyId, symbol: "VOO" });
  const inv = (id: string, symbol: string, amountCents: number, status: typeof t.investments.$inferInsert.status) =>
    ({ id: `${id}-${n}`, familyId, symbol, amountCents, status, answers: {}, alpacaAccountId: "ALPACA-ACCT-123456", orderId: `ORDER-${id}-${n}` });
  await db.insert(t.investments).values([
    inv("inv-vti-1", "VTI", 300, "filled"), inv("inv-vti-2", "VTI", 200, "filled"),
    inv("inv-spy", "SPY", 400, "filled"), // held but not on her list (the list changed since): still hers to ask about
    inv("inv-voo", "VOO", 300, "proposed"), inv("inv-q", "VTI", 250, "queued"),
    inv("inv-no", "VOO", 900, "rejected"), inv("inv-old", "VTI", 100, "expired"),
  ]);
  nOf.set(familyId, n);
  return familyId;
}
const nOf = new Map<string, number>();
const vtiHolding = (familyId: string): Holding => ({
  symbol: "VTI", shares: 0.013812345, putInCents: 500, worthCents: 500, since: FILLED_AT, daysHeld: 3, marketCents: null, line: null,
  words: { why: "I want a slice of everything", drop: "Wait" }, investmentIds: [`inv-vti-1-${nOf.get(familyId)}`, `inv-vti-2-${nOf.get(familyId)}`],
});
const fams = { a: "", b: "" };
const used = async (familyId: string) =>
  (await db.select().from(t.usage).where(and(eq(t.usage.familyId, familyId), eq(t.usage.kind, "market_data"))))[0]?.count ?? 0;

beforeAll(async () => {
  db = createDb("pglite:memory"); await migrateDb(db); testDb = db;
  fams.a = await family();
  fams.b = await family();
});
beforeEach(() => { process.env.FINANCIALDATASETS_API_KEY = "test-fd-key"; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.FINANCIALDATASETS_API_KEY; });

let lastModel: MockLanguageModelV4;
const ask = (steps: Step[], familyId = fams.a, holdings: Holding[] = [vtiHolding(familyId)]) =>
  askAboutMonth({ model: (lastModel = scripted(steps)), paypalTools: {}, db, now: DEMO_NOW, holdings: async () => holdings }, familyId, "q");
const once = (name: string, input: object = {}, familyId = fams.a, holdings?: Holding[]) =>
  ask([{ calls: [{ name, input }] }, { text: "ok" }], familyId, holdings);

describe("zoe_investments", () => {
  it("each fund she holds in dollars, plus what's still on its way in today's status words; nothing refused or lapsed", async () => {
    const r = await once("zoe_investments");
    expect(r.toolsUsed).toEqual(["zoe_investments"]);
    expect(toolOutputs(lastModel)).toEqual([{
      teen: "Zoe",
      holdings: [{ symbol: "VTI", shares: "0.0138", putIn: "5.00", worthNow: "5.00", firstBought: "2026-11-06", sameMoneyInWholeMarket: null, tooSoonToTell: true }],
      otherInvestments: [
        { symbol: "SPY", amount: "4.00", status: "Bought" }, // filled, but its price couldn't be read: still listed, never dropped
        { symbol: "VOO", amount: "3.00", status: "Waiting for you" },
        { symbol: "VTI", amount: "2.50", status: "Queued for market open" },
      ],
    }]);
  });

  it("the market comparison and too-soon flag follow the holding", async () => {
    await once("zoe_investments", {}, fams.a, [{ ...vtiHolding(fams.a), worthCents: 548, marketCents: 552, daysHeld: 400 }]);
    expect((toolOutputs(lastModel)[0] as { holdings: unknown[] }).holdings[0]).toMatchObject({ worthNow: "5.48", sameMoneyInWholeMarket: "5.52", tooSoonToTell: false });
  });

  it("carries no ids or account numbers", async () => {
    const r = await once("zoe_investments");
    const out = JSON.stringify(toolOutputs(lastModel)) + JSON.stringify(r.cards);
    expect(out).not.toMatch(new RegExp(`${fams.a}|inv-|ALPACA|ACCT|ORDER|[0-9a-f]{8}-[0-9a-f]{4}-`, "i"));
  });

  it("makes the investments card from the holdings, never from the model's text", async () => {
    const r = await ask([{ calls: [{ name: "zoe_investments", input: {} }] }, { text: "Zoe has $999 in EVIL." }]);
    expect(r.cards).toEqual([{ kind: "investments", teen: "Zoe", rows: [{ symbol: "VTI", shares: 0.0138, putInCents: 500, worthCents: 500, marketCents: null }] }]);
  });

  it("is only offered when the caller can read holdings", async () => {
    await askAboutMonth({ model: (lastModel = scripted([{ text: "ok" }])), paypalTools: {}, db, now: DEMO_NOW }, fams.a, "q");
    expect(lastModel.doGenerateCalls[0].tools?.map((x) => x.name)).not.toContain("zoe_investments");
  });
});

describe("fund_inside (only Zoe's funds: her list, or one she holds)", () => {
  it("refuses an off-list symbol without any call or use taken", async () => {
    for (const symbol of ["AAPL", "QQQ", "not a symbol", ""]) {
      const f = fakeFd();
      const r = await once("fund_inside", { symbol });
      expect(toolOutputs(lastModel)).toEqual([{ error: "That fund isn't on Zoe's list." }]);
      expect(f).not.toHaveBeenCalled();
      expect(r.cards).toEqual([]); // no card when the tool refused
    }
    expect(await used(fams.a)).toBe(0);
  });

  it("an on-list fund: one paid call, the rows with tickers, the top percent and as-of date, and a card", async () => {
    const f = fakeFd();
    const r = await once("fund_inside", { symbol: "vti" }, fams.b);
    expect(callsTo(f, "/index-funds/")).toHaveLength(1);
    expect(await used(fams.b)).toBe(1);
    const [out] = toolOutputs(lastModel) as { symbol: string; asOf: string; topPct: number; rows: { name: string; ticker: string; pct: number }[] }[];
    expect(out).toMatchObject({ symbol: "VTI", asOf: "2026-06-30", topPct: 32 });
    expect(out.rows[0]).toEqual({ name: "NVIDIA", ticker: "NVDA", pct: 6.4 });
    expect(r.cards).toEqual([{ kind: "inside", symbol: "VTI", asOf: "2026-06-30", rows: out.rows.map(({ name, pct }) => ({ name, pct })) }]);
  });

  it("a fund approved since the rules were signed, and one she only holds, are hers too", async () => {
    for (const symbol of ["VOO", "SPY"]) {
      const f = fakeFd();
      await once("fund_inside", { symbol });
      expect(callsTo(f, "/index-funds/tickers/")).toHaveLength(1); // looked up (Financial Datasets has no VOO/SPY rows here)
      expect(toolOutputs(lastModel)).toEqual([{ symbol, unavailable: `What's inside ${symbol} isn't available right now.` }]);
    }
  });
});

describe("news (market news, or a company inside one of Zoe's funds)", () => {
  it("no ticker: market news, five at most, title/source/date/url only, and a news card", async () => {
    const f = fakeFd();
    const r = await once("news");
    expect(new URL(String(callsTo(f, "/news")[0][0])).search).toBe("?limit=5");
    const [out] = toolOutputs(lastModel) as { ticker: null; articles: object[] }[];
    expect(out.ticker).toBeNull();
    expect(Object.keys(out.articles[0]).sort()).toEqual(["date", "source", "title", "url"]);
    expect(r.cards).toMatchObject([{ kind: "news", ticker: null }]);
  });

  it("a company inside one of her funds: one news call", async () => {
    const f = fakeFd();
    const r = await once("news", { ticker: "AAPL" });
    expect(callsTo(f, "/news").map(([u]) => new URL(String(u)).search)).toEqual(["?ticker=AAPL&limit=5"]);
    expect((toolOutputs(lastModel)[0] as { articles: unknown[] }).articles).toHaveLength(3);
    expect(r.cards).toMatchObject([{ kind: "news", ticker: "AAPL" }]);
  });

  it("a ticker that isn't hers or inside her funds: refused with no news call and no use taken for news", async () => {
    const fam = await family();
    const f = fakeFd();
    const r = await once("news", { ticker: "TSLAX" }, fam);
    expect(toolOutputs(lastModel)).toEqual([{ error: "That isn't one of Zoe's funds or a company inside them." }]);
    expect(callsTo(f, "/news")).toHaveLength(0);
    // The only use is VTI's holdings lookup, the weekly-cached call her fund page makes anyway (inert cache in tests).
    expect(await used(fam)).toBe(callsTo(f, "/index-funds/").length);
    expect(r.cards).toEqual([]);
  });

  it("a bad ticker never reaches Financial Datasets at all", async () => {
    const f = fakeFd();
    await once("news", { ticker: "<script>" });
    expect(toolOutputs(lastModel)).toEqual([{ error: "That isn't one of Zoe's funds or a company inside them." }]);
    expect(f).not.toHaveBeenCalled();
  });

  it("one of her funds: funds have no news of their own, so it says so without a call, and shows no card", async () => {
    const f = fakeFd();
    const r = await once("news", { ticker: "VTI" });
    expect(toolOutputs(lastModel)).toEqual([{ ticker: "VTI", articles: [], note: "Funds don't have their own news; ask about one of the companies inside it." }]);
    expect(f).not.toHaveBeenCalled();
    expect(r.cards).toEqual([]);
  });

  it("news unavailable (failing or capped): an explicit unavailable result, and no card", async () => {
    fakeFd(json({ error: "down" }, 500));
    const r = await once("news");
    expect(toolOutputs(lastModel)).toEqual([{ ticker: null, unavailable: "The news isn't available right now." }]);
    expect(r.cards).toEqual([]);
  });
});

describe("the prompt", () => {
  it("names the three tools and the no-advice rule, and keeps the old rules", async () => {
    await once("zoe_investments");
    const system = systemOf(lastModel);
    expect(system).toMatch(/zoe_investments/);
    expect(system).toMatch(/fund_inside/);
    expect(system).toMatch(/news/);
    expect(system).toContain("Facts only: never advise, predict, rank or say what she or Zoe should do.");
    expect(system).toContain("For news, say what the headlines are about; don't explain why a price moved beyond what the headlines say.");
    expect(system).toMatch(/one to three plain sentences/i);
  });
});
