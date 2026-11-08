// Decision 030: the consent, cost and refund words, pinned.
import { describe, expect, it } from "vitest";
import {
  ESTIMATES_NOTE, approvalWords, clauseText, conditionWords, costLine, costsChangeWords, grantClause, investingChangeWords,
  pauseConfirmWords, pausedNoteWords, spendingChangeWords, taxPctWords,
} from "@/ui/grantWords";
import { INVESTING_OFF_LINE, TEEN_ESTIMATES, cardOutcome, investingOffWords, pausedLine, pausedWords } from "@/ui/teenWords";
import { refundedWords } from "@/ui/activityWords";
import { parseCents, parseCosts, parseSpending, parseTaxBps } from "@/app/g/rules/consentForm";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("consent words (030)", () => {
  it("the level's own words are unchanged; a mode changes them", () => {
    expect(approvalWords(1)).toBe("Anything over $10.00, or at a shop she hasn't used before, comes to you first.");
    expect(approvalWords(2)).toBe("Anything over $20.00 comes to you first.");
    expect(approvalWords(3)).toBe("Nothing inside these shops needs your OK.");
    expect(approvalWords(2, { mode: "every" })).toBe("Every purchase comes to you first.");
    expect(approvalWords(2, { mode: "upTo", upToCents: 1500 })).toBe("Anything over $15.00 comes to you first.");
    expect(approvalWords(1, { mode: "upTo", upToCents: null })).toBe("Anything at a shop she hasn't used before comes to you first.");
  });

  it("before/after in one sentence", () => {
    expect(spendingChangeWords("Zoe", 2, undefined, { mode: "every" }))
      .toBe("What comes to you first for Zoe changes from over $20.00 to every purchase, starting now.");
    expect(spendingChangeWords("Zoe", 1, { mode: "every" }, { mode: "upTo", upToCents: 1500 }))
      .toBe("What comes to you first for Zoe changes from every purchase to over $15.00, or a shop she hasn't used, starting now.");
    expect(costsChangeWords({ salesTaxBps: 800, shippingCents: 599 }, { salesTaxBps: 825, shippingCents: 450 }))
      .toBe("New purchases will count 8.25% sales tax and $4.50 shipping an order (now 8% and $5.99), starting now.");
    expect(investingChangeWords("Zoe", false)).toBe("Turn investing off? Zoe can't propose new investments. What she has already invested stays hers and isn't sold.");
  });

  it("pause words for Amara and Zoe", () => {
    expect(pauseConfirmWords("Zoe")).toBe("Pause Zoe's spending now? Nothing is bought without your OK until you resume. She can still ask you, her week and savings promise carry on, and your saved PayPal stays connected.");
    expect(pausedNoteWords("Zoe", new Date("2026-11-04T12:00:00Z"))).toBe("Zoe's spending is paused since Wed 4 Nov. Anything she wants comes to you as an ask.");
    expect(pausedWords("Amara")).toBe("Paused by Amara");
    expect(pausedLine("Amara")).toBe("Paused by Amara. You can still find things and ask Amara; nothing is bought without her OK. Your week and your savings promise carry on.");
    expect(cardOutcome({ outcome: "NEEDS_APPROVAL", reasons: [{ constraint: "approval.paused", detail: "" }], semanticRules: [] }, "Amara"))
      .toEqual({ kind: "needs", label: "Paused by Amara" });
    expect(investingOffWords("Amara")).toBe("Amara has turned investing off");
    expect(INVESTING_OFF_LINE).toBe("What you've already invested stays yours and isn't sold. You can still see how it's doing below.");
  });

  it("costs: the line, the estimates notes, the condition labels, the signed clause", () => {
    expect(costLine({ itemsCents: 1299, estTaxCents: 104, estShippingCents: 599, totalCents: 2002 }))
      .toBe("Item $12.99 · est. tax $1.04 · est. shipping $5.99 · total $20.02");
    expect(costLine({ totalCents: 800 })).toBe("$8.00");
    expect(ESTIMATES_NOTE).toContain("if it is higher than what was approved, Tether asks again");
    expect(TEEN_ESTIMATES).toMatch(/^Totals include an estimate of tax and shipping\./);
    expect([conditionWords("used"), conditionWords("unknown"), conditionWords("new")]).toEqual(["Used", "Condition not stated", null]);
    expect([taxPctWords(800), taxPctWords(825), taxPctWords(850), taxPctWords(1000), taxPctWords(0)]).toEqual(["8%", "8.25%", "8.5%", "10%", "0%"]);
    const text = clauseText(grantClause({
      teenName: "Zoe", level: 2, shops: ["Target"], floorPct: 10, matchPct: 100, expiresAt: new Date("2026-11-11T00:00:00Z"),
      spending: { mode: "every" }, investing: false, costs: { salesTaxBps: 800, shippingCents: 599 },
    }));
    expect(text).toContain("Every purchase comes to you first. Investing is off. Each purchase counts at its estimated full cost: the price, 8% sales tax and $5.99 shipping an order.");
  });

  it("refund Proof line", () => {
    expect(refundedWords({ weekCents: 800, promisedCents: 0 }, "Zoe")).toBe("Refunded in PayPal · $8.00 back to Zoe's week");
    expect(refundedWords({ weekCents: 0, promisedCents: 500 }, "Zoe")).toBe("Refunded in PayPal · $5.00 added to what you've promised");
    expect(refundedWords(undefined, "Zoe")).toBe("Refunded in PayPal");
  });

  it("form parsing: integers only", () => {
    expect([parseCents("15"), parseCents("15.5"), parseCents("$15.50"), parseCents("1.234"), parseCents("abc")]).toEqual([1500, 1550, 1550, null, null]);
    expect([parseTaxBps("8.25"), parseTaxBps("7%"), parseTaxBps("0"), parseTaxBps("100")]).toEqual([825, 700, 0, null]);
    expect(parseSpending(fd({ spendingMode: "upTo", upTo: "" }))).toEqual({ mode: "upTo", upToCents: null });
    expect(parseSpending(fd({ spendingMode: "upTo", upTo: "x" }))).toBeNull();
    expect(parseSpending(fd({ spendingMode: "every" }))).toEqual({ mode: "every" });
    expect(parseCosts(fd({ salesTax: "8", shipping: "" }))).toEqual({ salesTaxBps: 800, shippingCents: 599 });
    expect(parseCosts(fd({ salesTax: "16" }))).toBeNull();
    expect(parseCosts(fd({ shipping: "5" }))).toBeNull(); // tax is required
  });
});

describe("Zoe's level line follows Amara's spending mode (030)", () => {
  it("unchanged by default; the mode when set", async () => {
    const { levelLine } = await import("@/ui/teenWords");
    expect(levelLine(1, "Amara")).toBe("Level 1 · over $10.00 or a new shop needs Amara's OK");
    expect(levelLine(3, "Amara")).toBe("Level 3 · nothing inside your shops needs asking");
    expect(levelLine(1, "Amara", { mode: "every" })).toBe("Level 1 · every purchase needs Amara's OK");
    expect(levelLine(2, "Amara", { mode: "upTo", upToCents: 1500 })).toBe("Level 2 · over $15.00 needs Amara's OK");
  });
});
