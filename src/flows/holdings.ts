// How her investments are doing (decision 020, kept to D16's rules): one card per fund she holds, from Alpaca's own
// fills and closes. Every number is computed here, from REAL dates (fill times, market days), never the demo clock.
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { marketDay, thin, type AlpacaMarket, type Close } from "@/adapters/alpaca/data";
import type { FilledOrder } from "@/adapters/alpaca/broker";
import type { Cents } from "@/engine/types";
import { QUESTIONS } from "@/ui/investQuestions";

export interface HoldingsDeps {
  db: Db;
  /** Alpaca's fill for one order (cached for good). Throws when it isn't filled or can't be read. */
  order: (accountId: string, orderId: string) => Promise<FilledOrder>;
  market: Pick<AlpacaMarket, "latestClose" | "dailyCloses">;
  /** Real time; tests pin it. Never the family's demo clock. */
  realNow?: () => number;
}

/** One fund she holds, from her FILLED investments in it. */
export interface Holding {
  symbol: string;
  /** Alpaca's filled quantities, summed. */
  shares: number;
  putInCents: Cents;
  /** shares × the latest close. */
  worthCents: Cents;
  /** Her first fill (real time). */
  since: Date;
  /** Whole real days since `since`. */
  daysHeld: number;
  /** The same money in the whole market (SPY), each lot bought on its own fill day; null while there's no line. */
  marketCents: Cents | null;
  /** Her value and the market's at each close since she first bought (cents, at most 61 points); null: under 5 closes. */
  line: { mine: Cents[]; market: Cents[] } | null;
  /** Her answers on the most recent lot. */
  words: { why: string | null; drop: string | null };
  /** The investments this card stands for: their list rows give way to it. */
  investmentIds: string[];
}

const MARKET = "SPY";
const MIN_CLOSES = 5;
const DAY_MS = 86_400_000;

interface Lot { id: string; symbol: string; amountCents: Cents; shares: number; at: Date; answers: Record<string, unknown> }

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const answer = (a: Record<string, unknown>, q: string) => (typeof a[q] === "string" && a[q].trim() ? a[q].trim() : null);

/**
 * One holding per fund, from this family's FILLED investments only. Best effort: a lot whose order can't be read,
 * or a fund with no latest price, is left out (its rows keep today's wording, never a guessed number).
 */
export async function familyHoldings(deps: HoldingsDeps, familyId: string): Promise<Holding[]> {
  const rows = await deps.db.select().from(t.investments)
    .where(and(eq(t.investments.familyId, familyId), eq(t.investments.status, "filled")));
  const lots = (await Promise.all(rows.map(async (r): Promise<Lot | null> => {
    if (!r.alpacaAccountId || !r.orderId) return null;
    try {
      const o = await deps.order(r.alpacaAccountId, r.orderId);
      return { id: r.id, symbol: r.symbol, amountCents: r.amountCents, shares: o.qty, at: new Date(o.at), answers: r.answers };
    } catch {
      return null;
    }
  }))).filter((l): l is Lot => l !== null);
  const bySymbol = Map.groupBy(lots, (l) => l.symbol);
  const now = deps.realNow?.() ?? Date.now();
  const held = await Promise.all([...bySymbol].map(([symbol, ls]) => holdingOf(deps, symbol, ls, now)));
  return held.filter((h): h is Holding => h !== null).sort((a, b) => a.since.getTime() - b.since.getTime());
}

async function holdingOf(deps: HoldingsDeps, symbol: string, lots: Lot[], now: number): Promise<Holding | null> {
  const close = await deps.market.latestClose(symbol);
  if (!close) return null;
  const sorted = [...lots].sort((a, b) => a.at.getTime() - b.at.getTime());
  const since = sorted[0].at, latest = sorted[sorted.length - 1];
  const shares = sum(sorted.map((l) => l.shares));
  const vs = await vsMarket(deps, symbol, sorted, new Date(now)).catch(() => null);
  return {
    symbol, shares, putInCents: sum(sorted.map((l) => l.amountCents)), worthCents: Math.round(shares * close.cents), since,
    daysHeld: Math.floor((now - since.getTime()) / DAY_MS),
    marketCents: vs?.marketCents ?? null, line: vs?.line ?? null,
    words: { why: answer(latest.answers, QUESTIONS.why), drop: answer(latest.answers, QUESTIONS.drop) },
    investmentIds: sorted.map((l) => l.id),
  };
}

/**
 * Her value on day d = Σ (lots filled on or before d) shares × close(d). The market's = Σ the same lots of
 * (amount / SPY's close on the lot's fill day) × SPY close(d). Null under 5 closes, or when a price is missing.
 */
async function vsMarket(deps: HoldingsDeps, symbol: string, lots: Lot[], now: Date) {
  const from = new Date(lots[0].at.getTime() - DAY_MS); // daily bars are stamped at midnight: include the fill day's
  const [mine, spy] = await Promise.all([deps.market.dailyCloses(symbol, from, now), deps.market.dailyCloses(MARKET, from, now)]);
  const first = marketDay(lots[0].at);
  const spyOn = new Map(spy.map((c) => [marketDay(c.day), c.cents]));
  const spyAtFill = lots.map((l) => spy.find((c) => marketDay(c.day) >= marketDay(l.at))?.cents);
  if (spyAtFill.some((c) => !c)) return null; // a lot filled in a session that hasn't closed yet
  const points = mine.flatMap((c: Close) => {
    const day = marketDay(c.day), spyClose = spyOn.get(day);
    if (day < first || spyClose === undefined) return [];
    const held = lots.flatMap((l, i) => (marketDay(l.at) <= day ? [{ l, spyFill: spyAtFill[i]! }] : []));
    return [{
      mine: Math.round(sum(held.map(({ l }) => l.shares * c.cents))),
      market: Math.round(sum(held.map(({ l, spyFill }) => (l.amountCents / spyFill) * spyClose))),
    }];
  });
  if (points.length < MIN_CLOSES) return null;
  const spyNow = spy[spy.length - 1].cents;
  const shown = thin(points);
  return {
    marketCents: Math.round(sum(lots.map((l, i) => (l.amountCents / spyAtFill[i]!) * spyNow))),
    line: { mine: shown.map((p) => p.mine), market: shown.map((p) => p.market) },
  };
}
