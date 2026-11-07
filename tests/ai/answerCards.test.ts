import { describe, expect, it } from "vitest";
import { buildCards } from "@/ai/answerCards";

const receipt = (date: string, shop: string, amount: string, extra: object = {}) => ({
  date, shop, items: [{ title: "Book", qty: 1 }], amount, status: "paid" as const, ruleVersion: 3,
  allowedBy: "within the rules Amara signed", ...extra,
});
const checkin = {
  month: "2026-10", level: 1 as const, rulesStopped: false, weeklyAllowance: "20.00", thisWeek: { spent: "1.50", left: "18.50" },
  weeks: { covers: "the weeks counting toward her next review", count: 2, kept: 1, insideBudget: 1, saved: "14.00", allowance: "40.00" },
  nextReview: { outcome: "stays at Level 1", weeksKeptInARow: 0, reason: "1 of 2 weeks kept — keep going." },
  openRelease: null, totalSavings: "14.00", availableToInvest: "11.00", nextCheckin: "2026-10-31",
};
const match = {
  month: "2026-10", receiptsChecked: 3, matched: 1,
  notYetConfirmed: [{ shop: "The Bookshop", amount: "8.00" }], refunded: [{ shop: "Target", amount: "3.00" }],
  paypalChargesWithoutReceipt: [{ amount: "4.25" }], note: "PayPal's list can lag a few hours.",
  setAsideNote: "2 payments from earlier demo resets are hidden; PayPal's check flagged 1 of them.",
};

describe("buildCards (cards come from tool results, never from the model's text)", () => {
  it("purchases: receipts as rows (items on one line, approval in Amara's words), a total, and the set-aside count line", () => {
    const cards = buildCards({ tether_record: { month: "2026-10", setAsideNote: "1 payment from an earlier demo reset is hidden.", receipts: [
      receipt("2026-10-05", "The Bookshop", "12.50", { items: [{ title: "Crayola 64-pack", qty: 1 }, { title: "Sketchbook", qty: 2 }] }),
      receipt("2026-10-20", "Target", "8.00", { allowedBy: "Amara approved this one" }),
    ] } });
    expect(cards).toEqual([{
      kind: "purchases", month: "2026-10", totalCents: 2050, hiddenNote: "1 payment from an earlier demo reset is hidden.",
      rows: [
        { date: "2026-10-05", shop: "The Bookshop", items: "Crayola 64-pack + 1 more", amountCents: 1250, allowedBy: "Within her rules" },
        { date: "2026-10-20", shop: "Target", items: "Book", amountCents: 800, allowedBy: "You approved" },
      ],
    }]);
  });

  it("check-in: level, this week, the weeks behind the review, saved, next check-in", () => {
    expect(buildCards({ month_checkin: checkin })).toEqual([{
      kind: "checkin", month: "2026-10", level: 1,
      week: { spentCents: 150, leftCents: 1850, allowanceCents: 2000 },
      weeks: { covers: "the weeks counting toward her next review", count: 2, kept: 1, insideBudget: 1, savedCents: 1400 },
      nextCheckin: "2026-10-31", rulesStopped: false,
    }]);
  });
  it("check-in: stopped rules travel to the card (CodeRabbit)", () => {
    expect(buildCards({ month_checkin: { ...checkin, rulesStopped: true } })).toMatchObject([{ kind: "checkin", rulesStopped: true }]);
  });

  it("PayPal: how many receipts match, plus each flag as label, shop and amount; the lag note only when something is unconfirmed", () => {
    expect(buildCards({ paypal_check: match })).toEqual([{
      kind: "paypal", month: "2026-10", matched: 1, receiptsChecked: 3, note: "PayPal's list can lag a few hours.",
      setAsideNote: "2 payments from earlier demo resets are hidden; PayPal's check flagged 1 of them.",
      flags: [
        { label: "Receipt not confirmed by PayPal", shop: "The Bookshop", amountCents: 800 },
        { label: "Refunded in PayPal", shop: "Target", amountCents: 300 },
        { label: "PayPal charged, Tether has no receipt", shop: null, amountCents: 425 },
      ],
    }]);
    const clean = { ...match, receiptsChecked: 2, matched: 2, notYetConfirmed: [], refunded: [], paypalChargesWithoutReceipt: [], setAsideNote: null };
    expect(buildCards({ paypal_check: clean })).toEqual([{ kind: "paypal", month: "2026-10", matched: 2, receiptsChecked: 2, flags: [], note: null, setAsideNote: null }]);
  });

  it("a result with no month (the model asked for a malformed one) makes no card", () => {
    expect(buildCards({ tether_record: { month: null, receipts: [], setAsideNote: null }, paypal_check: { ...match, month: null } })).toEqual([]);
  });

  it("an empty month still gets its card, so the month checked shows", () => {
    expect(buildCards({ tether_record: { month: "2026-08", receipts: [], setAsideNote: null } }))
      .toEqual([{ kind: "purchases", month: "2026-08", rows: [], totalCents: 0, hiddenNote: null }]);
  });

  it("always in one order: purchases, check-in, PayPal", () => {
    const cards = buildCards({ paypal_check: match, month_checkin: checkin, tether_record: { month: "2026-10", receipts: [], setAsideNote: null } });
    expect(cards.map((c) => c.kind)).toEqual(["purchases", "checkin", "paypal"]);
  });
});
