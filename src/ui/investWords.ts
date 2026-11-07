import { CASH_HELD_LABEL, NEEDS_REVIEW_LABEL, QUEUED_LABEL } from "@/engine/invest";
import type * as t from "@/db/schema";
import { formatCents } from "@/ui/grantWords";

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
