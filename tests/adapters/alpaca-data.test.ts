import { describe, it, expect } from "vitest";
import { alpacaBroker, alpacaFromEnv } from "@/adapters/alpaca/broker";
import { alpacaMarket, compareHeading, compareSentence, hundredLine, oneYearLine, NotEnoughHistoryError } from "@/adapters/alpaca/data";

const DATA = "https://data.test";
const ASSETS = [
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", exchange: "ARCA", tradable: true, fractionable: true },
  { symbol: "VT", name: "Vanguard Total World Stock ETF", exchange: "ARCA", tradable: true, fractionable: true },
  { symbol: "XYZ", name: "Total Vanguard Thing", exchange: "NYSE", tradable: true, fractionable: false },
  { symbol: "TOT", name: "Other Co", exchange: "NYSE", tradable: true, fractionable: false },
  { symbol: "TOTX", name: "Hidden Corp", exchange: "NYSE", tradable: false, fractionable: false },
  { symbol: "AAA", name: "Zeta Total", exchange: "NASDAQ", tradable: true, fractionable: true },
];
type Dated = { t: string; c: number };
/** symbol -> pages of bars. Bare closes are spread evenly over the last `spanYears` up to the request's end. */
type Bars = Record<string, number[][] | Dated[][]>;
const YEAR = 365 * 86_400_000;

function fakeFetch(bars: Bars = {}, spanYears = 1) {
  const calls: string[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (url.includes("oauth2/token")) return json({ access_token: "t", expires_in: 900 });
    if (url.includes("/v1/assets")) return json(ASSETS);
    const m = url.match(/stocks\/([A-Z]+)\/bars/);
    if (m) {
      const pages = (bars[m[1]] ?? [[]]) as (number | Dated)[][];
      const u = new URL(url);
      const tok = u.searchParams.get("page_token");
      const i = tok ? Number(tok) : 0;
      const end = Date.parse(u.searchParams.get("end")!);
      const total = pages.flat().length;
      const offset = pages.slice(0, i).flat().length;
      const at = (k: number) => new Date(end - spanYears * YEAR + (total > 1 ? (k / (total - 1)) * spanYears * YEAR : 0)).toISOString();
      const out = pages[i].map((b, k) => (typeof b === "number" ? { t: at(offset + k), c: b } : b));
      return json({ bars: out, next_page_token: i + 1 < pages.length ? String(i + 1) : null });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}
const market = (bars?: Bars, spanYears = 1) => {
  const { f, calls } = fakeFetch(bars, spanYears);
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
    expect(await m.changeOver("VTI", 1, asOf)).toEqual({ startCents: 10000, endCents: 12550, pct: 25.5, since: null });
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
    await m.changeOver("VTI", 1, new Date(now)).catch(() => undefined); // only the request matters here
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
    const { m } = market({ VTI: [[50, 150]], SPY: [[100, 180]] }, 5);
    expect(compareSentence(await m.marketCompare("VTI", asOf))).toBe("Over 5 years, $100 became: this $300, the whole market $180.");
  });
  it("compare sentence, down case", async () => {
    const { m } = market({ VTI: [[100, 70]], SPY: [[100, 120]] }, 5);
    expect(compareSentence(await m.marketCompare("VTI", asOf))).toBe("Over 5 years, $100 became: this $70, the whole market $120.");
  });
});

describe("fiveYear (the fund page's one chart)", () => {
  it("one fetch per symbol gives both the sentence and the two $100 lines", async () => {
    const { m, calls } = market({ VTI: [[50, 40, 150]], SPY: [[100, 180]] }, 5);
    const r = await m.fiveYear("VTI", asOf);
    expect(compareSentence(r.compare)).toBe("Over 5 years, $100 became: this $300, the whole market $180.");
    expect(r.lines).toEqual({ thisFund: [100, 80, 300], market: [100, 180] });
    expect(calls.filter((c) => c.includes("/bars"))).toHaveLength(2);
  });
  it("hundredLine thins long histories to at most 61 points, keeping first and last", () => {
    const closes = Array.from({ length: 1260 }, (_, i) => 10 + i);
    const line = hundredLine(closes);
    expect(line.length).toBeLessThanOrEqual(61);
    expect(line[0]).toBe(100);
    expect(line.at(-1)).toBeCloseTo((1269 / 10) * 100);
  });
});

