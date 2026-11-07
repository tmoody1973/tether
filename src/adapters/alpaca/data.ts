import { brokerFromEnv, type AlpacaBroker } from "./broker";
import type { Cents } from "@/engine/types";

export interface AssetHit { symbol: string; name: string; exchange: string; fractionable: boolean }
/** since: null when the bars cover the whole window asked for; otherwise when this symbol's history really starts (R42). */
export interface Change { startCents: Cents; endCents: Cents; /** percent, e.g. 12.5 */ pct: number; since: Date | null }
/** Both sides cover the same dates: when the fund is younger than 5 years, the market is trimmed to its first day. */
export interface MarketCompare { thisFund: Change; market: Change; since: Date | null }
/** The fund page's one chart (D16): what $100 became along the way, for this fund and the whole market (SPY). */
export interface FiveYear { compare: MarketCompare; lines: { thisFund: number[]; market: number[] } }
interface Bar { t: number; c: number }

const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;
const ASSET_TTL_MS = 24 * 3_600_000;
const BARS_TTL_MS = 3_600_000;
const BARS_CACHE_MAX = 1000;
/** A window counts as full when its first bar is within this of the window's start (weekends, holidays, listing gaps). */
const FULL_WINDOW_SLACK_MS = 30 * DAY_MS;
const LIMIT = 20;
const MAX_PAGES = 20;
/** Free plan: full-market (SIP) bars are allowed only if they end at least 15 minutes ago. */
const SIP_DELAY_MS = 16 * 60_000;

/** Fewer than two bars, or (for the 5-year comparison) less than a year of trading. */
export class NotEnoughHistoryError extends Error {
  constructor(readonly symbol: string) {
    super(`Not enough history for ${symbol}`);
    this.name = "NotEnoughHistoryError";
  }
}

const cents = (dollars: number): Cents => Math.round(dollars * 100);
const CHART_POINTS = 61;

/** At most CHART_POINTS evenly spaced points, first and last kept: a line reads the same at any length. */
export function thin<T>(xs: T[]): T[] {
  const step = Math.max(1, (xs.length - 1) / (CHART_POINTS - 1));
  const picked: T[] = [];
  for (let i = 0; i < xs.length - 1; i += step) picked.push(xs[Math.round(i)]);
  if (xs.length > 0) picked.push(xs[xs.length - 1]);
  return picked;
}

/** Closes as "what $100 became", thinned to at most CHART_POINTS (first and last kept). */
export const hundredLine = (closes: number[]): number[] => thin(closes).map((c) => (c / closes[0]) * 100);

/** A daily close and the market day it closed on (Alpaca stamps daily bars at midnight New York). */
export interface Close { cents: Cents; day: Date }
export interface Quote extends Close { fractionable: boolean }

const nyDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const nyClock = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** "2026-11-06": the New York market day a time falls on. */
export const marketDay = (d: Date | number): string => nyDay.format(d);
/** The session ends at 4pm New York and the free feed lags 16 minutes; until then today's bar is still moving. */
const CLOSED_AT_MIN = 16 * 60 + 16;
function isClosed(barT: number, nowMs: number): boolean {
  if (marketDay(barT) !== marketDay(nowMs)) return true;
  const [h, m] = nyClock.format(nowMs).split(":").map(Number);
  return h * 60 + m >= CLOSED_AT_MIN;
}
const usd = (c: Cents) => `$${(c / 100).toFixed(2)}`;
const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
/** "March 2024" (UTC). */
export const sinceWords = (d: Date) => monthYear.format(d);

/** "$A today, $B a year ago." — or, for a younger symbol, "...when it started trading in {Month YYYY}." */
export const oneYearLine = (c: Change) =>
  `${usd(c.endCents)} today, ${usd(c.startCents)} ${c.since ? `when it started trading in ${sinceWords(c.since)}` : "a year ago"}.`;

/** Whole-dollar value today of $100 put in at the first bar. */
export const hundredBecame = (c: Change) => Math.round((c.endCents / c.startCents) * 100);

