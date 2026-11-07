// Amara's answer cards (decision 019). The model writes the sentence; these cards show the numbers, built only from
// the tool results Tether fetched for this question. Same whitelists as the tools: no ids, no PayPal free text.
import { FLAG_WORDS, LAG_NOTE } from "@/flows/reconcile";
import { itemsLine } from "@/ui/activityWords";
import type { CheckinResult, MatchResult, RecordResult } from "@/ai/monthAssistant";
import type { InsideResult, InvestmentsResult, NewsResult } from "@/ai/investTools";

/** tether_record's words for a payment Amara approved one by one (the card says "You approved"). */
export const APPROVED_BY_PARENT = "the parent approved this one";

/** The last result of each tool in one answer, as the tool returned it. */
export interface ToolResults {
  tether_record?: RecordResult; month_checkin?: CheckinResult; paypal_check?: MatchResult;
  zoe_investments?: InvestmentsResult; fund_inside?: InsideResult; news?: NewsResult;
}

export interface PurchasesCard {
  kind: "purchases"; month: string; totalCents: number;
  rows: { date: string; shop: string; items: string | null; amountCents: number; allowedBy: "You approved" | "Within her rules" }[];
  /** Payments a demo reset set aside: left out of the rows and the total, as on Activity (tether_record's setAsideNote). */
  hiddenNote: string | null;
}
export interface CheckinCard {
  kind: "checkin"; month: string; level: number | null;
  week: { spentCents: number; leftCents: number; allowanceCents: number };
  weeks: { covers: string; count: number; kept: number; insideBudget: number; savedCents: number };
  nextCheckin: string | null;
  /** Amara stopped her rules: nothing this week is spendable, whatever the allowance says. */
  rulesStopped: boolean;
}
export interface PaypalCard {
  kind: "paypal"; month: string; matched: number; receiptsChecked: number;
  flags: { label: string; shop: string | null; amountCents: number }[];
  note: string | null;
  /** Receipts a demo reset set aside: left out of the counts, as one line with no detail. */
  setAsideNote: string | null;
}
/** One row per fund she holds: what it's worth, her shares and what she put in, and the whole-market comparison. */
export interface InvestmentsCard {
  kind: "investments"; teen: string;
  rows: { symbol: string; shares: number; putInCents: number; worthCents: number; marketCents: number | null }[];
}
export interface InsideCard { kind: "inside"; symbol: string; asOf: string; rows: { name: string; pct: number }[] }
/** Up to five headlines. A url that isn't http(s) is dropped (the title then shows without a link). */
export interface NewsCard { kind: "news"; ticker: string | null; articles: { title: string; source: string; date: string; url: string | null }[] }
export type AnswerCard = PurchasesCard | CheckinCard | PaypalCard | InvestmentsCard | InsideCard | NewsCard;

const cents = (dollars: string): number => Math.round(Number(dollars) * 100);

function purchasesCard(r: RecordResult): PurchasesCard | null {
  if (!r.month) return null;
  const rows = r.receipts.map((x) => ({
    date: x.date, shop: x.shop, items: itemsLine(x.items), amountCents: cents(x.amount),
    allowedBy: x.allowedBy === APPROVED_BY_PARENT ? "You approved" as const : "Within her rules" as const,
  }));
  return { kind: "purchases", month: r.month, rows, totalCents: rows.reduce((s, x) => s + x.amountCents, 0), hiddenNote: r.setAsideNote };
}

const checkinCard = (c: CheckinResult): CheckinCard => ({
  kind: "checkin", month: c.month, level: c.level,
  week: { spentCents: cents(c.thisWeek.spent), leftCents: cents(c.thisWeek.left), allowanceCents: cents(c.weeklyAllowance) },
  weeks: { covers: c.weeks.covers, count: c.weeks.count, kept: c.weeks.kept, insideBudget: c.weeks.insideBudget, savedCents: cents(c.weeks.saved) },
  nextCheckin: c.nextCheckin, rulesStopped: c.rulesStopped,
});

function paypalCard(m: MatchResult): PaypalCard | null {
  if (!m.month) return null;
  const flags = [
    ...m.notYetConfirmed.map((f) => ({ label: FLAG_WORDS.unconfirmed, shop: f.shop, amountCents: cents(f.amount) })),
    ...m.refunded.map((f) => ({ label: FLAG_WORDS.refunded, shop: f.shop, amountCents: cents(f.amount) })),
    ...m.paypalChargesWithoutReceipt.map((f) => ({ label: FLAG_WORDS.paypal_only, shop: null, amountCents: cents(f.amount) })),
  ];
  return {
    kind: "paypal", month: m.month, matched: m.matched, receiptsChecked: m.receiptsChecked, flags,
    note: m.notYetConfirmed.length > 0 ? LAG_NOTE : null, setAsideNote: m.setAsideNote,
  };
}

function investmentsCard(r: InvestmentsResult): InvestmentsCard | null {
  if (r.holdings.length === 0) return null; // nothing bought yet: the sentence says what's on its way
  return {
    kind: "investments", teen: r.teen,
    rows: r.holdings.map((h) => ({
      symbol: h.symbol, shares: Number(h.shares), putInCents: cents(h.putIn), worthCents: cents(h.worthNow),
      marketCents: h.sameMoneyInWholeMarket === null ? null : cents(h.sameMoneyInWholeMarket),
    })),
  };
}

const insideCard = (r: InsideResult): InsideCard | null =>
  "rows" in r ? { kind: "inside", symbol: r.symbol, asOf: r.asOf, rows: r.rows.map(({ name, pct }) => ({ name, pct })) } : null;

/** Only http(s) links reach the page: a `javascript:` or other scheme is dropped. */
export function httpUrl(raw: string): string | null {
  if (!URL.canParse(raw)) return null;
  const u = new URL(raw);
  return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
}

function newsCard(r: NewsResult): NewsCard | null {
  if (!("articles" in r) || r.articles.length === 0) return null; // refused, unavailable, or a fund's note
  return {
    kind: "news", ticker: r.ticker,
    articles: r.articles.slice(0, 5).map((a) => ({ title: a.title, source: a.source, date: a.date, url: httpUrl(a.url) })),
  };
}

/** The cards for one answer, always in this order: purchases, check-in, PayPal, investments, inside, news. list_transactions makes none. */
export function buildCards(t: ToolResults): AnswerCard[] {
  const cards = [
    t.tether_record ? purchasesCard(t.tether_record) : null,
    t.month_checkin ? checkinCard(t.month_checkin) : null,
    t.paypal_check ? paypalCard(t.paypal_check) : null,
    t.zoe_investments ? investmentsCard(t.zoe_investments) : null,
    t.fund_inside ? insideCard(t.fund_inside) : null,
    t.news ? newsCard(t.news) : null,
  ];
  return cards.filter((c): c is AnswerCard => c !== null);
}
