// Zoe's words. Deterministic: numbers come from the engine and ledger, never from a model (the refusal sentence
// itself is src/ai/explain.ts, which falls back to its own template).
import { LEVELS, commitmentKept, type Level, type WeekRecord } from "@/engine/ladder";
import type { Cents, Decision } from "@/engine/types";
import { formatCents } from "@/ui/grantWords";
import { CHARGE_FAILED_MESSAGE } from "@/flows/purchase";
import type { PurchaseStatus } from "@/db/repo";
import type * as schema from "@/db/schema";
import { NEEDS_REVIEW_LABEL, QUEUED_LABEL } from "@/engine/invest";
import type { ShopTile } from "@/flows/teenMap";

export type CardKind = "fits" | "needs" | "over" | "refused";

/** The label every result card carries (D6 / F5): what the rules would do, never a rating. */
export function cardOutcome(d: Decision, guardian: string): { kind: CardKind; label: string } {
  if (d.outcome === "ALLOW") return { kind: "fits", label: "Fits your week" };
  if (d.outcome === "NEEDS_APPROVAL") return { kind: "needs", label: `Needs ${guardian}'s OK` };
  return d.reasons.some((r) => r.constraint === "payment.budget")
    ? { kind: "over", label: "Over budget" } : { kind: "refused", label: "Not this time" };
}

/** The week's arithmetic. withLeft=false when the sentence above it already says what's left (budget refusals). */
export const sheetNumbers = (spentCents: Cents, weeklyCents: Cents, withLeft = true): string => withLeft
  ? `You've spent ${formatCents(spentCents)} of your ${formatCents(weeklyCents)}, so there's ${formatCents(Math.max(0, weeklyCents - spentCents))} left.`
  : `You've spent ${formatCents(spentCents)} of your ${formatCents(weeklyCents)} this week.`;

const weeks = (n: number) => `${n} week${n === 1 ? "" : "s"}`;

/** D12 moment 1: "This sets Headphones back 1 week." Weeks at her own weekly savings promise. */
export function setsBack(goal: { title: string } | null, amountCents: Cents, commitmentCents: Cents): string | null {
  if (!goal || commitmentCents <= 0 || amountCents <= 0) return null;
  return `This sets ${goal.title} back ${weeks(Math.ceil(amountCents / commitmentCents))}.`;
}

const DAY_MS = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Calendar days (UTC) until her budget starts again: the next ISO week (Monday), or her rules' end if sooner. */
export function daysToReset(now: Date, endsAt: Date | null): number {
  const nextMonday = utcDay(now) + (7 - ((now.getUTCDay() + 6) % 7)) * DAY_MS;
  const target = endsAt ? Math.min(nextMonday, endsAt.getTime()) : nextMonday;
  return Math.max(0, Math.round((utcDay(new Date(target)) - utcDay(now)) / DAY_MS));
}
export const resetsWords = (n: number): string => (n === 0 ? "resets today" : n === 1 ? "resets tomorrow" : `resets in ${n} days`);
export const waitWords = (n: number): string => (n === 0 ? "Wait until later today" : n === 1 ? "Wait until tomorrow" : `Wait ${n} days`);

/** D12 moment 2, on the week-ended screen: her last (up to) 4 weeks against herself, then the goal. */
export function reflection(
  last: WeekRecord[], goal: { title: string; targetCents: Cents } | null, savingsCents: Cents, commitmentCents: Cents,
): string {
  const recent = last.slice(-4);
  if (recent.length === 0) return "That was your first week with Tether.";
  const inside = recent.filter((w) => w.spentCents <= w.allowanceCents).length;
  const kept = recent.filter(commitmentKept).length;
  const parts = [`Inside your rules ${inside} of ${weeks(recent.length)}.`, `You kept your savings promise ${kept} of ${recent.length}.`];
  if (goal) {
    const short = goal.targetCents - savingsCents;
    if (short <= 0) parts.push(`You've saved enough for ${goal.title}.`);
    else if (commitmentCents > 0) parts.push(`${goal.title}: ${weeks(Math.ceil(short / commitmentCents))} away.`);
  }
  return parts.join(" ");
}

function asking(level: Level, guardian: string): string {
  const def = LEVELS[level];
  if (def.approvalOverCents === null) return "nothing inside your shops needs asking";
  return `over ${formatCents(def.approvalOverCents)}${def.firstTimeApproval ? " or a new shop" : ""} needs ${guardian}'s OK`;
}

export const levelLine = (level: Level, guardian: string): string => `Level ${level} · ${asking(level, guardian)}`;

