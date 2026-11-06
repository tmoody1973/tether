import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnswerCards } from "@/app/g/AnswerCards";
import type { AnswerCard } from "@/ai/answerCards";

const html = (cards: unknown[]) => renderToStaticMarkup(createElement(AnswerCards, { cards: cards as AnswerCard[] }));
/** Visible text: tags dropped, entities decoded, whitespace collapsed. */
const text = (cards: unknown[]) => html(cards).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const purchases: AnswerCard = {
  kind: "purchases", month: "2026-10", totalCents: 2050, hiddenNote: "1 payment from an earlier demo reset is hidden.",
  rows: [
    { date: "2026-10-05", shop: "The Bookshop", items: "<b>Pens</b> + 1 more", amountCents: 1250, allowedBy: "Within her rules" },
    { date: "2026-10-20", shop: "Target", items: null, amountCents: 800, allowedBy: "You approved" },
  ],
};
const checkin: AnswerCard = {
  kind: "checkin", month: "2026-10", level: 1, week: { spentCents: 150, leftCents: 1850, allowanceCents: 2000 },
  weeks: { covers: "the weeks counting toward her next review", count: 2, kept: 1, insideBudget: 1, savedCents: 1400 }, nextCheckin: "2026-10-31",
};
const paypal: AnswerCard = {
  kind: "paypal", month: "2026-10", matched: 1, receiptsChecked: 3, note: "PayPal's list can lag a few hours.",
  flags: [
    { label: "Receipt not confirmed by PayPal", shop: "The Bookshop", amountCents: 800 },
    { label: "PayPal charged, Tether has no receipt", shop: null, amountCents: 425 },
  ],
};

describe("AnswerCards (under the assistant's answer)", () => {
  it("purchases: the month, a count and total, and Activity-style rows; shop text is escaped, never markup", () => {
    const t = text([purchases]);
    expect(t).toContain("October 2026 purchases");
    expect(t).toContain("2 payments · $20.50");
    expect(t).toContain("Mon 5 Oct The Bookshop");
    expect(t).toContain("Within her rules $12.50");
    expect(t).toContain("You approved $8.00");
    expect(t).toContain("1 payment from an earlier demo reset is hidden.");
    expect(html([purchases])).toContain("&lt;b&gt;Pens&lt;/b&gt; + 1 more");
    expect(html([purchases])).not.toContain("<b>Pens");
    expect(html([purchases])).toContain('class="g-row"');
  });

  it("an empty month says so, naming the month", () => {
    expect(text([{ ...purchases, rows: [], totalCents: 0, hiddenNote: null }])).toContain("No payments in October 2026.");
  });

  it("check-in: level, this week with one bar, the weeks, saved, and when the check-in runs", () => {
    const t = text([checkin]);
    expect(t).toContain("October 2026 check-in");
    expect(t).toContain("Level 1");
    expect(t).toContain("$1.50 spent · $18.50 left of $20.00");
    expect(t).toContain("Weeks inside budget 1 of 2");
    expect(t).toContain("Kept her savings promise 1 of 2");
    expect(t).toContain("Saved $14.00");
    expect(t).toContain("Check-in runs Sat 31 Oct");
    expect(html([checkin]).match(/class="g-bar"/g)).toHaveLength(1); // one bar per card, never a chart
  });

  it("PayPal: how many receipts match, then each flag with shop and amount", () => {
    const t = text([paypal]);
    expect(t).toContain("1 of 3 receipts match PayPal");
    expect(t).toContain("Receipt not confirmed by PayPal The Bookshop $8.00");
    expect(t).toContain("PayPal charged, Tether has no receipt $4.25");
    expect(t).toContain("PayPal's list can lag a few hours.");
    expect(text([{ ...paypal, matched: 2, receiptsChecked: 2, flags: [], note: null }])).toContain("2 of 2 receipts match PayPal");
    expect(text([{ ...paypal, matched: 0, receiptsChecked: 0, flags: [], note: null }])).toContain("No receipts to check in October 2026.");
  });

  it("no cards, or an unknown kind, renders nothing", () => {
    expect(html([])).toBe("");
    expect(html([{ kind: "dashboard", html: "<script>x</script>" }])).toBe("");
  });
});
