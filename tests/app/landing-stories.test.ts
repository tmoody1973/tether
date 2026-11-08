import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHOP } from "@/app/landing/stories/shopWords";
import { INVEST } from "@/app/landing/stories/investWords";
import { explainRefusal } from "@/ai/explain";
import { approveWords, requestTitle } from "@/ui/approveWords";
import { formatCents } from "@/ui/grantWords";
import { cardOutcome, levelLine, resetsWords, sheetNumbers, waitWords } from "@/ui/teenWords";
import { closeWords, holdingSentence, requestShareWords, shareCount, shareLine, shareWords, tooSoonWords, youOwnWords } from "@/ui/investWords";
import { QUESTIONS } from "@/ui/investQuestions";
import { TOKEN_TTL_MS } from "@/engine/token";
import { MIN_INVEST_CENTS } from "@/engine/invest";
import { LEVELS } from "@/engine/ladder";
import type { Decision } from "@/engine/types";

// The landing page's animated stories restate the app's words so they can run on their own, in the browser.
// These pin each one: computed numbers, the app's word functions, and, for words the app writes inline in its
// pages, the source file itself. A copy change in the app fails here until the story matches.
type Request = Parameters<typeof requestTitle>[0];
type Holding = Parameters<typeof holdingSentence>[0];

const decision = (outcome: Decision["outcome"], constraint?: string, numbers?: Record<string, number>): Decision =>
  ({ outcome, reasons: constraint ? [{ constraint, detail: "", numbers }] : [], semanticRules: [] });

describe("the shopping story's numbers", () => {
  it("keeps one week's arithmetic", () => {
    expect(SHOP.left).toBe(formatCents(3000 - 1698)); // $30.00 − $16.98 = $13.02
    expect(SHOP.left).toBe("$13.02");
    expect(SHOP.over).toBe(formatCents(2530 - 1302)); // $25.30 − $13.02 = $12.28
    expect(SHOP.over).toBe("$12.28");
    expect(SHOP.spentAfter).toBe(formatCents(1698 + 2530)); // paid: the spend lands in this week
    expect(SHOP.leftAfter).toBe(formatCents(Math.max(0, 3000 - 1698 - 2530))); // src/flows/teen.ts clamps at 0
    expect(SHOP.level).toBe(levelLine(2, "Amara"));
    expect(LEVELS[2].weeklyCents).toBe(SHOP.cents.weekly);
  });
});

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
    expect(SHOP.resets).toBe(resetsWords(3));
  });

  it("titles the push and the request, and words the payoff and its proof, as Amara sees them", () => {
    const purchase = { amountCents: 2530, shop: "Best Buy" } as Request["purchase"];
    expect(SHOP.request).toBe(requestTitle({ teenName: "Zoe", purchase } as Request));
    expect(SHOP.paid).toBe(approveWords("paid", "Zoe", { amountCents: 2530, shop: "Best Buy" }).text);
    expect(SHOP.slip).toBe(`Single use, this cart only, valid ${TOKEN_TTL_MS / 60_000} minutes.`);
  });
});

describe("the investing story", () => {
  it("keeps its arithmetic, rounded the way the app rounds", () => {
    expect(shareCount(500 / 36186)).toBe("0.0138"); // $5 / $361.86
    expect(INVEST.owns).toBe(youOwnWords(500 / 36186));
    expect(INVEST.left).toBe(formatCents(4150 - 500)); // $41.50 − $5.00 = $36.50
    expect(INVEST.left).toBe("$36.50");
    expect(INVEST.limits).toContain(`At least ${formatCents(MIN_INVEST_CENTS)},`);
  });

  it("prices the share and turns $5 into its slice", () => {
    expect(INVEST.close).toBe(closeWords(new Date("2026-11-06T21:00:00Z")));
    expect(INVEST.shares).toBe(shareLine(500, 36186, "VTI"));
    expect(INVEST.shareSub).toBe(requestShareWords(500, { cents: 36186, fractionable: true }, "VTI"));
    const w = shareWords(500, 36186, true, "VTI");
    expect(INVEST.push).toBe(`${w[0].toUpperCase()}${w.slice(1)}. Tap to decide.`); // src/flows/notify.ts
    expect(INVEST.answers.map(([q]) => q)).toEqual(Object.values(QUESTIONS));
  });

  it("has an honest timeline: bought while the market is open on Monday, dated that day, too soon to tell", () => {
    expect(INVEST.request).toBe(requestTitle({ teenName: "Zoe", investment: { amountCents: 500, symbol: "VTI" } } as Request));
    expect(INVEST.bought).toBe(approveWords("inv-filled", "Zoe").text); // filled, not "Queued for market open"
    expect(INVEST.since).toBe("since 9 Nov 2026");
    expect(INVEST.putIn).toBe("$5.00 on 9 Nov");
    expect(INVEST.time).toBe("10:42"); // after the 9:30 open in New York
    expect(INVEST.tooSoon).toBe(tooSoonWords(1));
    const held = { symbol: "VTI", shares: 500 / 36186, putInCents: 500, worthCents: 500, marketCents: null, daysHeld: 1, line: null } as unknown as Holding;
    expect(INVEST.herSentence).toBe(holdingSentence(held, "guardian"));
  });
});

// Words the app writes inline in its pages, not through a function: each must appear in the story and in the file it
// comes from. Names are normalized ({g}, ${guardian}, {w.guardianName} → Amara; {zoe} → Zoe) and &apos; → '.
const norm = (t: string) => t
  .replace(/&apos;/g, "'")
  .replace(/\$?\{(g|G|guardian|w\.guardianName)\}/g, "Amara")
  .replace(/\$?\{zoe\}/g, "Zoe")
  .replace(/\s+/g, " ");