describe("alpacaFromEnv", () => {
  const env = { ALPACA_BROKER_KEY: "k", ALPACA_BROKER_SECRET: "s", ALPACA_BROKER_BASE_URL: "http://localhost:3101" };
  it("a localhost (fake) Alpaca needs the e2e gate", () => {
    expect(() => alpacaFromEnv({ ...env, NODE_ENV: "test" })).toThrow(/e2e/);
    expect(() => alpacaFromEnv({ ...env, NODE_ENV: "production", TETHER_E2E: "1" })).toThrow(/e2e/);
    expect(() => alpacaFromEnv({ ...env, NODE_ENV: "test", TETHER_E2E: "1", ALPACA_DATA_BASE_URL: "http://localhost:3101" })).not.toThrow();
  });
  it("ALPACA_AUTH_URL is accepted only for the local fake", () => {
    const real = { ...env, ALPACA_BROKER_BASE_URL: "https://broker-api.sandbox.alpaca.markets", NODE_ENV: "test" as const };
    expect(() => alpacaFromEnv({ ...real, ALPACA_AUTH_URL: "https://evil.test/token" })).toThrow(/e2e/);
    expect(() => alpacaFromEnv(real)).not.toThrow();
  });
});

describe("R42: history states its real span", () => {
  const ago = (days: number) => new Date(asOf.getTime() - days * 86_400_000).toISOString();
  const spy = [[{ t: ago(1825), c: 100 }, { t: ago(1095), c: 110 }, { t: ago(730), c: 120 }, { t: ago(365), c: 150 }, { t: ago(0), c: 180 }]];

  it("a fund trading for 2 years: SPY is trimmed to its first day, and the sentence says since when", async () => {
    const { m } = market({ VTI: [[{ t: ago(730), c: 50 }, { t: ago(365), c: 60 }, { t: ago(0), c: 100 }]], SPY: spy });
    const r = await m.fiveYear("VTI", asOf);
    expect(r.compare.since?.toISOString()).toBe(ago(730));
    expect(r.compare.market.startCents).toBe(12000); // the market from the fund's first day, not from 5 years ago
    expect(r.lines).toEqual({ thisFund: [100, 120, 200], market: [100, 125, 150] });
    expect(compareSentence(r.compare)).toBe("Since November 2024, $100 became: this $200, the whole market $150.");
    expect(compareHeading(r.compare)).toBe("Since November 2024");
    expect(oneYearLine(await m.changeOver("VTI", 1, asOf))).toBe("$100.00 today, $60.00 a year ago."); // a full year: unchanged
  });

  it("a fund listed 4 months ago: no comparison at all, and its one-year line says when it started trading", async () => {
    const { m } = market({ NEWX: [[{ t: ago(120), c: 10 }, { t: ago(60), c: 11 }, { t: ago(0), c: 12 }]], SPY: spy });
    await expect(m.fiveYear("NEWX", asOf)).rejects.toBeInstanceOf(NotEnoughHistoryError);
    expect(oneYearLine(await m.changeOver("NEWX", 1, asOf))).toBe("$12.00 today, $10.00 when it started trading in July 2026.");
  });

  it("a full 5-year history is unchanged", async () => {
    const { m } = market({ VTI: [[{ t: ago(1820), c: 50 }, { t: ago(0), c: 150 }]], SPY: spy });
    const r = await m.fiveYear("VTI", asOf);
    expect(r.compare.since).toBeNull();
    expect(compareSentence(r.compare)).toBe("Over 5 years, $100 became: this $300, the whole market $180.");
    expect(compareHeading(r.compare)).toBe("Five years");
  });

  it("two fund-page loads make one bar request per symbol (the one-year line comes from the 5-year bars)", async () => {
    const { m, calls } = market({ VTI: [[50, 55, 60, 70, 80, 100]], SPY: [[100, 180]] }, 5);
    for (let i = 0; i < 2; i++) await Promise.all([m.changeOver("VTI", 1, asOf), m.fiveYear("VTI", asOf)]);
    const bars = calls.filter((c) => c.includes("/bars"));
    expect(bars.filter((c) => c.includes("/VTI/"))).toHaveLength(1);
    expect(bars.filter((c) => c.includes("/SPY/"))).toHaveLength(1);
  });

  it("a failed bar fetch isn't cached", async () => {
    let fail = true;
    const { f, calls } = fakeFetch({ VTI: [[1, 2]] });
    const flaky = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/bars") && fail) { fail = false; calls.push(String(input)); return new Response("{}", { status: 503 }); }
      return f(input, init);
    }) as typeof fetch;
    const m = alpacaMarket(alpacaBroker({ baseUrl: "https://b.test", key: "k", secret: "s", dataBaseUrl: DATA }, flaky), DATA);
    await expect(m.changeOver("VTI", 1, asOf)).rejects.toThrow();
    expect((await m.changeOver("VTI", 1, asOf)).endCents).toBe(200);
  });
});