export function levelProgress(streak: number, level: Level): string {
  if (level === 3) return "You're at the top level.";
  const goal = `Keep your savings promise 4 weeks running to reach Level ${level + 1}.`;
  return streak > 0 ? `${goal} You're on ${Math.min(streak, 4)}.` : goal;
}

const OPENS: Record<string, string> = { books: "A bookshop opens too.", apparel: "Clothes and sneaker shops open too." };

/** Mock 5's "What changed", from the level table itself. */
export function whatChanged(from: Level, to: Level, guardian: string): string {
  const def = LEVELS[to];
  const ask = def.approvalOverCents === null
    ? "nothing inside your shops needs asking"
    : `only things over ${formatCents(def.approvalOverCents)} need ${guardian}'s OK`;
  const added = def.merchantClasses.filter((c) => !LEVELS[from].merchantClasses.includes(c));
  const opens = [...added.map((c) => OPENS[c]).filter(Boolean), ...(def.investing && !LEVELS[from].investing ? ["Investing opens too."] : [])];
  return [`Your weekly limit is now ${formatCents(def.weeklyCents)}, and ${ask}.`, ...opens].join(" ");
}

export type BuyFlash = { text: string; sub?: string; warn?: boolean; ask?: boolean };
const NOT_CHARGED: Record<string, string> = {
  changed: "The price or the item changed, so nothing was spent. Have another look.",
  "paypal-off": "Tether can't reach PayPal right now, so nothing was spent.",
  notstarted: "That didn't start, so nothing was spent. Try again in a minute.",
};

/**
 * What Buy did, from the purchase's CURRENT status (this family's purchase only). The URL code is a hint that can
 * only choose between "nothing was spent" explanations; it never makes a purchase look paid.
 */
export function buyFlash(
  code: string, p: { title: string; amountCents: number; shop: string; status: PurchaseStatus } | null,
  guardian: string, setsBackText: string | null,
): BuyFlash | null {
  if (!p) return null;
  const what = `${p.title}, ${formatCents(p.amountCents)} at ${p.shop}`;
  if (p.status === "paid") return { text: `Paid — ${what}.`, ...(setsBackText ? { sub: setsBackText } : {}) };
  if (p.status === "paying") return { text: `PayPal is confirming — ${what}.`, sub: "It's held from your week until PayPal says it went through." };
  if (p.status === "failed") return { text: CHARGE_FAILED_MESSAGE, warn: true };
  if (p.status === "needs_approval") return { text: `That one needs ${guardian}'s OK now, so nothing was spent.`, warn: true, ask: true };
  if (code === "nopaypal") return { text: `${guardian}'s PayPal isn't saved, so nothing was spent.`, warn: true };
  return { text: NOT_CHARGED[code] ?? "That doesn't fit your rules any more, so nothing was spent.", warn: true };
}

/** D12 moment 3, the goal screen's one number. 0 = saved enough; null = no weekly promise to count with. */
export function weeksToGoal(targetCents: Cents, savedCents: Cents, commitmentCents: Cents): number | null {
  const short = Math.max(0, targetCents - savedCents);
  if (short === 0) return 0;
  return commitmentCents > 0 ? Math.ceil(short / commitmentCents) : null;
}

export { parseDollars } from "@/ui/grantWords"; // pure, so the propose form can use it in the browser

type InvestStatus = (typeof schema.investments.$inferSelect)["status"];

/** Her investments, in her words. The hard states use the engine's labels (QUEUED_LABEL is the designed closed-market state). */
export function investStatusWords(s: InvestStatus, guardian: string, declined = false): string {
  if (declined) return `${guardian} said not this time.`;
  const words: Record<InvestStatus, string> = {
    proposed: `Waiting for ${guardian}`,
    approved: `${guardian} said yes. Sending it.`,
    depositing: "Moving your money to your investing account",
    queued: QUEUED_LABEL,
    filled: "Bought",
    rejected: "Didn't go through. Nothing was moved.", // after her yes; her "no" is shown from the approval, not this

    cash_held: `Held as cash in your investing account. ${guardian} can try the order again.`,
    needs_review: NEEDS_REVIEW_LABEL,
    expired: "Asked too long ago — you can ask again.",
  };
  return words[s];
}

/** A map tile's label: Open / Ask first / Locked, plus one plain line. No prices, no ratings (F4). */
export function tileWords(tile: ShopTile, guardian: string): { label: string; line: string } {
  if (tile.kind === "open") return { label: "Open", line: tile.booksOnly ? "Books only" : "In your rules now" };
  if (tile.kind === "ask") return { label: "Ask first", line: `${guardian} says yes the first time` };
  return { label: "Locked", line: tile.opensAt ? `Opens at Level ${tile.opensAt}` : `Not on your list. Ask ${guardian} to add it` };
}
