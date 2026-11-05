import { describe, it, expect } from "vitest";
import { fundWords, type FundFacts } from "@/ai/fundWords";
import type { Llm } from "@/ai/llm";

const facts: FundFacts = {
  name: "Vanguard S&P 500 ETF", symbol: "VOO", exchange: "ARCA", fractionable: true,
  oneYear: { todayDollars: 1234.5, yearAgoDollars: 1000 },
  compare: { thisFundDollars: 160, marketDollars: 150 },
};
const say = (text: string): Llm => ({ json: (async () => ({ text })) as Llm["json"] });
const ONE = "$1234.50 today, $1000.00 a year ago.";
const FIVE = "Over 5 years, $100 became: this $160, the whole market $150.";
const PLAIN = "Vanguard S&P 500 ETF (VOO) is listed on ARCA. It can be held in part-shares.";

describe("fundWords", () => {
  it("null model gives description plus the two fixed sentences", async () => {
    expect(await fundWords(null, facts)).toBe(`${PLAIN} ${ONE} ${FIVE}`);
  });
  it("clean model sentence passes; numeric sentences appended verbatim", async () => {
    const s = "Vanguard S&P 500 ETF (VOO) trades on ARCA and comes in part-shares.";
    expect(await fundWords(say(s), facts)).toBe(`${s} ${ONE} ${FIVE}`);
  });
  it.each(["It doubled.", "It beat the market.", "Up 5% this year.", "A great investment.", "A top pick.", "Buying is easy.",
    "It trades on ARCA ５.", "It has gains.", "Worth a look.", "Good fit for you.", "x".repeat(201), "See https://example.com", "See vanguard.com"])(
    "falls back on %s", async (s) => {
      expect(await fundWords(say(s), facts)).toBe(`${PLAIN} ${ONE} ${FIVE}`);
    });
  it("falls back when the model throws", async () => {
    const bad: Llm = { json: async () => { throw new Error("down"); } };
    expect(await fundWords(bad, facts)).toBe(`${PLAIN} ${ONE} ${FIVE}`);
  });
  it("model never sees the price values", async () => {
    let seen = "";
    await fundWords({ json: (async (a: { user: string }) => { seen = a.user; return { text: "x" }; }) as Llm["json"] }, facts);
    expect(JSON.parse(seen)).toEqual({ name: facts.name, symbol: "VOO", exchange: "ARCA", fractionable: true });
  });
});
