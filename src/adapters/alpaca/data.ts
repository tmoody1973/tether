import type { AlpacaBroker } from "./broker";
import type { Cents } from "@/engine/types";

export interface AssetHit { symbol: string; name: string; exchange: string; fractionable: boolean }
export interface Change { startCents: Cents; endCents: Cents; /** percent, e.g. 12.5 */ pct: number }
export interface MarketCompare { thisFund: Change; market: Change }

const DAY_MS = 86_400_000;
const ASSET_TTL_MS = 24 * 3_600_000;
const LIMIT = 20;
const MAX_PAGES = 20;

export class NotEnoughHistoryError extends Error {
  constructor(readonly symbol: string) {
    super(`Not enough history for ${symbol}`);
    this.name = "NotEnoughHistoryError";
  }
}

const cents = (dollars: number): Cents => Math.round(dollars * 100);
const usd = (c: Cents) => `$${(c / 100).toFixed(2)}`;

/** "$A today, $B a year ago." */
export const oneYearLine = (c: Change) => `${usd(c.endCents)} today, ${usd(c.startCents)} a year ago.`;

/** Whole-dollar value today of $100 put in at the first bar. */
export const hundredBecame = (c: Change) => Math.round((c.endCents / c.startCents) * 100);

/** Same words in up and down years; never a verdict. */
export const compareSentence = (m: MarketCompare) =>
  `Over 5 years, $100 became: this $${hundredBecame(m.thisFund)}, the whole market $${hundredBecame(m.market)}.`;

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

  // adjustment=all so splits and dividends never read as crashes. feed=iex: the default (SIP) feed is refused
  // with 403 on the free sandbox plan for recent bars (verified live 2026-11-05).
  async function bars(symbol: string, start: Date, end: Date): Promise<number[]> {
    const closes: number[] = [];
    let token: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({
        timeframe: "1Day", adjustment: "all", feed: "iex", start: start.toISOString(), end: end.toISOString(), limit: "10000",
        ...(token ? { page_token: token } : {}),
      });
      const r = await broker.getAbsolute<{ bars?: Array<{ c: number }> | null; next_page_token?: string | null }>(
        `${dataBaseUrl}/v2/stocks/${encodeURIComponent(symbol)}/bars?${qs}`);
      for (const b of r.bars ?? []) closes.push(b.c);
      token = r.next_page_token ?? undefined;
      if (!token) break;
    }
    return closes;
  }

  async function changeOver(symbol: string, years: 1 | 5, asOf: Date): Promise<Change> {
    const start = new Date(asOf.getTime() - years * 365 * DAY_MS);
    const closes = await bars(symbol, start, asOf);
    if (closes.length < 2) throw new NotEnoughHistoryError(symbol);
    const startCents = cents(closes[0]), endCents = cents(closes[closes.length - 1]);
    return { startCents, endCents, pct: ((endCents - startCents) / startCents) * 100 };
  }

  async function marketCompare(symbol: string, asOf: Date): Promise<MarketCompare> {
    const [thisFund, market] = await Promise.all([changeOver(symbol, 5, asOf), changeOver("SPY", 5, asOf)]);
    return { thisFund, market };
  }

  return { searchAssets, changeOver, marketCompare };
}

export type AlpacaMarket = ReturnType<typeof alpacaMarket>;
