import { describe, expect, it } from "vitest";
import {
  buyFlash, cardOutcome, daysToReset, investStatusWords, levelLine, levelProgress, parseDollars, reflection, resetsWords, setsBack, sheetNumbers,
  tileWords, waitWords, weeksToGoal, whatChanged,
} from "@/ui/teenWords";
import type { Decision } from "@/engine/types";
import type { PurchaseStatus } from "@/db/repo";

const d = (outcome: Decision["outcome"], constraints: string[] = []): Decision =>
  ({ outcome, semanticRules: [], reasons: constraints.map((constraint) => ({ constraint, detail: "" })) });

describe("teen words", () => {
  it("labels every card with one of the rule outcomes", () => {
    expect(cardOutcome(d("ALLOW"), "Amara")).toEqual({ kind: "fits", label: "Fits your week" });
    expect(cardOutcome(d("NEEDS_APPROVAL", ["approval.first_time_merchant"]), "Amara")).toEqual({ kind: "needs", label: "Needs Amara's OK" });
    expect(cardOutcome(d("REFUSE", ["approval.over_amount", "payment.budget"]), "Amara")).toEqual({ kind: "over", label: "Over budget" });
    expect(cardOutcome(d("REFUSE", ["checkout.semantic_category"]), "Amara")).toEqual({ kind: "refused", label: "Not this time" });
  });

  it("states the week's arithmetic in money, never below zero", () => {
    expect(sheetNumbers(1200, 2000)).toBe("You've spent $12.00 of your $20.00, so there's $8.00 left.");
    expect(sheetNumbers(2100, 2000)).toBe("You've spent $21.00 of your $20.00, so there's $0.00 left.");
    expect(sheetNumbers(600, 2000, false)).toBe("You've spent $6.00 of your $20.00 this week.");
  });

  it("says how many weeks a purchase sets the goal back, only with a goal and a commitment", () => {
    expect(setsBack({ title: "Headphones" }, 500, 400)).toBe("This sets Headphones back 2 weeks.");
    expect(setsBack({ title: "Headphones" }, 400, 400)).toBe("This sets Headphones back 1 week.");
    expect(setsBack(null, 500, 400)).toBeNull();
    expect(setsBack({ title: "Headphones" }, 500, 0)).toBeNull();
  });

  it("says when the budget resets: next ISO Monday (UTC), or sooner if her rules end first", () => {
    const wed = new Date("2026-11-04T12:00:00Z");
    expect(daysToReset(wed, null)).toBe(5);
    expect(daysToReset(new Date("2026-11-08T23:00:00Z"), null)).toBe(1); // Sunday night
    expect(daysToReset(wed, new Date("2026-11-06T09:00:00Z"))).toBe(2); // rules end Friday
    expect(daysToReset(wed, new Date("2026-11-04T18:00:00Z"))).toBe(0);
    expect([0, 1, 5].map(resetsWords)).toEqual(["resets today", "resets tomorrow", "resets in 5 days"]);
    expect([0, 1, 5].map(waitWords)).toEqual(["Wait until later today", "Wait until tomorrow", "Wait 5 days"]);
  });

  it("buy flash follows the purchase's status; the URL code never makes it look paid", () => {
    const p = (status: PurchaseStatus) => ({ title: "Notebook", amountCents: 500, shop: "Target", status });
    expect(buyFlash("paid", p("paid"), "Amara", "This sets Bike back 1 week.")).toEqual({ text: "Paid — Notebook, $5.00 at Target.", sub: "This sets Bike back 1 week." });
    expect(buyFlash("paid", p("refused"), "Amara", null)).toEqual({ text: "That doesn't fit your rules any more, so nothing was spent.", warn: true });
    expect(buyFlash("paid", p("proposed"), "Amara", null)?.text).not.toMatch(/Paid/);
    expect(buyFlash("rules", p("paying"), "Amara", null)?.text).toBe("PayPal is confirming — Notebook, $5.00 at Target.");
    expect(buyFlash("rules", p("needs_approval"), "Amara", null)).toMatchObject({ ask: true });
    expect(buyFlash("changed", p("refused"), "Amara", null)?.text).toMatch(/price or the item changed/);
    expect(buyFlash("paid", null, "Amara", null)).toBeNull();
  });

  it("week-ended reflection compares her only with herself", () => {
    const w = (spent: number, kept = true) => ({ weekKey: "k", allowanceCents: 2000, spentCents: spent, commitmentCents: kept ? 200 : 2000 });
    expect(reflection([w(1700), w(1900, false), w(500)], { title: "Headphones", targetCents: 8900 }, 3400, 400))
      .toBe("Inside your rules 3 of 3 weeks. You kept your savings promise 2 of 3. Headphones: 14 weeks away.");
    expect(reflection([], null, 0, 0)).toBe("That was your first week with Tether.");
    expect(reflection([w(100)], { title: "Bike", targetCents: 500 }, 900, 200)).toBe("Inside your rules 1 of 1 week. You kept your savings promise 1 of 1. You've saved enough for Bike.");
  });

  it("level line, progress and what changed", () => {
    expect(levelLine(1, "Amara")).toBe("Level 1 · over $10.00 or a new shop needs Amara's OK");
    expect(levelLine(3, "Amara")).toBe("Level 3 · nothing inside your shops needs asking");
    expect(levelProgress(1, 1)).toBe("Keep your savings promise 4 weeks running to reach Level 2. You're on 1.");
    expect(levelProgress(0, 1)).toBe("Keep your savings promise 4 weeks running to reach Level 2.");
    expect(levelProgress(5, 3)).toBe("You're at the top level.");
    expect(whatChanged(1, 2, "Amara")).toBe("Your weekly limit is now $30.00, and only things over $20.00 need Amara's OK. A bookshop opens too.");
    expect(whatChanged(2, 3, "Amara")).toBe("Your weekly limit is now $50.00, and nothing inside your shops needs asking. Clothes and sneaker shops open too.");
  });
});

