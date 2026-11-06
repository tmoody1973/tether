// The plain-words clause Amara signs and Zoe reads. Deterministic code only: no model touches the consent surface.
import { LEVELS, commitmentFloorCents, type Level } from "@/engine/ladder";
import type { Cents } from "@/engine/types";

export type Seg = string | { b: string };

export interface ClauseInput {
  teenName: string; level: Level; shops: string[]; floorPct: number; matchPct: number; expiresAt: Date;
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

export function approvalWords(level: Level): string {
  const def = LEVELS[level];
  if (def.approvalOverCents === null) return "Nothing inside these shops needs your OK.";
  const over = `Anything over ${formatCents(def.approvalOverCents)}`;
  return def.firstTimeApproval ? `${over}, or at a shop she hasn't used before, comes to you first.` : `${over} comes to you first.`;
}

/** The same rule as a table cell: "over $10.00, or a new shop". */
export function approvalShort(level: Level): string {
  const def = LEVELS[level];
  if (def.approvalOverCents === null) return "nothing inside her shops";
  return `over ${formatCents(def.approvalOverCents)}${def.firstTimeApproval ? ", or a shop she hasn't used" : ""}`;
}

export function grantClause(i: ClauseInput): Seg[] {
  const def = LEVELS[i.level];
  const floor = commitmentFloorCents(def.weeklyCents, i.floorPct);
  const where = i.shops.length ? ` at ${listWords(i.shops)}.` : ", at the shops you allow.";
  return [
    `${i.teenName} can spend up to `, { b: `${formatCents(def.weeklyCents)} a week` }, `${where} `,
    `${approvalWords(i.level)} `,
    ...(def.investing ? ["She can also propose investing her savings; you approve each one. "] : []),
    ...(floor > 0 ? ["She saves at least ", { b: `${formatCents(floor)} a week` }, "; "] : ["She chooses what to save; "]),
    "whatever she doesn't spend counts as saved, and stays in your PayPal. ",
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
