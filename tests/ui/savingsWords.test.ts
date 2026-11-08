// Decision 029: the honest words about savings, pinned. Savings is a promise Tether keeps count of, not money set aside.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STOP_CONFIRM, STOP_CONFIRM_DEMO, clauseText, grantClause, retirementWords, stoppedWords } from "@/ui/grantWords";
import { SAVINGS_LABEL, savingsPromisedLine } from "@/ui/teenWords";

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("savings words (029)", () => {
  it("the signed rules say savings is a promise, not money in PayPal (new signings only)", () => {
    const text = clauseText(grantClause({ teenName: "Zoe", level: 1, shops: ["Target"], floorPct: 10, matchPct: 100, expiresAt: new Date("2026-11-11T00:00:00Z") }));
    expect(text).toContain("whatever she doesn't spend is recorded as an amount you promise her; Tether doesn't hold or set aside money.");
    expect(text).not.toMatch(/stays in your PayPal/);
  });

  it("Zoe's savings figure", () => {
    expect(SAVINGS_LABEL).toBe("Savings promised");
    expect(savingsPromisedLine("Amara")).toBe("Amara has promised you this amount. Tether tracks it; the money isn't set aside.");
  });

  it("the stop confirmation, exactly", () => {
    expect(STOP_CONFIRM).toBe("This stops purchases immediately and disconnects your saved PayPal. This week's savings still count as promised. Savings already recorded remain yours to pay.");
    expect(STOP_CONFIRM_DEMO).toContain("This week's savings still count as promised. Savings already recorded remain yours to pay.");
    expect(stoppedWords("wallet-kept", "Zoe")?.warn).toBe(true);
    expect(stoppedWords("nonsense", "Zoe")).toBeNull();
  });

  it("the retirement notice", () => {
    expect(retirementWords(new Date("2026-11-15T10:00:00Z"))).toBe("This demo family is removed on Sun 15 Nov. Its links stop working then. Save or print your statement before.");
  });

  it("the old wording is gone from Zoe's screens and the clause source (the Release card is feat/several-teens' ReleaseCard)", () => {
    for (const p of ["src/app/t/[token]/goals/page.tsx", "src/app/t/[token]/page.tsx", "src/ui/grantWords.ts"]) {
      const s = src(p);
      expect(s, p).not.toMatch(/stay in .{0,40}PayPal until|stays in your PayPal|I've sent it|withdraw/i);
    }
    expect(src("src/app/t/[token]/goals/page.tsx")).toContain("savingsPromisedLine(");
    expect(src("src/app/g/rules/RulesControls.tsx")).toContain("STOP_CONFIRM");
    expect(src("src/ai/monthAssistant.ts")).toContain("Never say savings is in PayPal");
  });
});
