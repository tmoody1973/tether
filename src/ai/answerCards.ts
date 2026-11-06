// Amara's answer cards (decision 019). The model writes the sentence; these cards show the numbers, built only from
// the tool results Tether fetched for this question. Same whitelists as the tools: no ids, no PayPal free text.
import { FLAG_WORDS, LAG_NOTE } from "@/flows/reconcile";
import { hiddenNote, itemsLine } from "@/ui/activityWords";
import type { CheckinResult, MatchResult, RecordResult } from "@/ai/monthAssistant";

/** tether_record's words for a payment Amara approved one by one (the card says "You approved"). */
export const APPROVED_BY_AMARA = "Amara approved this one";

/** The last result of each tool in one answer, as the tool returned it. */
export interface ToolResults { tether_record?: RecordResult; month_checkin?: CheckinResult; paypal_check?: MatchResult }

export interface PurchasesCard {
  kind: "purchases"; month: string; totalCents: number;
  rows: { date: string; shop: string; items: string | null; amountCents: number; allowedBy: "You approved" | "Within her rules" }[];
  /** Payments a demo reset set aside: left out of the rows and the total, as on Activity. */
  hiddenNote: string | null;
}
export interface CheckinCard {
  kind: "checkin"; month: string; level: number | null;
  week: { spentCents: number; leftCents: number; allowanceCents: number };
  weeks: { covers: string; count: number; kept: number; insideBudget: number; savedCents: number };
  nextCheckin: string | null;
}
export interface PaypalCard {
  kind: "paypal"; month: string; matched: number; receiptsChecked: number;
  flags: { label: string; shop: string | null; amountCents: number }[];
  note: string | null;
}
export type AnswerCard = PurchasesCard | CheckinCard | PaypalCard;

const cents = (dollars: string): number => Math.round(Number(dollars) * 100);

function purchasesCard(r: RecordResult): PurchasesCard | null {
  if (!r.month) return null;
  const counted = r.receipts.filter((x) => x.countsTowardBudget);
  const rows = counted.map((x) => ({
    date: x.date, shop: x.shop, items: itemsLine(x.items), amountCents: cents(x.amount),
    allowedBy: x.allowedBy === APPROVED_BY_AMARA ? "You approved" as const : "Within her rules" as const,
  }));
  return { kind: "purchases", month: r.month, rows, totalCents: rows.reduce((s, x) => s + x.amountCents, 0), hiddenNote: hiddenNote(r.receipts.length - counted.length) };
}

const checkinCard = (c: CheckinResult): CheckinCard => ({
  kind: "checkin", month: c.month, level: c.level,
  week: { spentCents: cents(c.thisWeek.spent), leftCents: cents(c.thisWeek.left), allowanceCents: cents(c.weeklyAllowance) },
  weeks: { covers: c.weeks.covers, count: c.weeks.count, kept: c.weeks.kept, insideBudget: c.weeks.insideBudget, savedCents: cents(c.weeks.saved) },
  nextCheckin: c.nextCheckin,
});

function paypalCard(m: MatchResult): PaypalCard | null {
  if (!m.month) return null;
  const flags = [
    ...m.notYetConfirmed.map((f) => ({ label: FLAG_WORDS.unconfirmed, shop: f.shop, amountCents: cents(f.amount) })),
    ...m.refunded.map((f) => ({ label: FLAG_WORDS.refunded, shop: f.shop, amountCents: cents(f.amount) })),
    ...m.paypalChargesWithoutReceipt.map((f) => ({ label: FLAG_WORDS.paypal_only, shop: null, amountCents: cents(f.amount) })),
  ];
  return { kind: "paypal", month: m.month, matched: m.matched, receiptsChecked: m.receiptsChecked, flags, note: m.notYetConfirmed.length > 0 ? LAG_NOTE : null };
}

/** The cards for one answer, always in this order: purchases, check-in, PayPal. list_transactions makes none. */
export function buildCards(t: ToolResults): AnswerCard[] {
  const cards = [
    t.tether_record ? purchasesCard(t.tether_record) : null,
    t.month_checkin ? checkinCard(t.month_checkin) : null,
    t.paypal_check ? paypalCard(t.paypal_check) : null,
  ];
  return cards.filter((c): c is AnswerCard => c !== null);
}
