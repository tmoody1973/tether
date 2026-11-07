// The month assistant's investing tools (decision 022): read-only, dollars as strings, no ids or account numbers.
// fund_inside and news make paid Financial Datasets calls only for Zoe's own funds and the companies inside them,
// so a ticker a visitor types never spends a credit. News is Amara's alone, on request: never on Zoe's screens.
import { jsonSchema, tool, type Tool } from "ai";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { fundInside, fundNews, type Article } from "@/adapters/financialdatasets/client";
import { marketDay } from "@/adapters/alpaca/data";
import type { Holding } from "@/flows/holdings";
import { allowedFunds, isSymbol } from "@/flows/teenInvest";
import { INVEST_STATUS, TOO_SOON_DAYS } from "@/ui/investWords";

export const INVEST_TOOLS = ["zoe_investments", "fund_inside", "news"] as const;
export const FUNDS_NOTE = "Funds don't have their own news; ask about one of the companies inside it.";
const NEWS_DOWN = "The news isn't available right now.";

// ponytail: fundInside's name guard (leveraged products) needs Alpaca's name, which these tools don't fetch. Without it
// the free covered-index-funds check still keeps anything that isn't a fund away from a paid call.
const NO_NAME = "";
const dollars = (c: number) => (c / 100).toFixed(2);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const round1 = (p: number) => Math.round(p * 10) / 10;
/** "vti " → "VTI"; null when it can't be a symbol (never sent anywhere). */
const symbolIn = (x: unknown): string | null => {
  const s = typeof x === "string" ? x.trim().toUpperCase() : "";
  return isSymbol(s) ? s : null;
};
/** Investments still on their way: today's words for them, as on Amara's Investing page. Refused or lapsed ones aren't. */
const OPEN = new Set<string>(["proposed", "approved", "depositing", "queued", "cash_held", "needs_review"]);

/** Zoe's funds: her signed rules plus the funds Amara approved since (allowedFunds), and any fund she holds. */
async function herFunds(db: Db, familyId: string): Promise<string[]> {
  const [listed, held] = await Promise.all([
    allowedFunds(db, familyId),
    db.selectDistinct({ symbol: t.investments.symbol }).from(t.investments)
      .where(and(eq(t.investments.familyId, familyId), eq(t.investments.status, "filled"))),
  ]);
  return [...new Set([...listed, ...held.map((h) => h.symbol)])];
}

async function readInvestments(db: Db, familyId: string, teen: string, holdings: Holding[]) {
  const shown = new Set(holdings.flatMap((h) => h.investmentIds));
  const rows = await db.select({ id: t.investments.id, symbol: t.investments.symbol, amountCents: t.investments.amountCents, status: t.investments.status })
    .from(t.investments).where(eq(t.investments.familyId, familyId)).orderBy(t.investments.symbol, t.investments.id);
  return {
    teen,
    holdings: holdings.map((h) => ({
      symbol: h.symbol, shares: h.shares.toFixed(4), putIn: dollars(h.putInCents), worthNow: dollars(h.worthCents),
      firstBought: marketDay(h.since), // real time, on the market's calendar (not the demo clock)
      sameMoneyInWholeMarket: h.marketCents === null ? null : dollars(h.marketCents), tooSoonToTell: h.daysHeld < TOO_SOON_DAYS,
    })),
    // A filled one with no holding is one whose price couldn't be read: listed as bought, never dropped.
    otherInvestments: rows.filter((r) => OPEN.has(r.status) || (r.status === "filled" && !shown.has(r.id)))
      .map((r) => ({ symbol: r.symbol, amount: dollars(r.amountCents), status: INVEST_STATUS[r.status] })),
  };
}
export type InvestmentsResult = Awaited<ReturnType<typeof readInvestments>>;

type Refused = { error: string };
export type InsideResult = Refused | { symbol: string; unavailable: string }
  | { symbol: string; asOf: string; topPct: number; rows: { name: string; ticker: string | null; pct: number }[] };
