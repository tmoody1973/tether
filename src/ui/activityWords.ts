// Plain words for Amara's Activity page and nav. Deterministic code only.
import { LAG_NOTE, type Reconciliation } from "@/flows/reconcile";

const DAY_MS = 86_400_000;

const HOUR_MS = 3_600_000;

/** How far behind PayPal's list is, in words: "under an hour", "about 1 hour", "about 3 hours". */
export function lagWords(ms: number): string {
  const h = Math.round(ms / HOUR_MS);
  return h < 1 ? "under an hour" : `about ${h} hour${h === 1 ? "" : "s"}`;
}

/**
 * One payment's PayPal check, from the month's reconciliation (or while it's still loading / PayPal is down).
 * `waiting`: PayPal's list hasn't reached this payment's time yet: nothing is wrong, so it reads quiet, not amber.
 * Relative words only: the Proof box shows demo-clock times, PayPal's list runs on real time.
 */
export function checkWords(
  rec: Reconciliation | "checking" | "down", captureId: string, realNow: Date = new Date(),
): { text: string; ok: boolean; waiting?: true } {
  if (rec === "checking") return { text: "Checking with PayPal…", ok: false };
  if (rec === "down") return { text: "Couldn't reach PayPal to check. Try again later.", ok: false };
  const flag = rec.flags.find((f) => f.captureId === captureId);
  if (!flag) return { text: "Matches PayPal", ok: true };
  if (flag.kind === "refunded") return { text: "Refunded in PayPal", ok: false };
  const through = rec.refreshedThrough;
  if (flag.kind === "unconfirmed" && through) {
    if (flag.paidAt > through) {
      const behind = lagWords(Math.max(0, realNow.getTime() - through.getTime()));
      return { text: `Paid. PayPal's list is ${behind} behind and hasn't reached this payment yet. It will show here once PayPal catches up.`, ok: false, waiting: true };
    }
    return { text: "Not confirmed by PayPal: its list covers the time of this payment but doesn't show it.", ok: false };
  }
  return { text: `Not yet confirmed by PayPal. ${LAG_NOTE}`, ok: false };
}

/** Rows a demo reset set aside stay in the data; Amara's list just doesn't show them. */
export function shownReceipts<T extends { setAside: boolean }>(rows: T[]): { shown: T[]; hidden: number } {
  const shown = rows.filter((r) => !r.setAside);
  return { shown, hidden: rows.length - shown.length };
}

/** `flagged`: hidden rows PayPal's check raised a flag on (refunded / not confirmed), so hiding never silences one. */
export function hiddenNote(n: number, flagged = 0): string | null {
  if (n === 0) return null;
  const base = n === 1 ? "1 payment from an earlier demo reset is hidden" : `${n} payments from earlier demo resets are hidden`;
  return flagged > 0 ? `${base}; PayPal's check flagged ${flagged} of them.` : `${base}.`;
}

/** What she bought, under the shop: the first item, then how many more ("Crayola 64-pack + 1 more"). Null: no items. */
export const itemsLine = (items: { title: string }[]): string | null =>
  items.length === 0 ? null : items.length === 1 ? items[0].title : `${items[0].title} + ${items.length - 1} more`;

/** Sunday of `now`'s ISO week, UTC (the ledger's weeks). */
export function weekEnd(now: Date): Date {
  const day = now.getUTCDay() || 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + (7 - day) * DAY_MS);
}

/** Last day of `now`'s month, UTC: when the monthly check-in runs. */
export const monthEnd = (now: Date): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

/** The Home tab's count of things waiting for her; none ⇒ no badge. */
export const needsBadge = (n: number): string | null => (n <= 0 ? null : n > 9 ? "9+" : String(n));

/** Promotions recorded before the wording fix said "your" to Amara about Zoe; show them the fixed way. */
export const herReason = (reason: string): string => reason.replace(/^Kept your savings commitment/, "Kept her savings promise");
