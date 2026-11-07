import { CASH_HELD_LABEL, NEEDS_REVIEW_LABEL, QUEUED_LABEL } from "@/engine/invest";
import type * as t from "@/db/schema";
import type { CompanyFacts } from "@/adapters/financialdatasets/client";
import { formatCents } from "@/ui/grantWords";
import type { Holding } from "@/flows/holdings";

type Status = (typeof t.investments.$inferSelect)["status"];

/** Plain words for an investment's status; the three hard states use the labels the engine exports. */
export const INVEST_STATUS: Record<Status, string> = {
  proposed: "Waiting for you",
  approved: "Approved, not sent yet",
  depositing: "Moving money to her investing account",
  queued: QUEUED_LABEL,
  filled: "Bought",
  rejected: "Not this time",
  cash_held: CASH_HELD_LABEL,
  needs_review: NEEDS_REVIEW_LABEL,
  expired: "Asked too long ago — she can ask again.",
};

// ---- shares (pure; the propose form uses these in the browser) ---------------------------------------------------

/** "0.0138" under one share (4 decimals, more if it would read 0.0000), "1.38" at or over one. */
export function shareCount(shares: number): string {
  if (Math.round(shares * 1e4) / 1e4 >= 1) return shares.toFixed(2);
  return shares >= 0.00005 ? shares.toFixed(4) : shares.toPrecision(2);
}
const underOne = (n: string) => Number(n) < 1;

/** "about 0.0138 of a share" / "about 1.38 shares"; an asset Alpaca won't split says so instead. */
export function shareWords(amountCents: number, priceCents: number, fractionable: boolean, symbol: string): string {
  if (!fractionable) return `${symbol} can only be bought in whole shares, ${formatCents(priceCents)} each.`;
  const n = shareCount(amountCents / priceCents);
  return underOne(n) ? `about ${n} of a share` : `about ${n} shares`;
}

/** The propose form's live line under the amount. */
export function shareLine(amountCents: number, priceCents: number, symbol: string): string {
  const n = shareCount(amountCents / priceCents);
  return underOne(n) ? `= about ${n} of one ${symbol} share at ${formatCents(priceCents)}.` : `= about ${n} ${symbol} shares at ${formatCents(priceCents)}.`;
}

const closeDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "America/New_York" });
/** Under "One share costs": the real market day of the close. */
export function closeWords(day: Date): string {
  const parts = Object.fromEntries(closeDay.formatToParts(day).map((p) => [p.type, p.value]));
  return `At ${parts.weekday}'s close (${parts.day} ${parts.month}). You don't need a whole one: you buy in dollars.`;
}

/** Under an investment request's title: "About 0.0138 of a share at $361.86". */
export function requestShareWords(amountCents: number, price: { cents: number; fractionable: boolean }, symbol: string): string {
  const w = shareWords(amountCents, price.cents, price.fractionable, symbol);
  return price.fractionable ? `${w[0].toUpperCase()}${w.slice(1)} at ${formatCents(price.cents)}` : w;
}

// ---- stocks (facts, never a verdict) -----------------------------------------------------------------------------

/** Under $1.00 at the latest close: a plain fact. Neutral style, never red, and nothing is blocked. */
export const pennyLine = (closeCents: number | null): string | null =>
  closeCents !== null && closeCents < 100 ? "Under $1 a share: prices like this can swing a lot." : null;

/** Amara's request page: "Apple: Technology · Consumer Electronics · Cupertino, CA", skipping what's missing. */
export function companyLine(f: CompanyFacts): string {
  const rest = [f.sector, f.industry, f.location].filter(Boolean).join(" · ");
  return rest ? `${f.name}: ${rest}` : f.name;
}

// ---- how her investments are doing (code, not AI: facts, never a verdict) ----------------------------------------

type HoldingFacts = Pick<Holding, "symbol" | "shares" | "putInCents" | "worthCents" | "marketCents" | "daysHeld" | "words" | "line">;
const nyDayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "America/New_York" });
const nyDayMonthYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "America/New_York" });
/** "6 Nov" / "6 Nov 2026", on the market's calendar. */
export const dayMonth = (d: Date) => nyDayMonth.format(d);
export const dayMonthYear = (d: Date) => nyDayMonthYear.format(d);

/** Zoe's row: "0.0138 share", "1.38 shares". */
export function youOwnWords(shares: number): string {
  const n = shareCount(shares);
  return Number(n) <= 1 ? `${n} share` : `${n} shares`;
}

/** Under 30 real days. A fill a few hours old still reads "1 day". */
export function tooSoonWords(daysHeld: number): string {
  const d = Math.max(1, daysHeld);
  return `It's been ${d === 1 ? "1 day" : `${d} days`}. Too soon to tell: funds like this are for years, not days.`;
}

/** "Your $5.00 is worth $5.48. The same $5.00 in the whole market: $5.48." (Amara: "Her …", plus what she owns.) */
export function holdingSentence(h: HoldingFacts, who: "teen" | "guardian"): string {
  const put = formatCents(h.putInCents);
  const market = h.marketCents === null ? "" : ` The same ${put} in the whole market: ${formatCents(h.marketCents)}.`;
  if (who === "teen") return `Your ${put} is worth ${formatCents(h.worthCents)}.${market}`;
  const n = shareCount(h.shares);
  return `Her ${put} is worth ${formatCents(h.worthCents)}.${market} She owns ${underOne(n) ? `${n} of a share` : `${n} shares`}.`;
}

/**
 * Zoe only: down ⇒ her own "dropped by a third" answer and the fall in whole percent; otherwise why she picked it.
 * The fall is said only once the line shows (5+ closes): before that it would be a daily move, which D16 rules out.
 */
export function herWords(h: HoldingFacts): { lead: string; quote: string; tail: string } | null {
  if (h.line && h.worthCents < h.putInCents && h.words.drop) {
    const pct = Math.round(((h.putInCents - h.worthCents) / h.putInCents) * 100);
    return { lead: "You said, if it dropped by a third:", quote: h.words.drop, tail: `It's down ${pct === 0 ? "less than 1" : pct}%.` };
  }
  return h.words.why ? { lead: "Why you picked it:", quote: h.words.why, tail: "" } : null;
}