describe("goals, invest and map words (18b)", () => {
  it("weeksToGoal: the goal screen's one number", () => {
    expect(weeksToGoal(8900, 3400, 200)).toBe(28); // $55 short at $2 a week
    expect(weeksToGoal(8900, 3400, 400)).toBe(14);
    expect(weeksToGoal(8900, 9000, 0)).toBe(0); // saved enough
    expect(weeksToGoal(8900, 3400, 0)).toBeNull(); // no promise, no count
  });
  it("parseDollars → integer cents, or null", () => {
    expect(parseDollars("5")).toBe(500);
    expect(parseDollars("$5.5")).toBe(550);
    expect(parseDollars(" 1,250.05 ")).toBe(125005);
    for (const bad of ["", "-5", "5.555", "five", "1e3", "5.", ".5"]) expect(parseDollars(bad)).toBeNull();
  });
  it("investment statuses in her words; queued is the designed closed-market state", () => {
    expect(investStatusWords("queued", "Amara")).toBe("Queued for market open");
    expect(investStatusWords("proposed", "Amara")).toBe("Waiting for Amara");
    expect(investStatusWords("cash_held", "Amara")).toMatch(/your investing account/);
    expect(investStatusWords("rejected", "Amara")).toBe("Didn't go through. Nothing was moved.");
    expect(investStatusWords("rejected", "Amara", true)).toBe("Amara said not this time.");
  });
  it("map tiles: open / ask first / locked, never a price", () => {
    const tile = (kind: "open" | "ask" | "locked", opensAt: number | null = null, booksOnly = false) => ({ id: "x", name: "X", kind, opensAt, booksOnly });
    expect(tileWords(tile("open"), "Amara")).toEqual({ label: "Open", line: "In your rules now" });
    expect(tileWords(tile("open", null, true), "Amara").line).toBe("Books only");
    expect(tileWords(tile("ask"), "Amara")).toEqual({ label: "Ask first", line: "Amara says yes the first time" });
    expect(tileWords(tile("locked", 3), "Amara")).toEqual({ label: "Locked", line: "Opens at Level 3" });
  });
});
