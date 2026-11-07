// Financial Datasets (decision 021): only for what Alpaca lacks, through our own narrow, cached, capped calls.
// What's inside a fund comes from its SEC filing; what a company is, from its own filings (company facts). Credits are real: every paid call first takes a `market_data` use.
import { cacheLife } from "next/cache";
import { isE2eLocal } from "@/adapters/paypal/http";
import { isLeveragedProduct, readsAsFund } from "@/engine/invest";
import { getDb } from "@/db/client";
import { takeDaily } from "@/flows/usage";

export const FD_BASE_URL = "https://api.financialdatasets.ai";
const TIMEOUT_MS = 8_000;
const TOP = 10;

/** A fund's biggest holdings, as a share of the fund (percent, e.g. 6.4). */
export interface FundInside {
  /** The filing's date (UTC midnight). */
  asOf: Date;
  /** Same-named companies merged (GOOGL + GOOG = Alphabet, keeping the first ticker), largest first. */
  rows: { name: string; ticker: string | null; pct: number }[];
  /** The ten holdings returned, together. */
  topPct: number;
}

interface RawHoldings {
  fund?: { as_of?: string | null } | null;
  holdings?: { name?: string | null; ticker?: string | null; weight?: number | null }[] | null;
}

/** Off (null) without a key. The base URL is only ever overridden for the e2e suite's local fake. */
function config(env: NodeJS.ProcessEnv = process.env): { key: string; baseUrl: string } | null {
  const key = env.FINANCIALDATASETS_API_KEY;
  if (!key) return null;
  const fake = env.FINANCIALDATASETS_BASE_URL;
  return { key, baseUrl: fake && URL.canParse(fake) && isE2eLocal(new URL(fake), env) ? fake : FD_BASE_URL };
}