/** The single source of the comparison copy (R42). Same words in up and down years; never a verdict. */
export const compareSentence = (m: MarketCompare) =>
  `${m.since ? `Since ${sinceWords(m.since)}` : "Over 5 years"}, $100 became: this $${hundredBecame(m.thisFund)}, the whole market $${hundredBecame(m.market)}.`;

/** The comparison card's heading. */
export const compareHeading = (m: MarketCompare) => (m.since ? `Since ${sinceWords(m.since)}` : "Five years");

function rank(a: { symbol: string; name: string }, q: string): number {
  const sym = a.symbol.toLowerCase(), name = (a.name ?? "").toLowerCase();
  if (sym === q) return 0;
  if (sym.startsWith(q)) return 1;
  if (name.startsWith(q)) return 2;
  return name.includes(q) ? 3 : -1;
}

/** Ordered by match to what she typed, never popularity. */
export function alpacaMarket(broker: AlpacaBroker, dataBaseUrl: string, now: () => number = Date.now) {
  let cache: { at: number; assets: AssetHit[] } | null = null;

  async function assets(): Promise<AssetHit[]> {
    if (cache && now() - cache.at < ASSET_TTL_MS) return cache.assets;
    const rows = await broker.listAssets();
    const list = rows.filter((a) => a.tradable === true)
      .map((a) => ({ symbol: a.symbol, name: a.name, exchange: a.exchange, fractionable: a.fractionable }));
    cache = { at: now(), assets: list };
    return list;
  }

  async function searchAssets(query: string): Promise<AssetHit[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (await assets())
      .map((a) => ({ a, r: rank(a, q) }))
      .filter((x) => x.r >= 0)
      .sort((x, y) => x.r - y.r || (x.a.symbol < y.a.symbol ? -1 : x.a.symbol > y.a.symbol ? 1 : 0))
      .slice(0, LIMIT)
      .map((x) => x.a);
  }

  // adjustment=all so splits and dividends never read as crashes. feed=sip (every exchange, not just IEX) is
  // free when the request ends 15+ minutes ago, so `end` is held back 16 minutes (verified live 2026-11-05).
  async function fetchBars(symbol: string, start: Date, wantedEnd: Date): Promise<Bar[]> {
    const end = new Date(Math.min(wantedEnd.getTime(), Date.now() - SIP_DELAY_MS));
    const out: Bar[] = [];
    let token: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({
        timeframe: "1Day", adjustment: "all", feed: "sip", start: start.toISOString(), end: end.toISOString(), limit: "10000",
        ...(token ? { page_token: token } : {}),
      });
      const r = await broker.getAbsolute<{ bars?: Array<{ t: string; c: number }> | null; next_page_token?: string | null }>(
        `${dataBaseUrl}/v2/stocks/${encodeURIComponent(symbol)}/bars?${qs}`);
      for (const b of r.bars ?? []) out.push({ t: Date.parse(b.t), c: b.c });
      token = r.next_page_token ?? undefined;
      if (!token) break;
    }
    return out.filter((b) => Number.isFinite(b.t));
  }

  // Daily bars change once a day: one 5-year fetch per symbol per UTC day serves the search line, the fund page's
  // one-year line and its comparison. The promise is cached so concurrent views share one request; failures aren't kept.
  const barCache = new Map<string, { at: number; bars: Promise<Bar[]> }>();
  function history(symbol: string, asOf: Date): Promise<Bar[]> {
    const key = `${symbol}:5:${asOf.toISOString().slice(0, 10)}`;
    const hit = barCache.get(key);
    if (hit && now() - hit.at < BARS_TTL_MS) return hit.bars;
    if (barCache.size >= BARS_CACHE_MAX) barCache.clear(); // ponytail: crude bound; an LRU if this ever matters
    const bars = fetchBars(symbol, new Date(asOf.getTime() - 5 * YEAR_MS), asOf);
    barCache.set(key, { at: now(), bars });
    bars.catch(() => barCache.delete(key));
    return bars;
  }

  const changeOf = (bars: Bar[], since: Date | null): Change => {
    const startCents = cents(bars[0].c), endCents = cents(bars[bars.length - 1].c);
    return { startCents, endCents, pct: ((endCents - startCents) / startCents) * 100, since };
  };

  /** The last `years` of bars; `since` is set when they start more than 30 days after the window does. */
  function windowOf(symbol: string, all: Bar[], years: 1 | 5, asOf: Date): { bars: Bar[]; since: Date | null } {
    const requestedStart = asOf.getTime() - years * YEAR_MS;
    const bars = all.filter((b) => b.t >= requestedStart);
    if (bars.length < 2) throw new NotEnoughHistoryError(symbol);
    return { bars, since: bars[0].t - requestedStart > FULL_WINDOW_SLACK_MS ? new Date(bars[0].t) : null };
  }

  async function changeOver(symbol: string, years: 1 | 5, asOf: Date): Promise<Change> {
    const { bars, since } = windowOf(symbol, await history(symbol, asOf), years, asOf);
    return changeOf(bars, since);
  }

  /** Like with like: a younger fund is compared with the market from its own first day. Under a year => no comparison. */
  async function fiveYear(symbol: string, asOf: Date): Promise<FiveYear> {
    const [f, m] = await Promise.all([history(symbol, asOf), history("SPY", asOf)]);
    const fund = windowOf(symbol, f, 5, asOf);
    if (fund.bars[fund.bars.length - 1].t - fund.bars[0].t < YEAR_MS) throw new NotEnoughHistoryError(symbol);
    const from = fund.bars[0].t;
    const market = windowOf("SPY", m, 5, asOf).bars.filter((b) => !fund.since || b.t >= from);
    if (market.length < 2) throw new NotEnoughHistoryError("SPY");
    return {
      compare: { thisFund: changeOf(fund.bars, fund.since), market: changeOf(market, fund.since), since: fund.since },
      lines: { thisFund: hundredLine(fund.bars.map((b) => b.c)), market: hundredLine(market.map((b) => b.c)) },
    };
  }

  const marketCompare = async (symbol: string, asOf: Date): Promise<MarketCompare> => (await fiveYear(symbol, asOf)).compare;

  /** Closed sessions from `from` to `to`, oldest first. Throws when the data call fails. */
  async function dailyCloses(symbol: string, from: Date, to: Date): Promise<Close[]> {
    // Within the cached 5-year history (the fund page's) when it covers the window; else its own fetch.
    const bars = from.getTime() >= to.getTime() - 5 * YEAR_MS ? await history(symbol, to) : await fetchBars(symbol, from, to);
    return bars.filter((b) => b.t >= from.getTime() && b.t <= to.getTime() && isClosed(b.t, now()))
      .map((b) => ({ cents: cents(b.c), day: new Date(b.t) }));
  }

  /** The last session that has closed, or null (no bars, or the data call failed). */
  async function latestClose(symbol: string): Promise<Close | null> {
    try {
      const asOf = new Date(now());
      return (await dailyCloses(symbol, new Date(asOf.getTime() - 5 * YEAR_MS), asOf)).at(-1) ?? null;
    } catch {
      return null;
    }
  }

  /** latestClose plus whether Alpaca sells it in slices; null when either is unknown. */
  async function quote(symbol: string): Promise<Quote | null> {
    const [close, hit] = await Promise.all([latestClose(symbol), assets().then((a) => a.find((x) => x.symbol === symbol), () => undefined)]);
    return close && hit ? { ...close, fractionable: hit.fractionable } : null;
  }

  return { searchAssets, changeOver, marketCompare, fiveYear, latestClose, dailyCloses, quote };
}

export type AlpacaMarket = ReturnType<typeof alpacaMarket>;

let shared: AlpacaMarket | null = null;

/** One per server process, so Alpaca's asset list is cached for 24h. Throws (each call) when Alpaca isn't configured. */
export function marketFromEnv(): AlpacaMarket {
  shared ??= alpacaMarket(brokerFromEnv(), process.env.ALPACA_DATA_BASE_URL ?? "https://data.sandbox.alpaca.markets");
  return shared;
}
