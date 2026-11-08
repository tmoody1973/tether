// The plain-words clause Amara signs and Zoe reads. Deterministic code only: no model touches the consent surface.
import { LEVELS, askOverCents, commitmentFloorCents, unspentCents, type Level } from "@/engine/ladder";
import type { Cents, CostTerms, SpendingMode } from "@/engine/types";

export type Seg = string | { b: string };

export interface ClauseInput {
  teenName: string; level: Level; shops: string[]; floorPct: number; matchPct: number; expiresAt: Date;
  /** Decision 030: Amara's spending mode, investing switch and cost estimates, when set. */
  spending?: SpendingMode; investing?: boolean; costs?: CostTerms;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatCents = (c: Cents): string => usd.format(c / 100);

// UTC, so the server render and the browser agree, and it matches the ledger's UTC weeks.
const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const formatDay = (d: Date): string => day.format(d).replace(",", "");

export function matchWords(pct: number): string {
  if (pct < 100) return `${pct}¢ for every $1`;
  return pct % 100 === 0 ? `$${pct / 100} for every $1` : `${formatCents(pct)} for every $1`;
}

export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** What comes to Amara first: the level's rule, or her spending mode (decision 030). */
export function approvalWords(level: Level, spending?: SpendingMode): string {
  const def = LEVELS[level];
  if (spending?.mode === "every") return "Every purchase comes to you first.";
  const overCents = askOverCents(level, spending);
  if (overCents === null) {
    return def.firstTimeApproval ? "Anything at a shop she hasn't used before comes to you first." : "Nothing inside these shops needs your OK.";
  }
  const over = `Anything over ${formatCents(overCents)}`;
  return def.firstTimeApproval ? `${over}, or at a shop she hasn't used before, comes to you first.` : `${over} comes to you first.`;
}

/** The same rule as a table cell: "over $10.00, or a new shop". */
export function approvalShort(level: Level, spending?: SpendingMode): string {
  const def = LEVELS[level];
  if (spending?.mode === "every") return "every purchase";
  const overCents = askOverCents(level, spending);
  const shop = def.firstTimeApproval ? "a shop she hasn't used" : null;
  if (overCents === null) return shop ?? "nothing inside her shops";
  return `over ${formatCents(overCents)}${shop ? `, or ${shop}` : ""}`;
}

/** "8.25%" from 825 basis points. */
export const taxPctWords = (bps: number): string => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/** Decision 030: the clause's sentence about estimated costs. */
export const costsClause = (c: CostTerms): string =>
  `Each purchase counts at its estimated full cost: the price, ${taxPctWords(c.salesTaxBps)} sales tax and ${formatCents(c.shippingCents)} shipping an order. `;

export function grantClause(i: ClauseInput): Seg[] {
  const def = LEVELS[i.level];
  const floor = commitmentFloorCents(def.weeklyCents, i.floorPct);
  const where = i.shops.length ? ` at ${listWords(i.shops)}.` : ", at the shops you allow.";
  return [
    `${i.teenName} can spend up to `, { b: `${formatCents(def.weeklyCents)} a week` }, `${where} `,
    `${approvalWords(i.level, i.spending)} `,
    ...(def.investing && i.investing !== false ? ["She can also propose investing her savings; you approve each one. "] : []),
    ...(def.investing && i.investing === false ? ["Investing is off. "] : []),
    ...(i.costs ? [costsClause(i.costs)] : []),
    ...(floor > 0 ? ["She saves at least ", { b: `${formatCents(floor)} a week` }, "; "] : ["She chooses what to save; "]),
    "whatever she doesn't spend is recorded as an amount you promise her; Tether doesn't hold or set aside money. ",
    i.matchPct > 0
      ? `When she moves up a level, you match what she saved, ${matchWords(i.matchPct)}. `
      : "There's no match on what she saves. ",
    "Each purchase is checked against these rules first, then charged to your saved PayPal. ",
    `This ends ${formatDay(i.expiresAt)} — you can change or cancel it any time.`,
  ];
}

export const clauseText = (segs: Seg[]): string => segs.map((s) => (typeof s === "string" ? s : s.b)).join("");

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
/** "8 Oct 12:40" (UTC, demo clock), for the record's payment rows. */
export const formatWhen = (d: Date): string => when.format(d).replace(",", "");

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
/** "2026-11" → "November 2026". */
export const formatMonth = (month: string): string => monthName.format(new Date(`${month}-01T00:00:00Z`));

// ---- shop search (Amara's "Add a shop" and Zoe's "Suggest a shop") ----
/** Under a shop that sells what she searched for. */
export const matchingProducts = (n: number) => (n === 1 ? "1 matching product" : `${n} matching products`);
/** Product search ran past its time limit: say so instead of hiding the group. */
export const sellsTooSlow = (q: string) => `Shops that sell ${q} took too long — try again.`;
export const noShopsFound = (q: string) => `No shops found for "${q}". Try another word, or the shop's name.`;
export const SHOP_QUERY_MAX = 60; // a shop search is 1–60 characters, trimmed
export const SHOP_QUERY_WORDS = "Type what you'd buy there, or the shop's name.";
export const SHOP_SEARCH_DOWN = "Shop search isn't working right now. Try again in a bit.";

/** "$5", "5.5", "$1,250.00" → integer cents; anything else (negative, more than 2 decimals, words) → null. */
export function parseDollars(input: string): Cents | null {
  const m = input.trim().replace(/^\$/, "").replace(/,/g, "").match(/^(\d{1,7})(?:\.(\d{1,2}))?$/);
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}

// ---- Decision 029: weekly changes wait for next week; stopping keeps this week's promise ---------------------------

/**
 * The two ways a weekly-amount change can land. `later` (the default): it starts at the next week. `now` ("Change this
 * week too"): the exact consequence for this week, from what she has spent so far and the savings promise the week is
 * judged on (`promisedCents`, as week close will use it). A week left below that promise can't count toward a level-up.
 */
export function weekChangeWords(i: {
  teenName: string; fromCents: Cents; toCents: Cents; spentCents: Cents; promisedCents: Cents; startsOn: Date;
}) {
  const left = unspentCents(i.toCents, i.spentCents);
  const spent = i.spentCents > i.toCents
    ? `${i.teenName} has already spent ${formatCents(i.spentCents)}, ${formatCents(i.spentCents - i.toCents)} more than that, so she has ${formatCents(left)} left`
    : `${i.teenName} has spent ${formatCents(i.spentCents)}, so she has ${formatCents(left)} left`;
  const level = left < i.promisedCents
    ? ` That's less than the ${formatCents(i.promisedCents)} she promised to save, so this week won't count toward her next level.` : "";
  return {
    later: `From ${formatDay(i.startsOn)}: ${formatCents(i.toCents)}/week. This week stays ${formatCents(i.fromCents)}.`,
    now: `This week becomes ${formatCents(i.toCents)}. ${spent}, `
      + `and this week adds ${formatCents(left)} to what you've promised instead of ${formatCents(unspentCents(i.fromCents, i.spentCents))}.${level}`,
  };
}

export const STOP_CONFIRM =
  "This stops purchases immediately and disconnects your saved PayPal. This week's savings still count as promised. Savings already recorded remain yours to pay.";
/** The shared demo family keeps its saved PayPal (final review C1), so its confirm can't say "disconnects". */
export const STOP_CONFIRM_DEMO =
  "This stops purchases immediately. Demo: your saved PayPal is kept so the next person can try it. This week's savings still count as promised. Savings already recorded remain yours to pay.";

/** The line after Stop, by what PayPal said about the saved wallet. */
export function stoppedWords(how: string, zoe: string): { text: string; warn?: boolean } | null {
  if (how === "wallet-removed") return { text: `Rules stopped. ${zoe} can't spend until you sign new ones, and PayPal removed your saved wallet.` };
  if (how === "wallet-kept") return { text: "Rules stopped. PayPal didn't confirm removing the saved wallet — remove Tether in PayPal settings: Settings → Payments → Automatic payments.", warn: true };
  if (how === "demo-kept") return { text: `Rules stopped. ${zoe} can't spend until you sign new ones. Demo: your saved PayPal is kept so the next person can try it.` };
  if (how === "no-wallet") return { text: `Rules stopped. ${zoe} can't spend until you sign new ones. There was no saved PayPal to remove.` };
  return null;
}

/** Self-started families are retired 7 days after they were made (decision 026). */
export const retirementWords = (on: Date): string =>
  `This demo family is removed on ${formatDay(on)}. Its links stop working then. Save or print your statement before.`;

// ---- Decision 030: Amara's consent controls --------------------------------------------------------------------------

/** The one sentence before she confirms a spending-mode change: what comes to her first, before and after. */
export const spendingChangeWords = (teen: string, level: Level, from: SpendingMode | undefined, to: SpendingMode): string =>
  `What comes to you first for ${teen} changes from ${approvalShort(level, from)} to ${approvalShort(level, to)}, starting now.`;

export const pauseConfirmWords = (teen: string): string =>
  `Pause ${teen}'s spending now? Nothing is bought without your OK until you resume. She can still ask you, her week and savings promise carry on, and your saved PayPal stays connected.`;
export const pausedNoteWords = (teen: string, since: Date): string =>
  `${teen}'s spending is paused since ${formatDay(since)}. Anything she wants comes to you as an ask.`;

export const investingChangeWords = (teen: string, on: boolean): string => on
  ? `Turn investing back on? ${teen} can propose investing her savings again; you approve each one.`
  : `Turn investing off? ${teen} can't propose new investments. What she has already invested stays hers and isn't sold.`;

/** The cost-estimate change, before and after, in one sentence. */
export const costsChangeWords = (from: CostTerms | undefined, to: CostTerms): string =>
  `New purchases will count ${taxPctWords(to.salesTaxBps)} sales tax and ${formatCents(to.shippingCents)} shipping an order${from
    ? ` (now ${taxPctWords(from.salesTaxBps)} and ${formatCents(from.shippingCents)})` : ""}, starting now.`;

/** Plainly: these are estimates, and what a real launch would do instead. */
export const ESTIMATES_NOTE =
  "Tax and shipping are Tether's estimates: the shops' product data gives the item price only. In a real launch the store's checkout gives the actual total, and if it is higher than what was approved, Tether asks again.";

/** "Item $12.99 · est. tax $1.04 · est. shipping $5.99 · total $20.02", or just the price for a cart without estimates. */
export function costLine(c: { totalCents: Cents; itemsCents?: Cents; estTaxCents?: Cents; estShippingCents?: Cents }): string {
  if (c.itemsCents === undefined || c.estTaxCents === undefined || c.estShippingCents === undefined) return formatCents(c.totalCents);
  return `Item ${formatCents(c.itemsCents)} · est. tax ${formatCents(c.estTaxCents)} · est. shipping ${formatCents(c.estShippingCents)} · total ${formatCents(c.totalCents)}`;
}

/** Decision 030: a non-new offer says so (Channel3 states "used", or nothing). */
export const conditionWords = (c: string | undefined): string | null =>
  c === "used" ? "Used" : c === "unknown" ? "Condition not stated" : null;
