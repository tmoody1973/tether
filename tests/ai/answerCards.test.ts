import { describe, expect, it } from "vitest";
import { buildCards, httpUrl } from "@/ai/answerCards";

const receipt = (date: string, shop: string, amount: string, extra: object = {}) => ({
  date, shop, items: [{ title: "Book", qty: 1 }], amount, status: "paid" as const, ruleVersion: 3,
  allowedBy: "within the rules the parent signed", ...extra,
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
      receipt("2026-10-20", "Target", "8.00", { allowedBy: "the parent approved this one" }),
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

const investments = {
  teen: "Zoe",
  holdings: [{ symbol: "VTI", shares: "0.0138", putIn: "5.00", worthNow: "5.48", firstBought: "2026-11-06", sameMoneyInWholeMarket: "5.52", tooSoonToTell: false }],
  otherInvestments: [{ symbol: "VOO", amount: "3.00", status: "Waiting for you" }],
};
const inside = { symbol: "VTI", asOf: "2026-06-30", topPct: 32, rows: [{ name: "NVIDIA", ticker: "NVDA", pct: 6.4 }, { name: "Apple", ticker: "AAPL", pct: 5.9 }] };
const article = (title: string, url: string) => ({ title, source: "Reuters", date: "2026-11-06", url });

describe("buildCards: investing (decision 022)", () => {
  it("investments: one row per holding in cents, from the tool result", () => {
    expect(buildCards({ zoe_investments: investments })).toEqual([{
      kind: "investments", teen: "Zoe", rows: [{ symbol: "VTI", shares: 0.0138, putInCents: 500, worthCents: 548, marketCents: 552 }],
    }]);
    expect(buildCards({ zoe_investments: { ...investments, holdings: [] } })).toEqual([]); // nothing bought yet: no card
  });

  it("inside: the rows (no tickers) and the filing date; none when refused or unavailable", () => {
    expect(buildCards({ fund_inside: inside })).toEqual([{ kind: "inside", symbol: "VTI", asOf: "2026-06-30", rows: [{ name: "NVIDIA", pct: 6.4 }, { name: "Apple", pct: 5.9 }] }]);
    expect(buildCards({ fund_inside: { error: "That fund isn't on Zoe's list." } })).toEqual([]);
    expect(buildCards({ fund_inside: { symbol: "VTI", unavailable: "What's inside VTI isn't available right now." } })).toEqual([]);
  });

  it("news: up to five headlines; a link that isn't http(s) is dropped, the title kept", () => {
    const [card] = buildCards({ news: { ticker: "AAPL", articles: [
      article("Apple news", "https://www.reuters.com/a"), article("Bad link", "javascript:alert(1)"), article("Data link", "data:text/html,<b>x</b>"),
      article("Plain", "http://example.com/x"), article("Not a url", "reuters.com/a"), article("Sixth", "https://x.test/6"),
    ] } });
    expect(card).toEqual({ kind: "news", ticker: "AAPL", articles: [
      { title: "Apple news", source: "Reuters", date: "2026-11-06", url: "https://www.reuters.com/a" },
      { title: "Bad link", source: "Reuters", date: "2026-11-06", url: null },
      { title: "Data link", source: "Reuters", date: "2026-11-06", url: null },
      { title: "Plain", source: "Reuters", date: "2026-11-06", url: "http://example.com/x" },
      { title: "Not a url", source: "Reuters", date: "2026-11-06", url: null },
    ] });
  });

  it("news: none when refused, unavailable, or a fund's note with no articles", () => {
    expect(buildCards({ news: { error: "That isn't one of Zoe's funds or a company inside them." } })).toEqual([]);
    expect(buildCards({ news: { ticker: null, unavailable: "The news isn't available right now." } })).toEqual([]);
    expect(buildCards({ news: { ticker: "VTI", articles: [], note: "Funds don't have their own news; ask about one of the companies inside it." } })).toEqual([]);
  });

  it("httpUrl keeps only http and https", () => {
    expect(httpUrl("https://a.test/x?y=1")).toBe("https://a.test/x?y=1");
    for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", " javascript:alert(1)", "vbscript:x", "file:///etc/passwd", "", "//evil.test"]) expect(httpUrl(bad)).toBeNull();
  });

  it("always in one order: ... PayPal, investments, inside, news", () => {
    const cards = buildCards({ news: { ticker: null, articles: [article("a", "https://a.test")] }, fund_inside: inside, zoe_investments: investments, month_checkin: checkin });
    expect(cards.map((c) => c.kind)).toEqual(["checkin", "investments", "inside", "news"]);
  });
});
