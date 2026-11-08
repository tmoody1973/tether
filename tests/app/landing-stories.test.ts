import { describe, expect, it } from "vitest";
import { SHOP } from "@/app/landing/stories/shopWords";
import { INVEST } from "@/app/landing/stories/investWords";
import { explainRefusal } from "@/ai/explain";
import { approveWords, requestTitle } from "@/ui/approveWords";
import { cardOutcome, levelLine, resetsWords, sheetNumbers, waitWords } from "@/ui/teenWords";
import { closeWords, holdingSentence, requestShareWords, shareLine, shareWords, tooSoonWords, youOwnWords } from "@/ui/investWords";
import { QUESTIONS } from "@/ui/investQuestions";
import type { Decision } from "@/engine/types";

// The landing page's animated stories restate the app's words so they can run on their own. These pin each one
// to the function that writes it in the app, so the story can't drift from the product.
type Request = Parameters<typeof requestTitle>[0];
type Holding = Parameters<typeof holdingSentence>[0];

const decision = (outcome: Decision["outcome"], constraint?: string, numbers?: Record<string, number>): Decision =>
  ({ outcome, reasons: constraint ? [{ constraint, detail: "", numbers }] : [], semanticRules: [] });

describe("the shopping story's words", () => {
  it("labels each card as the rule engine would", () => {
    const labels = Object.fromEntries(SHOP.cards.map((c) => [c.kind, c.label]));
    expect(labels.fits).toBe(cardOutcome(decision("ALLOW"), "Amara").label);
    expect(labels.needs).toBe(cardOutcome(decision("NEEDS_APPROVAL", "checkout.semantic_category"), "Amara").label);
    expect(labels.over).toBe(cardOutcome(decision("REFUSE", "payment.budget"), "Amara").label);
  });

  it("says the refusal sheet's sentence, numbers and second way forward", async () => {
    const refused = decision("REFUSE", "payment.budget", { remainingCents: 1302, cartCents: 2530 });
    const said = await explainRefusal(null, refused, { teenName: "Zoe", guardianName: "Amara" });
    expect(SHOP.sentence).toBe(said.sentence);
    expect(said.routes[0]).toBe("Ask Amara");
    expect(SHOP.numbers).toBe(sheetNumbers(1698, 3000, false));
    expect(SHOP.wait).toBe(waitWords(3));
    expect(SHOP.level).toBe(levelLine(2, "Amara"));
    expect(SHOP.resets).toBe(resetsWords(3));
  });

  it("titles the push and the request, and words the payoff, as Amara sees them", () => {
    const purchase = { amountCents: 2530, shop: "Best Buy" } as Request["purchase"];
    expect(SHOP.request).toBe(requestTitle({ teenName: "Zoe", purchase } as Request));
    expect(SHOP.paid).toBe(approveWords("paid", "Zoe", { amountCents: 2530, shop: "Best Buy" }).text);
  });

  it("keeps one week's arithmetic", () => {
    expect(SHOP.left).toBe("$13.02");
    expect(SHOP.over).toBe("$12.28"); // $25.30 - $13.02
    expect(SHOP.sentence).toContain(SHOP.focal.price);
  });
});

describe("the investing story's words", () => {
  it("prices the share and turns $5 into its slice", () => {
    expect(INVEST.close).toBe(closeWords(new Date("2026-11-06T21:00:00Z")));
    expect(INVEST.shares).toBe(shareLine(500, 36186, "VTI"));
    expect(INVEST.shareSub).toBe(requestShareWords(500, { cents: 36186, fractionable: true }, "VTI"));
    const w = shareWords(500, 36186, true, "VTI");
    expect(INVEST.push).toBe(`${w[0].toUpperCase()}${w.slice(1)}. Tap to decide.`); // src/flows/notify.ts
  });

  it("asks her questions in the app's words", () => {
    expect(INVEST.answers.map(([q]) => q)).toEqual(Object.values(QUESTIONS));
  });

  it("titles the request and words both payoffs", () => {
    const investment = { amountCents: 500, symbol: "VTI" } as Request["investment"];
    expect(INVEST.request).toBe(requestTitle({ teenName: "Zoe", investment } as Request));
    expect(INVEST.bought).toBe(approveWords("inv-filled", "Zoe").text);
    expect(INVEST.tooSoon).toBe(tooSoonWords(1));
    expect(INVEST.owns).toBe(youOwnWords(500 / 36186));
    expect(INVEST.left).toBe("$36.50"); // $41.50 saved, less the $5.00
    const held = { symbol: "VTI", shares: 500 / 36186, putInCents: 500, worthCents: 500, marketCents: null, daysHeld: 1, line: null } as unknown as Holding;
    expect(INVEST.herSentence).toBe(holdingSentence(held, "guardian"));
  });
});
