// Decision 029: the honest words about savings, pinned. Savings is a promise Tether keeps count of, not money set aside.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STOP_CONFIRM, STOP_CONFIRM_DEMO, clauseText, grantClause, retirementWords, stoppedWords } from "@/ui/grantWords";
import { SAVINGS_LABEL, savingsPromisedLine } from "@/ui/teenWords";
import {
  CHANGE_OR_STOP, ONBOARDING_MONEY, PROMISED_SUB, SAVINGS_INTRO, promisedLabel, recordPayment, savingsFacts,
} from "@/ui/savingsWords";

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

// Decision 028: the parent-side words (Home, Savings, the teen form).
// Pins the parent's savings words (decision 028): an amount promised, never money held. Change the code and the words
// together, never one alone.
describe("savings words never read as money held", () => {
  it("the figure, the onboarding line, the Savings page's opening and the payout action say exactly this", () => {
    expect(promisedLabel("Maya")).toBe("Promised to Maya");
    expect(PROMISED_SUB).toBe("This is your recorded commitment, not a separate PayPal balance. Tether has not reserved or transferred this money.");
    expect(ONBOARDING_MONEY).toBe("Tether does not hold money or create a savings account. Unspent allowance is recorded as an amount you promise your teen. You remain responsible for paying it.");
    expect(SAVINGS_INTRO).toBe("Tether tracks allowance and savings promises. It doesn't hold or set aside money. Purchases charge your saved PayPal when they happen.");
    expect(recordPayment("Maya")).toBe("Record payment to Maya");
    expect(CHANGE_OR_STOP).toBe("What happens if I change the amount or stop?");
  });

  it("the what-ifs: paying the teen, a low balance, investing; changing the amount and stopping live on the rules page", () => {
    expect(savingsFacts("Maya").map((f) => [f.q, ...f.a].join("\n")).join("\n\n")).toBe(`Paying Maya
You pay Maya yourself (Venmo, PayPal or cash), then tap "Record payment to Maya".
Tether can't see or prove that payment.

If your PayPal balance runs low
Tether never checks or holds your balance, so the amount promised doesn't change.
Purchases are charged only when they're made.
If PayPal declines one, nothing is charged and the money goes back to Maya's week.

Investing is different
Money Maya invests, with your OK, does move: into Maya's own investing account.
In this demo, that's a simulated sandbox deposit.`);
  });

  it("no sentence says the money stays, is held or can be withdrawn, and none says her or his", () => {
    const all = [PROMISED_SUB, ONBOARDING_MONEY, SAVINGS_INTRO, ...savingsFacts("Maya").flatMap((f) => [f.q, ...f.a])].join("\n");
    expect(all).not.toMatch(/stays? in your PayPal|withdraw|keeps count/i);
    expect(all).not.toMatch(/\b(her|his|she|he)\b/i);
  });
});
