import { describe, expect, it } from "vitest";
import { clauseText, grantClause, formatCents, formatDay, matchWords } from "@/ui/grantWords";

const base = { teenName: "Zoe", shops: ["bestbuy.com", "target.com"], floorPct: 10, matchPct: 100, expiresAt: new Date("2026-11-12T12:00:00Z") };

describe("grant words (the consent clause — plain code, no model)", () => {
  it("formats money with cents and the day in UTC", () => {
    expect(formatCents(2000)).toBe("$20.00");
    expect(formatCents(150_000)).toBe("$1,500.00");
    expect(formatDay(new Date("2026-11-12T23:30:00Z"))).toBe("Thu 12 Nov");
  });

  it("level 1: budget, shops, approval rule, savings floor, match, PayPal, end date", () => {
    const text = clauseText(grantClause({ ...base, level: 1 }));
    expect(text).toContain("Zoe can spend up to $20.00 a week at bestbuy.com and target.com.");
    expect(text).toContain("Anything over $10.00, or at a shop she hasn't used before, comes to you first.");
    expect(text).toContain("She saves at least $2.00 a week");
    expect(text).toContain("$1 for every $1");
    expect(text).toContain("your saved PayPal");
    expect(text).toContain("This ends Thu 12 Nov");
    expect(text).not.toMatch(/Venmo|invest/i);
  });

  it("level 2 and 3 change the approval line; level 3 mentions investing", () => {
    expect(clauseText(grantClause({ ...base, level: 2 }))).toContain("Anything over $20.00 comes to you first.");
    const l3 = clauseText(grantClause({ ...base, level: 3, shops: ["a.com", "b.com", "c.com"] }));
    expect(l3).toContain("$50.00 a week at a.com, b.com and c.com.");
    expect(l3).toContain("Nothing inside these shops needs your OK.");
    expect(l3).toContain("propose investing her savings; you approve each one.");
  });

  it("the money amount is the bold part", () => {
    const segs = grantClause({ ...base, level: 1 });
    expect(segs.filter((s) => typeof s !== "string").map((s) => (s as { b: string }).b)).toContain("$20.00 a week");
  });

  it("match words", () => {
    expect(matchWords(100)).toBe("$1 for every $1");
    expect(matchWords(50)).toBe("50¢ for every $1");
    expect(matchWords(200)).toBe("$2 for every $1");
    expect(clauseText(grantClause({ ...base, level: 1, matchPct: 0 }))).toContain("There's no match");
  });
});
