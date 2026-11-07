import { describe, expect, it } from "vitest";
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toFundInside } from "@/adapters/financialdatasets/client";
import { InsideCard, InsideLineCard, ShareCostCard } from "@/ui/InvestCards";
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
