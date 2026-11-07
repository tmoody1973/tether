import { describe, it, expect } from "vitest";
import { fundWords, type FundFacts } from "@/ai/fundWords";
import type { Llm } from "@/ai/llm";

const change = (start: number, end: number, since: Date | null = null) => ({ startCents: start, endCents: end, pct: 0, since });
let n = 0;
/** The model sentence is cached per symbol, so every test uses a symbol of its own. */
const fresh = (over: Partial<FundFacts> = {}): FundFacts => ({
  name: "Vanguard S&P 500 ETF", symbol: `VOO${String.fromCharCode(65 + n++)}`, exchange: "ARCA", fractionable: true,
  oneYear: change(100000, 123450),
  compare: { thisFund: change(10000, 16000), market: change(10000, 15000), since: null },
  ...over,
});
const say = (text: string): Llm => ({ json: (async () => ({ text })) as Llm["json"] });
const ONE = "$1234.50 today, $1000.00 a year ago.";
const FIVE = "Over 5 years, $100 became: this $160, the whole market $150.";
const PLAIN = (f: FundFacts) => `Vanguard S&P 500 ETF (${f.symbol}) is listed on ARCA. It can be held in part-shares.`;

describe("fundWords", () => {
  it("null model gives description plus the two fixed sentences", async () => {
    const f = fresh();
    expect(await fundWords(null, f)).toBe(`${PLAIN(f)} ${ONE} ${FIVE}`);
  });
  it("clean model sentence passes; numeric sentences appended verbatim", async () => {
    const s = "Vanguard S&P 500 ETF trades on ARCA and comes in part-shares.";
    expect(await fundWords(say(s), fresh())).toBe(`${s} ${ONE} ${FIVE}`);
  });
  it.each(["It doubled.", "It beat the market.", "Up 5% this year.", "A great investment.", "A top pick.", "Buying is easy.",
    "It trades on ARCA ５.", "It has gains.", "Worth a look.", "Good fit for you.", "x".repeat(201), "See https://example.com", "See vanguard.com"])(
    "falls back on %s", async (s) => {
      const f = fresh();
      expect(await fundWords(say(s), f)).toBe(`${PLAIN(f)} ${ONE} ${FIVE}`);
    });
  it("over the daily cap (take ⇒ false) ⇒ plain description, no model call; a cached symbol never asks (I4)", async () => {
    let calls = 0;
    const counting: Llm = { json: (async () => { calls++; return { text: "Vanguard S&P 500 ETF trades on ARCA." }; }) as Llm["json"] };
    const f = fresh();
    expect(await fundWords(counting, f, async () => false)).toBe(`${PLAIN(f)} ${ONE} ${FIVE}`);
    expect(calls).toBe(0);
    let takes = 0;
    const take = async () => { takes++; return true; };
    await fundWords(counting, f, take);
    await fundWords(counting, f, take); // cached now
    expect([calls, takes]).toEqual([1, 1]);
  });
  it("falls back when the model throws", async () => {
    const f = fresh();
    const bad: Llm = { json: async () => { throw new Error("down"); } };
    expect(await fundWords(bad, f)).toBe(`${PLAIN(f)} ${ONE} ${FIVE}`);
  });
  it("model never sees the price values", async () => {
    const f = fresh();
    let seen = "";
    await fundWords({ json: (async (a: { user: string }) => { seen = a.user; return { text: "x" }; }) as Llm["json"] }, f);
    expect(JSON.parse(seen)).toEqual({ name: f.name, symbol: f.symbol, exchange: "ARCA", fractionable: true });
  });
  it("R42: a younger fund's sentences state their real span (the same copy as the fund page)", async () => {
    const since = new Date("2024-03-04T00:00:00Z");
    const f = fresh({ oneYear: change(5000, 6000, new Date("2026-07-01T00:00:00Z")), compare: { thisFund: change(10000, 13000, since), market: change(10000, 12000, since), since } });
    expect(await fundWords(null, f)).toBe(`${PLAIN(f)} $60.00 today, $50.00 when it started trading in July 2026. Since March 2024, $100 became: this $130, the whole market $120.`);
  });
  it("the validated model sentence is cached per symbol: the second call makes no model call", async () => {
    const s = "Vanguard S&P 500 ETF trades on ARCA and comes in part-shares.";
    let calls = 0;
    const llm: Llm = { json: (async () => { calls++; return { text: s }; }) as Llm["json"] };
    const f = fresh();
    expect(await fundWords(llm, f)).toBe(`${s} ${ONE} ${FIVE}`);
    expect(await fundWords(llm, { ...f, oneYear: undefined })).toBe(`${s} ${FIVE}`); // numbers still per call
    expect(calls).toBe(1);
  });
  it("a rejected model sentence isn't cached: the model is asked again next time", async () => {
    let calls = 0;
    const llm: Llm = { json: (async () => { calls++; return { text: "A great investment." }; }) as Llm["json"] };
    const f = fresh();
    await fundWords(llm, f); await fundWords(llm, f);
    expect(calls).toBe(2);
  });
});

describe("fundWords for a stock as well as a fund", () => {
  const capture = (text: string) => {
    const seen: { system?: string } = {};
    const llm: Llm = { json: (async (a: { system: string }) => { seen.system = a.system; return { text }; }) as unknown as Llm["json"] };
    return { llm, seen };
  };

  it("the prompt says it describes one fund or one company's stock, without a word its own check bans, and keeps every rule", async () => {
    const { llm, seen } = capture("Apple Inc. Common Stock is a single company's stock, traded on NASDAQ in part-shares.");
    await fundWords(llm, fresh({ name: "Apple Inc. Common Stock", exchange: "NASDAQ" }));
    expect(seen.system).toMatch(/You describe what one fund or one company's stock is, for a teenager, in one plain sentence\./);
    expect(seen.system).not.toMatch(/invest/i); // a model echoing the prompt's words must not be rejected for them
    expect(seen.system).toMatch(/no numbers, no comparisons, no opinions, no advice, no links/);
  });

  it("a plain sentence about a stock passes; the same banned words still fall back", async () => {
    const f = fresh({ name: "Apple Inc. Common Stock", exchange: "NASDAQ" });
    const s = "Apple Inc. Common Stock is a single company's stock, traded on NASDAQ in part-shares.";
    expect(await fundWords(say(s), f)).toBe(`${s} ${ONE} ${FIVE}`);
    for (const bad of ["Apple is a great company to buy.", "Apple beat the market.", "Apple grew a lot."]) {
      const g = fresh({ name: "Apple Inc. Common Stock", exchange: "NASDAQ" });
      expect(await fundWords(say(bad), g)).toBe(`Apple Inc. Common Stock (${g.symbol}) is listed on NASDAQ. It can be held in part-shares. ${ONE} ${FIVE}`);
    }
  });
});
