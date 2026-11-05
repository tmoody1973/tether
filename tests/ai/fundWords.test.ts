import { describe, it, expect } from "vitest";
import { fundWords, type FundFacts } from "@/ai/fundWords";
import type { Llm } from "@/ai/llm";

const facts: FundFacts = {
  name: "Vanguard Total Stock Market ETF", symbol: "VTI", exchange: "ARCA", fractionable: true,
  oneYear: { todayDollars: 1234.5, yearAgoDollars: 1000 },
  compare: { thisFundDollars: 160, marketDollars: 150 },
};
const say = (text: string): Llm => ({ json: (async () => ({ text })) as Llm["json"] });
const TEMPLATE_START = "Vanguard Total Stock Market ETF (VTI) is listed on ARCA.";

describe("fundWords", () => {
  it("null model gives the plain template", async () => {
    const t = await fundWords(null, facts);
    expect(t).toContain(TEMPLATE_START);
    expect(t).toContain("$1234.50 today, $1000.00 a year ago.");
    expect(t).toContain("Over 5 years, $100 became: this $160, the whole market $150.");
  });
  it("uses a valid model sentence (number forms normalised)", async () => {
    const s = "VTI trades on ARCA. It was $1,234.50 today and $1000 a year ago.";
    expect(await fundWords(say(s), facts)).toBe(s);
  });
  it("fundWords falls back when model adds a number", async () => {
    expect(await fundWords(say("VTI is $1,234.50 today and grew 24%."), facts)).toContain(TEMPLATE_START);
  });
  it('fundWords falls back on "good fit"', async () => {
    expect(await fundWords(say("A good fit at $1234.50."), facts)).toContain(TEMPLATE_START);
  });
  it.each(["You could buy it.", "I recommend it.", "You should look.", "x".repeat(301)])("falls back on %s", async (s) => {
    expect(await fundWords(say(s), facts)).toContain(TEMPLATE_START);
  });
  it("fundWords rejects a link", async () => {
    expect(await fundWords(say("See https://example.com for VTI."), facts)).toContain(TEMPLATE_START);
    expect(await fundWords(say("See vanguard.com for VTI."), facts)).toContain(TEMPLATE_START);
  });
  it("falls back when the model throws", async () => {
    const bad: Llm = { json: async () => { throw new Error("down"); } };
    expect(await fundWords(bad, facts)).toContain(TEMPLATE_START);
  });
  it("model receives only the facts", async () => {
    let seen = "";
    await fundWords({ json: (async (a: { user: string }) => { seen = a.user; return { text: "x" }; }) as Llm["json"] }, facts);
    expect(JSON.parse(seen)).toEqual(facts);
  });
});