const read = (f: string) => norm(readFileSync(f, "utf8"));
const SHOP_STORY = read("src/app/landing/stories/ShopStory.tsx") + read("src/app/landing/stories/shopWords.ts");
const INVEST_STORY = read("src/app/landing/stories/InvestStory.tsx") + read("src/app/landing/stories/investWords.ts");

const SHOP_PHRASES: [string, string][] = [
  ["src/app/t/[token]/shop/ShopForms.tsx", "What are you after?"],
  ["src/app/t/[token]/shop/ShopForms.tsx", "noise-cancelling headphones under $50"],
  ["src/app/t/[token]/shop/ShopForms.tsx", "Looking in your shops…"],
  ["src/app/t/[token]/shop/ShopForms.tsx", "A helper looks only in your shops and suggests two or three. It can't buy anything — your rules decide."],
  ["src/app/t/[token]/shop/ShopForms.tsx", "Paste a product link"],
  ["src/app/t/[token]/shop/ShopForms.tsx", "Search your shops"],
  ["src/app/t/[token]/shop/ShopForms.tsx", "What your rules say"],
  ["src/app/t/[token]/shop/ShopForms.tsx", "Why not?"],
  ["src/app/t/[token]/RefusalSheet.tsx", "That one doesn't fit this week."],
  ["src/app/t/[token]/RefusalSheet.tsx", "Not this time"],
  ["src/app/t/[token]/page.tsx", "Your week"],
  ["src/app/t/[token]/page.tsx", "left this week"],
  ["src/app/t/[token]/page.tsx", "Your asks"],
  ["src/app/t/[token]/page.tsx", "Waiting for Amara"],
  ["src/app/t/[token]/page.tsx", "Amara approved this one"],
  ["src/app/t/[token]/page.tsx", "Sent. Amara will see it, with what you have left this week."],
  ["src/app/t/[token]/page.tsx", "Find something"],
  ["src/app/g/requests/[id]/page.tsx", "This would use the rest and"],
  ["src/app/g/requests/[id]/page.tsx", "inside budget"],
  ["src/app/g/requests/[id]/DecideButtons.tsx", "Working…"],
  ["src/ui/Seam.tsx", "Sandbox only; no real money moves."],
  ["src/app/g/activity/page.tsx", "Checked against PayPal"],
  ["src/app/g/activity/page.tsx", "Permission slip"],
  ["src/app/g/activity/page.tsx", "signed by you"],
  ["src/app/g/activity/page.tsx", "and you approved it"],
  ["src/app/g/activity/page.tsx", "Single use, this cart only, valid"],
  ["src/ui/activityWords.ts", "Matches PayPal"],
];

const INVEST_PHRASES: [string, string][] = [
  ["src/app/t/[token]/invest/[symbol]/page.tsx", "Look closer"],
  ["src/app/t/[token]/invest/[symbol]/page.tsx", "is on Amara's investing list. Propose an amount and she decides."],
  ["src/app/t/[token]/invest/[symbol]/page.tsx", "Sent. Amara will see your answers and decide."],
  ["src/ui/InvestCards.tsx", "One share costs"],
  ["src/ui/InvestCards.tsx", "What's inside"],
  ["src/ui/InvestCards.tsx", "Its biggest holdings, by share of the fund:"],
  ["src/ui/InvestCards.tsx", "worth today"],
  ["src/ui/InvestCards.tsx", "You own"],
  ["src/ui/InvestCards.tsx", "You put in"],
  ["src/ui/investWords.ts", "Why you picked it:"],
  ["src/app/t/[token]/invest/ProposeForm.tsx", "Ask yourself"],
  ["src/app/t/[token]/invest/ProposeForm.tsx", "How much, in dollars?"],
  ["src/app/t/[token]/invest/ProposeForm.tsx", "and no more than you've saved."],
  ["src/app/t/[token]/invest/ProposeForm.tsx", "The exact slice is set when the market fills the order."],
  ["src/app/t/[token]/invest/ProposeForm.tsx", "Sending…"],
  ["src/app/t/[token]/invest/ProposeForm.tsx", "Propose to Amara"],
  ["src/app/t/[token]/invest/page.tsx", "Search the whole market"],
  ["src/app/t/[token]/invest/page.tsx", "A fund or company"],
  ["src/app/t/[token]/invest/page.tsx", "available to invest"],
  ["src/app/t/[token]/invest/page.tsx", "You propose, Amara decides. Tether recommends nothing."],
  ["src/app/t/[token]/invest/page.tsx", "Your investments"],
  ["src/app/g/requests/[id]/page.tsx", "Her answers"],
  ["src/app/g/requests/[id]/page.tsx", "into her investing account. Once it's there it belongs to her and can't be taken back."],
  ["src/app/g/invest/page.tsx", "Zoe's investments"],
];

describe("words the app writes inline", () => {
  it.each(SHOP_PHRASES)("shopping: %s says “%s”", (file, phrase) => {
    expect(read(file)).toContain(phrase);
    expect(SHOP_STORY).toContain(phrase);
  });
  it.each(INVEST_PHRASES)("investing: %s says “%s”", (file, phrase) => {
    expect(read(file)).toContain(phrase);
    expect(INVEST_STORY).toContain(phrase);
  });
});