async function get(path: string): Promise<unknown> {
  const cfg = config();
  if (!cfg) throw new Error("Financial Datasets is not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, { headers: { "X-API-KEY": cfg.key }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Financial Datasets ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const SUFFIX = /[\s,]+(?:inc|corp|corporation|ltd|co|plc)\.?$/i;

/** "NVIDIA Corp" → "NVIDIA"; "Taiwan Semiconductor Manufacturing Co Ltd" → "Taiwan Semiconductor Manufacturing". */
export function displayName(raw: string): string {
  let name = raw.trim();
  while (SUFFIX.test(name)) name = name.replace(SUFFIX, "").trim();
  return name;
}

/** Pure. Throws on a response with no usable rows or date, so an empty answer is never cached. */
export function toFundInside(raw: RawHoldings): FundInside {
  const asOf = new Date(`${raw.fund?.as_of ?? ""}T00:00:00Z`);
  const valid = (raw.holdings ?? []).flatMap((h) => {
    const name = (h.name || h.ticker || "").trim();
    const ticker = h.ticker?.trim() || null;
    return name && typeof h.weight === "number" && Number.isFinite(h.weight) ? [{ name: displayName(name), ticker, pct: h.weight }] : [];
  });
  if (valid.length === 0 || Number.isNaN(asOf.getTime())) throw new Error("Financial Datasets returned no holdings");
  const merged = new Map<string, { name: string; ticker: string | null; pct: number }>();
  for (const r of valid) {
    const m = merged.get(r.name);
    merged.set(r.name, m ? { ...m, pct: m.pct + r.pct } : r);
  }
  return {
    asOf,
    rows: [...merged.values()].sort((a, b) => b.pct - a.pct),
    topPct: valid.reduce((s, r) => s + r.pct, 0),
  };
}

async function coveredList(): Promise<string[]> {
  "use cache";
  cacheLife("days"); // the list of funds it covers: free, and changes rarely
  const { tickers } = (await get("/index-funds/tickers/")) as { tickers?: unknown };
  if (!Array.isArray(tickers) || tickers.length === 0) throw new Error("Financial Datasets returned no tickers");
  return tickers.filter((x): x is string => typeof x === "string");
}

/** The funds Financial Datasets has holdings for. Empty when off or unavailable (the card then hides). */
export async function fundsCovered(): Promise<Set<string>> {
  if (!config()) return new Set();
  try {
    return new Set(await coveredList());
  } catch (err) {
    console.error("financial datasets: covered funds unavailable", err instanceof Error ? err.message : err);
    return new Set();
  }
}

/**
 * The paid call. Takes one `market_data` use first; throws when capped, failing or 404, so the cache never keeps a
 * miss. Remote cache: credits are real and a per-instance memory cache would spend one per cold start.
 * ponytail: keyed per family because the cap is per family, so each family pays once per fund per week.
 */
export async function fetchFundInside(ticker: string, familyId: string): Promise<FundInside> {
  "use cache: remote";
  cacheLife("weeks"); // a fund's filing changes a few times a year
  if (!(await takeDaily(await getDb(), familyId, "market_data"))) throw new Error("market_data daily cap reached");
  const qs = new URLSearchParams({ ticker, limit: String(TOP), asset_class: "equity" });
  return toFundInside((await get(`/index-funds/?${qs}`)) as RawHoldings);
}

/**
 * What's inside a fund, or null: not configured, a leveraged product (its page offers nothing, so no credit is spent),
 * not a covered fund (companies aren't), capped, or unavailable. `name` is Alpaca's name for it.
 */
export async function fundInside(ticker: string, familyId: string, name: string): Promise<FundInside | null> {
  if (!config() || isLeveragedProduct(name)) return null;
  try {
    if (!(await fundsCovered()).has(ticker)) return null;
    return await fetchFundInside(ticker, familyId);
  } catch (err) {
    console.error("financial datasets: holdings unavailable", ticker, err instanceof Error ? err.message : err);
    return null;
  }
}

/** A company's plain facts, from its SEC filings. No ratios, no market cap, no opinions. */
export interface CompanyFacts {
  name: string;
  sector: string | null;
  industry: string | null;
  /** Where it's based, as the filings give it (e.g. "Cupertino, CA"). */
  location: string | null;
  /** Only when the response carries one (the documented schema doesn't). */
  employees: number | null;
}

interface RawFacts {
  company_facts?: {
    name?: string | null; sector?: string | null; industry?: string | null; location?: string | null; number_of_employees?: number | null;
  } | null;
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Pure. Throws on a response with no company name, so an empty answer is never cached. */
export function toCompanyFacts(raw: RawFacts): CompanyFacts {
  const f = raw.company_facts ?? {};
  const name = text(f.name);
  if (!name) throw new Error("Financial Datasets returned no company");
  const n = f.number_of_employees;
  return {
    name: displayName(name), sector: text(f.sector), industry: text(f.industry), location: text(f.location),
    employees: typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null,
  };
}

async function companyList(): Promise<string[]> {
  "use cache";
  cacheLife("days"); // the companies it covers (~29,000 tickers, funds among them): free, and changes rarely
  const { tickers } = (await get("/company/facts/tickers/")) as { tickers?: unknown };
  if (!Array.isArray(tickers) || tickers.length === 0) throw new Error("Financial Datasets returned no company tickers");
  return tickers.filter((x): x is string => typeof x === "string");
}

/** The paid call, cached and capped exactly as fetchFundInside is: a miss, a 404 or the cap throws and is never kept. */
export async function fetchCompanyFacts(ticker: string, familyId: string): Promise<CompanyFacts> {
  "use cache: remote";
  cacheLife("weeks"); // a company's sector and home change rarely
  if (!(await takeDaily(await getDb(), familyId, "market_data"))) throw new Error("market_data daily cap reached");
  return toCompanyFacts((await get(`/company/facts?${new URLSearchParams({ ticker })}`)) as RawFacts);
}

/**
 * What a company is, or null: not configured, a fund (fundInside covers those, so a page pays once), not covered,
 * capped, or unavailable. Both free lists must load: without the funds list a fund could be charged as a company.
 * `name` is Alpaca's name for it: a leveraged product or a fund-sounding name never spends a credit, whatever the lists say.
 */
export async function companyFacts(ticker: string, familyId: string, name: string): Promise<CompanyFacts | null> {
  if (!config() || isLeveragedProduct(name) || readsAsFund(name)) return null;
  try {
    const [funds, companies] = await Promise.all([coveredList(), companyList()]);
    if (funds.includes(ticker) || !companies.includes(ticker)) return null;
    return await fetchCompanyFacts(ticker, familyId);
  } catch (err) {
    console.error("financial datasets: company facts unavailable", ticker, err instanceof Error ? err.message : err);
    return null;
  }
}

/** One headline, as the assistant passes it on: nothing else from the article. */
export interface Article { title: string; source: string; date: string; url: string }
const NEWS_LIMIT = 5;

interface RawNews { news?: { title?: unknown; source?: unknown; date?: unknown; url?: unknown }[] | null }
const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
/** "2026-11-06T23:11:44+00:00" → "2026-11-06"; anything that isn't a real ISO date → "" (the card then shows no date). */
function isoDay(x: unknown): string {
  const day = str(x).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day ? day : "";
}

/** Pure. At most five, title/source/date (YYYY-MM-DD, or "" when unreadable)/url only; throws when none are usable, so nothing empty is cached. */
export function toArticles(raw: RawNews): Article[] {
  const rows = Array.isArray(raw?.news) ? raw.news : [];
  const out = rows.flatMap((a) => (str(a?.title) && str(a?.url)
    ? [{ title: str(a.title), source: str(a.source), date: isoDay(a.date), url: str(a.url) }] : []));
  if (out.length === 0) throw new Error("Financial Datasets returned no news");
  return out.slice(0, NEWS_LIMIT);
}

/**
 * The paid news call: market news (no ticker) or one company's. Takes one `market_news` use first (its own budget, so
 * headlines never use up the `market_data` that "What's inside" needs); throws when capped,
 * failing or 404 (funds have no news), so the cache never keeps a miss. Per family, like fetchFundInside.
 */
export async function fetchNews(ticker: string | null, familyId: string): Promise<Article[]> {
  "use cache: remote";
  cacheLife("hours"); // headlines move; an hour is fresh enough for "what's in the news"
  if (!(await takeDaily(await getDb(), familyId, "market_news"))) throw new Error("market_news daily cap reached");
  const qs = new URLSearchParams({ ...(ticker ? { ticker } : {}), limit: String(NEWS_LIMIT) });
  return toArticles((await get(`/news?${qs}`)) as RawNews);
}

/** Headlines, or null: not configured, capped, or unavailable. Callers scope the ticker; this one doesn't. */
export async function fundNews(ticker: string | null, familyId: string): Promise<Article[] | null> {
  if (!config()) return null;
  try {
    return await fetchNews(ticker, familyId);
  } catch (err) {
    console.error("financial datasets: news unavailable", ticker ?? "market", err instanceof Error ? err.message : err);
    return null;
  }
}
