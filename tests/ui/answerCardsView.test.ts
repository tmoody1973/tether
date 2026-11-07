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
  weeks: { covers: "the weeks counting toward her next review", count: 2, kept: 1, insideBudget: 1, savedCents: 1400 }, nextCheckin: "2026-10-31", rulesStopped: false,
};
const paypal: AnswerCard = {
  kind: "paypal", month: "2026-10", matched: 1, receiptsChecked: 3, note: "PayPal's list can lag a few hours.",
  setAsideNote: "1 payment from an earlier demo reset is hidden; PayPal's check flagged 1 of them.",
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
    expect(t).toContain("1 payment from an earlier demo reset is hidden; PayPal's check flagged 1 of them."); // one line, no detail
    expect(text([{ ...paypal, matched: 2, receiptsChecked: 2, flags: [], note: null, setAsideNote: null }])).toContain("2 of 2 receipts match PayPal");
    expect(text([{ ...paypal, matched: 0, receiptsChecked: 0, flags: [], note: null, setAsideNote: null }])).toContain("No receipts to check in October 2026.");
  });

  it("stopped rules: says spending is stopped, never shows money left (CodeRabbit)", () => {
    const t = text([{ ...checkin, rulesStopped: true }]);
    expect(t).toContain("Spending is stopped");
    expect(t).not.toMatch(/left of/);
  });
  it("no cards, or an unknown kind, renders nothing", () => {
    expect(html([])).toBe("");
    expect(html([{ kind: "dashboard", html: "<script>x</script>" }])).toBe("");
  });
});

describe("AnswerCards: investing (decision 022)", () => {
  const investments: AnswerCard = { kind: "investments", teen: "Zoe", rows: [
    { symbol: "VTI", shares: 0.0138, putInCents: 500, worthCents: 500, marketCents: null },
    { symbol: "VOO", shares: 1.5, putInCents: 80000, worthCents: 82000, marketCents: 81500 },
  ] };
  const inside: AnswerCard = { kind: "inside", symbol: "VTI", asOf: "2026-06-30", rows: [{ name: "NVIDIA", pct: 6.4 }, { name: "Apple", pct: 3.2 }] };
  const news: AnswerCard = { kind: "news", ticker: "AAPL", articles: [
    { title: "Apple's autocomplete restrictions - Reuters", source: "Reuters", date: "2026-11-06", url: "https://www.reuters.com/a" },
    { title: "<img src=x onerror=alert(1)>", source: "Yahoo Finance", date: "2026-11-05", url: null },
  ] };

  it("investments: the teen's name, one row per fund with what it's worth, shares and what she put in, and the market line", () => {
    const t = text([investments]);
    expect(t).toContain("Zoe's investments");
    expect(t).toContain("VTI $5.00");
    expect(t).toContain("0.0138 share · put in $5.00");
    expect(t).toContain("1.50 shares · put in $800.00");
    expect(t).toContain("The same $800.00 in the whole market: $815.00.");
    expect(t.match(/whole market/g)).toHaveLength(1); // no comparison until there is one
    expect(html([investments])).toContain('aria-label="Zoe&#x27;s investments"');
  });

  it("inside: the fund, its rows with one thin bar each scaled to the largest, and the filing date", () => {
    const t = text([inside]);
    expect(t).toContain("What's inside VTI");
    expect(t).toContain("NVIDIA 6.4%");
    expect(t).toContain("Apple 3.2%");
    expect(t).toContain("From the fund's filing for 30 Jun 2026, via Financial Datasets.");
    const h = html([inside]);
    expect(h.match(/class="g-hl__bar"/g)).toHaveLength(2);
    expect(h).toContain("width:100%");
    expect(h).toContain("width:50%");
  });

  it("news: titles link out safely in a new tab; a dropped link shows plain text; titles are escaped", () => {
    const h = html([news]);
    const t = text([news]);
    expect(t).toContain("News about AAPL");
    expect(t).toContain("Reuters · Fri 6 Nov");
    expect(h).toMatch(/<a href="https:\/\/www\.reuters\.com\/a" target="_blank" rel="noopener noreferrer">Apple&#x27;s autocomplete restrictions - Reuters<\/a>/);
    expect(h.match(/<a /g)).toHaveLength(1); // the null url has no link
    expect(h).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(h).not.toContain("<img");
    expect(text([{ ...news, ticker: null }])).toContain("Market news");
  });

  it("a headline with no date shows its source alone, and the card still renders", () => {
    const t = text([{ ...news, articles: [{ title: "Undated", source: "Reuters", date: "", url: null }] }]);
    expect(t).toContain("Undated Reuters");
    expect(t).not.toContain("·");
  });

  it("a link that isn't http(s) never renders as a link, even if a card arrives with one", () => {
    const h = html([{ ...news, articles: [{ title: "x", source: "s", date: "2026-11-06", url: "javascript:alert(1)" }] }]);
    expect(h).not.toContain("<a ");
    expect(h).not.toContain("javascript:");
  });
});
