import { describe, expect, it } from "vitest";
import {
  cardOutcome, levelLine, levelProgress, reflection, resetDay, setsBack, sheetNumbers, whatChanged,
} from "@/ui/teenWords";
import type { Decision } from "@/engine/types";

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
  });

  it("says how many weeks a purchase sets the goal back, only with a goal and a commitment", () => {
    expect(setsBack({ title: "Headphones" }, 500, 400)).toBe("This sets Headphones back 2 weeks.");
    expect(setsBack({ title: "Headphones" }, 400, 400)).toBe("This sets Headphones back 1 week.");
    expect(setsBack(null, 500, 400)).toBeNull();
    expect(setsBack({ title: "Headphones" }, 500, 0)).toBeNull();
  });

  it("budgets reset on Monday (UTC ISO weeks)", () => {
    expect(resetDay()).toBe("Monday");
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
