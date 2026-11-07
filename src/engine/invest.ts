import { INVESTING_FROM, LEVELS } from "./ladder";
import type { Cents, Decision, Grant, Reason } from "./types";

export const MIN_INVEST_CENTS = 100;
export const QUEUED_LABEL = "Queued for market open";
export const CASH_HELD_LABEL = "Held as cash in Zoe's investing account. Amara can try the order again.";
export const NEEDS_REVIEW_LABEL = "Checking with the broker";
export const investReceiptNote = (teenName: string) => `This money now belongs to ${teenName} and can't be taken back.`;

export const LEVERAGED_TEXT =
  "Tether doesn't offer leveraged or inverse products: they're built to move two or three times as fast as the market, often for one day at a time.";

// "2X", "1.5x", "-3X"; the words; "ultra" alone but never "Ultra-Short"/"Ultra Short" (low-risk short-term bond funds).
const LEVERAGED = /\b(?:\d+(?:\.\d+)?x|leveraged|inverse|ultrapro|ultrashort|ultra(?![-\s]short)|daily target|bear)\b/i;

/**
 * Pure. Leveraged, inverse and daily-target products, by the words in their name.
 * ponytail: names only, so a plain inverse fund like "ProShares Short S&P500" passes; a flag from the issuer if one ever exists.
 */
export const isLeveragedProduct = (name: string): boolean => LEVERAGED.test(name);

// ETF/ETN/Fund/Trust/Index, or a fund family's brand. Plain "Shares" stays a company's (ADRs, "Common Shares").
const FUND_NAME = /\b(?:etfs?|etns?|funds?|trust|index|ishares|proshares|spdr)\b/i;

/**
 * Pure. A name that reads as a fund, so it is never paid for as a company (Financial Datasets' company list has funds too).
 * ponytail: names only; a company called "... Trust" (some REITs) reads as a fund and just gets no company card.
 */
export const readsAsFund = (name: string): boolean => FUND_NAME.test(name);

/** `name` is the product's name from Alpaca's asset list, when the caller has it (Zoe's propose does). */
export interface InvestProposal { symbol: string; amountCents: Cents; name?: string }

/** Pure. Refuses below the investing level, off the allowlist, leveraged, above savings or under $1; otherwise the custodian always approves. */
export function decideInvestment(grant: Grant, p: InvestProposal, savingsCents: Cents): Decision {
  const refuse = (constraint: string, detail: string): Reason => ({ constraint, detail });
  const reasons: Reason[] = [
    ...(!LEVELS[grant.level].investing ? [refuse("invest.level", `Investing opens at Level ${INVESTING_FROM}`)] : []),
    ...(!grant.fundAllowlist.includes(p.symbol) ? [refuse("invest.allowlist", `${p.symbol} is not on the investing list`)] : []),
    ...(p.name && isLeveragedProduct(p.name) ? [refuse("invest.leveraged", LEVERAGED_TEXT)] : []),
    ...(!Number.isInteger(p.amountCents) || p.amountCents < MIN_INVEST_CENTS ? [refuse("invest.minimum", "Minimum investment is $1.00")] : []),
    ...(p.amountCents > savingsCents ? [refuse("invest.savings", "More than the savings available")] : []),
  ];
  if (reasons.length > 0) return { outcome: "REFUSE", reasons, semanticRules: [] };
  return { outcome: "NEEDS_APPROVAL", reasons: [refuse("approval.investment", "Every investment needs the guardian's approval")], semanticRules: [] };
}
