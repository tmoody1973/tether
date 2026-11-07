import { describe, expect, it } from "vitest";
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toFundInside } from "@/adapters/financialdatasets/client";
import { HerHoldingCard, HoldingCard, InsideCard, InsideLineCard, ShareCostCard } from "@/ui/InvestCards";
import type { Holding } from "@/flows/holdings";
import VTI from "../fixtures/fd-vti-holdings.json";

/** Visible text: tags dropped, entities decoded, whitespace collapsed. */
const render = <P extends object>(c: FunctionComponent<P>, props: P) => renderToStaticMarkup(createElement(c, props));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const inside = toFundInside(VTI);

describe("Zoe's fund page", () => {
  it("What's inside: the biggest holdings with a bar scaled to the largest, their share together, and where it's from", () => {
    const html = render(InsideCard, { inside });
    const t = text(html);
    expect(t).toContain("What's inside");
    expect(t).toContain("Its biggest holdings, by share of the fund:");
    expect(t).toContain("NVIDIA 6.4%");
    expect(t).toContain("Alphabet 5.2%");
    expect(t).toContain("These are 32% of the fund. The rest is spread over many more companies.");
    expect(t).toContain("From the fund's filing for 30 Jun 2026, via Financial Datasets.");
    expect(html).toContain('style="width:100%"'); // NVIDIA, the largest
    expect(html).toMatch(/style="width:2\d\.\d+%"/); // Tesla, about a quarter of NVIDIA
  });

  it("What's inside is hidden when there's nothing to show (a company, or Financial Datasets down or capped)", () => {
    expect(render(InsideCard, { inside: null })).toBe("");
  });

  it("One share costs: the latest close and its real market day; hidden with no price", () => {
    const t = text(render(ShareCostCard, { close: { cents: 36186, day: new Date("2026-11-06T05:00:00Z") } }));
    expect(t).toBe("One share costs $361.86 At Friday's close (6 Nov). You don't need a whole one: you buy in dollars.");
    expect(render(ShareCostCard, { close: null })).toBe("");
  });
});

describe("Amara's request page", () => {
  it("What's inside {SYMBOL}: the first five inline, then the top ten's share", () => {
    const t = text(render(InsideLineCard, { symbol: "VTI", inside }));
    expect(t).toBe("What's inside VTI NVIDIA 6.4%, Apple 5.9%, Alphabet 5.2%, Microsoft 3.8%, Amazon.com 3.2%… The top ten are 32% of the fund.");
  });
  it("hidden when unavailable", () => {
    expect(render(InsideLineCard, { symbol: "VTI", inside: null })).toBe("");
  });
});

const WHY = "I want a little bit of every company, not just one.";
const DROP = "Nervous, but I'd leave it. It's for years from now.";
const holding = (o: Partial<Holding> = {}): Holding => ({
  symbol: "VTI", shares: 0.0138, putInCents: 500, worthCents: 500, since: new Date("2026-11-06T14:31:00Z"), daysHeld: 0,
  marketCents: null, line: null, words: { why: WHY, drop: DROP }, investmentIds: ["i1"], ...o,
});
const year = holding({
  shares: 0.0151, worthCents: 548, marketCents: 548, since: new Date("2025-11-10T14:31:00Z"), daysHeld: 362,
  line: { mine: [500, 520, 490, 548], market: [500, 515, 495, 548] },
});

describe("Zoe's investments", () => {
  it("too soon: what it's worth, what she owns and put in, the plain hint, and why she picked it; no line", () => {
    const html = render(HoldingCard, { h: holding() });
    expect(text(html)).toBe(
      "VTI since 6 Nov 2026 $5.00 worth today You own 0.0138 share You put in $5.00 on 6 Nov " +
      "It's been 1 day. Too soon to tell: investments like this are for years, not days. Why you picked it: “" + WHY + "”");
    expect(html).not.toContain("<svg");
  });

  it("after a while: one line against the whole market, the sentence, and what she owns", () => {
    const html = render(HoldingCard, { h: year });
    const t = text(html);
    expect(html).toContain('data-chart="since-bought"');
    expect(html).toContain('class="t-chart__fund"');
    expect(t).toContain("Your $5.00 in VTI");
    expect(t).toContain("Same $5.00, whole market");
    expect(t).toContain("Your $5.00 is worth $5.48. The same $5.00 in the whole market: $5.48.");
    expect(t).toContain("You own 0.0151 share");
    expect(t).not.toContain("You put in"); // the sentence says it
    expect(t).not.toContain("Too soon"); // held a year
  });

  it("in a dip, once the line shows: her own answer read back, and the fact in whole percent; never advice", () => {
    const t = text(render(HoldingCard, { h: holding({ worthCents: 474, marketCents: 473, daysHeld: 140, line: { mine: [500, 474], market: [500, 473] } }) }));
    expect(t).toContain("You said, if it dropped by a third: “" + DROP + "” It's down 5%.");
    expect(t).not.toContain("Why you picked it");
    expect(t).not.toMatch(/\bhold\b|don't worry|should/i);
  });

  it("down but too soon for a line: no fall in percent (that would be a daily move, D16); why she picked it instead", () => {
    const t = text(render(HoldingCard, { h: holding({ worthCents: 498, daysHeld: 1 }) }));
    expect(t).toContain("Why you picked it: “" + WHY + "”");
    expect(t).not.toContain("It's down");
    expect(t).not.toContain(DROP);
  });
});

describe("Amara's Investing page", () => {
  it("her card: the value, the line in Amara's colours, and the sentence with the share count; no quote", () => {
    const html = render(HerHoldingCard, { h: year });
    const t = text(html);
    expect(t).toBe("VTI $5.48 Her $5.00 is worth $5.48. The same $5.00 in the whole market: $5.48. She owns 0.0151 of a share.");
    expect(html).toContain('class="g-chart__fund"');
  });

  it("too soon on Amara's side: the sentence without a market, and the same hint", () => {
    expect(text(render(HerHoldingCard, { h: holding({ daysHeld: 3 }) }))).toBe(
      "VTI $5.00 Her $5.00 is worth $5.00. She owns 0.0138 of a share. It's been 3 days. Too soon to tell: investments like this are for years, not days.");
  });
});
