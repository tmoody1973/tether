// Plain words for Amara's Activity page and nav. Deterministic code only.
import { LAG_NOTE, type Reconciliation } from "@/flows/reconcile";

const DAY_MS = 86_400_000;

/** One payment's PayPal check, from the month's reconciliation (or while it's still loading / PayPal is down). */
export function checkWords(rec: Reconciliation | "checking" | "down", captureId: string): { text: string; ok: boolean } {
  if (rec === "checking") return { text: "Checking with PayPal…", ok: false };
  if (rec === "down") return { text: "Couldn't reach PayPal to check. Try again later.", ok: false };
  const flag = rec.flags.find((f) => f.captureId === captureId);
  if (!flag) return { text: "Matches PayPal", ok: true };
  if (flag.kind === "refunded") return { text: "Refunded in PayPal", ok: false };
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
