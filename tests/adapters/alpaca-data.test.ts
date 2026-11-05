import { describe, it, expect } from "vitest";
import { alpacaBroker } from "@/adapters/alpaca/broker";
import { alpacaMarket, compareSentence, oneYearLine, NotEnoughHistoryError } from "@/adapters/alpaca/data";

const DATA = "https://data.test";
const ASSETS = [
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", exchange: "ARCA", tradable: true, fractionable: true },
  { symbol: "VT", name: "Vanguard Total World Stock ETF", exchange: "ARCA", tradable: true, fractionable: true },
  { symbol: "XYZ", name: "Total Vanguard Thing", exchange: "NYSE", tradable: true, fractionable: false },
  { symbol: "TOT", name: "Other Co", exchange: "NYSE", tradable: true, fractionable: false },
  { symbol: "TOTX", name: "Hidden Corp", exchange: "NYSE", tradable: false, fractionable: false },
  { symbol: "AAA", name: "Zeta Total", exchange: "NASDAQ", tradable: true, fractionable: true },
];
type Bars = Record<string, number[][]>; // symbol -> pages of closes

function fakeFetch(bars: Bars = {}) {
  const calls: string[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (url.includes("oauth2/token")) return json({ access_token: "t", expires_in: 900 });
    if (url.includes("/v1/assets")) return json(ASSETS);
    const m = url.match(/stocks\/([A-Z]+)\/bars/);
    if (m) {
      const pages = bars[m[1]] ?? [[]];
      const tok = new URL(url).searchParams.get("page_token");
      const i = tok ? Number(tok) : 0;
      return json({ bars: pages[i].map((c) => ({ c })), next_page_token: i + 1 < pages.length ? String(i + 1) : null });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}
const market = (bars?: Bars) => {
  const { f, calls } = fakeFetch(bars);
  return { m: alpacaMarket(alpacaBroker({ baseUrl: "https://b.test", key: "k", secret: "s", dataBaseUrl: DATA }, f), DATA), calls };
};
const asOf = new Date("2026-11-05T00:00:00Z");

describe("searchAssets", () => {
  it("search orders exact symbol first", async () => {
    const { m } = market();
    // exact symbol, name prefix, then name contains (alphabetical by symbol); non-tradable dropped
    expect((await m.searchAssets("tot")).map((a) => a.symbol)).toEqual(["TOT", "XYZ", "AAA", "VT", "VTI"]);
    // exact symbol, then symbol prefix
    expect((await m.searchAssets("VT")).map((a) => a.symbol)).toEqual(["VT", "VTI"]);
    expect((await m.searchAssets("vanguard total")).map((a) => a.symbol)).toEqual(["VT", "VTI"]);
  });
  it("empty query makes no network call", async () => {
    const { m, calls } = market();
    expect(await m.searchAssets("   ")).toEqual([]);
    expect(calls).toHaveLength(0);
  });
  it("caches the asset list", async () => {
    const { m, calls } = market();
    await m.searchAssets("vt"); await m.searchAssets("vti");
    expect(calls.filter((u) => u.includes("/v1/assets"))).toHaveLength(1);
  });
});

describe("getAbsolute", () => {
  it("to another host throws", async () => {
    const { f } = fakeFetch();
    const b = alpacaBroker({ baseUrl: "https://b.test", key: "k", secret: "s", dataBaseUrl: DATA }, f);
    await expect(b.getAbsolute("https://evil.test/x")).rejects.toThrow(/unlisted host/);
  });
});

describe("changeOver", () => {
  it("1-year change computed from first and last bar", async () => {
    const { m } = market({ VTI: [[100, 90, 125.5]] });
    expect(await m.changeOver("VTI", 1, asOf)).toEqual({ startCents: 10000, endCents: 12550, pct: 25.5 });
  });
  it("bars requested with adjustment=all", async () => {
    const { m, calls } = market({ VTI: [[1, 2]] });
    await m.changeOver("VTI", 1, asOf);
    const u = new URL(calls.find((c) => c.includes("/bars"))!);
    expect(u.searchParams.get("adjustment")).toBe("all");
    expect(u.searchParams.get("timeframe")).toBe("1Day");
    expect(u.searchParams.get("end")).toBe(asOf.toISOString());
    expect(u.searchParams.get("feed")).toBe("sip");
  });
  it("full-market bars end at least 15 minutes ago (free plan)", async () => {
    const { m, calls } = market({ VTI: [[1, 2]] });
    const now = Date.now();
    await m.changeOver("VTI", 1, new Date(now));
    const end = new Date(new URL(calls.find((c) => c.includes("/bars"))!).searchParams.get("end")!).getTime();
    expect(end).toBeLessThanOrEqual(now - 15 * 60_000);
  });
  it("follows page_token", async () => {
    const { m } = market({ VTI: [[10], [20]] });
    expect((await m.changeOver("VTI", 1, asOf)).endCents).toBe(2000);
  });
  it("fewer than 2 bars throws", async () => {
    const { m } = market({ VTI: [[10]] });
    await expect(m.changeOver("VTI", 1, asOf)).rejects.toBeInstanceOf(NotEnoughHistoryError);
  });
  it("one-year line", async () => {
    const { m } = market({ VTI: [[200, 250.5]] });
    expect(oneYearLine(await m.changeOver("VTI", 1, asOf))).toBe("$250.50 today, $200.00 a year ago.");
  });
});

describe("marketCompare", () => {
  it('compare sentence reads "Over 5 years, $100 became: this $X, the whole market $Y." (up)', async () => {
    const { m } = market({ VTI: [[50, 150]], SPY: [[100, 180]] });
    expect(compareSentence(await m.marketCompare("VTI", asOf))).toBe("Over 5 years, $100 became: this $300, the whole market $180.");
  });
  it("compare sentence, down case", async () => {
    const { m } = market({ VTI: [[100, 70]], SPY: [[100, 120]] });
    expect(compareSentence(await m.marketCompare("VTI", asOf))).toBe("Over 5 years, $100 became: this $70, the whole market $120.");
  });
});