export type NewsResult = Refused | { ticker: string | null; unavailable: string }
  | { ticker: string | null; articles: Article[]; note?: string };

async function readInside(db: Db, familyId: string, teen: string, input: unknown): Promise<InsideResult> {
  const symbol = symbolIn((input as { symbol?: unknown } | undefined)?.symbol);
  if (!symbol || !(await herFunds(db, familyId)).includes(symbol)) return { error: `That fund isn't on ${teen}'s list.` };
  const inside = await fundInside(symbol, familyId, NO_NAME);
  if (!inside) return { symbol, unavailable: `What's inside ${symbol} isn't available right now.` };
  return {
    symbol, asOf: ymd(inside.asOf), topPct: Math.round(inside.topPct),
    rows: inside.rows.map((r) => ({ name: r.name, ticker: r.ticker ?? null, pct: round1(r.pct) })),
  };
}

async function readNews(db: Db, familyId: string, teen: string, input: unknown): Promise<NewsResult> {
  const raw = (input as { ticker?: unknown } | undefined)?.ticker;
  const offList = { error: `That isn't one of ${teen}'s funds or a company inside them.` };
  let ticker: string | null = null;
  if (raw !== undefined && raw !== null && raw !== "") {
    ticker = symbolIn(raw);
    if (!ticker) return offList;
    const funds = await herFunds(db, familyId);
    // ponytail: her list is a fund list, so a ticker on it is treated as a fund (FD has no news for funds: 404).
    if (funds.includes(ticker)) return { ticker, articles: [], note: FUNDS_NOTE };
    // Her funds' top holdings come from the weekly-cached call her fund page makes anyway: a cache hit takes no use.
    const insides = await Promise.all(funds.map((f) => fundInside(f, familyId, NO_NAME)));
    if (!insides.some((i) => i?.rows.some((r) => r.ticker === ticker))) return offList;
  }
  const articles = await fundNews(ticker, familyId);
  return articles ? { ticker, articles } : { ticker, unavailable: NEWS_DOWN };
}

const noInput = jsonSchema<Record<string, never>>({ type: "object", properties: {} });

/** The three tools for one family. zoe_investments only when the caller can read her holdings. */
export function investTools(db: Db, familyId: string, teen: string, holdings?: (familyId: string) => Promise<Holding[]>): Record<string, Tool> {
  const tools: Record<string, Tool> = {
    fund_inside: tool({
      description: `What one of ${teen}'s funds owns: its biggest holdings (name, ticker, percent of the fund), how much of the fund they are together (topPct), and the filing's date (asOf). Only for funds on ${teen}'s list or that she holds.`,
      inputSchema: jsonSchema<{ symbol: string }>({ type: "object", properties: { symbol: { type: "string", description: "The fund's ticker, e.g. VTI" } }, required: ["symbol"] }),
      execute: (input) => readInside(db, familyId, teen, input),
    }),
    news: tool({
      description: `Recent headlines (title, source, date, url). No ticker: market news. With a ticker: news about one company inside ${teen}'s funds (use fund_inside's tickers). Funds themselves have no news.`,
      inputSchema: jsonSchema<{ ticker?: string }>({ type: "object", properties: { ticker: { type: "string", description: "A company's ticker, e.g. AAPL. Leave out for market news." } } }),
      execute: (input) => readNews(db, familyId, teen, input),
    }),
  };
  if (holdings) {
    tools.zoe_investments = tool({
      description: `How ${teen}'s investments are doing: each fund she holds (shares, what she put in, what it's worth now, when she first bought, the same money in the whole market, and whether it's too soon to tell), plus investments still on their way, in today's status words. Dollars as strings. Takes no input.`,
      inputSchema: noInput,
      execute: async () => readInvestments(db, familyId, teen, await holdings(familyId)),
    });
  }
  return tools;
}
