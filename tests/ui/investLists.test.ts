import { describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import type * as t from "@/db/schema";
import type { Holding } from "@/flows/holdings";
import type { TeenInvestment } from "@/flows/teenInvest";
import { HerInvestments } from "@/app/g/invest/HerInvestments";
import { YourInvestments, type FreshInvestments } from "@/app/t/[token]/invest/YourInvestments";

// I1: neither investing page waits on Alpaca. Today's rows (database only) render at once; the holding cards replace
// the rows they cover when Alpaca answers.
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
/** Everything, once every boundary has resolved. */
async function settled(el: ReactElement): Promise<string> {
  const { prelude } = await prerender(el);
  return text(await new Response(prelude).text());
}
const never = <T>() => new Promise<T>(() => {});

const holding: Holding = {
  symbol: "VTI", shares: 0.0138, putInCents: 500, worthCents: 500, since: new Date("2026-11-06T14:31:00Z"), daysHeld: 0,
  marketCents: null, line: null, words: { why: "a bit of everything", drop: "I'd wait" }, investmentIds: ["filled-1"],
};

type Inv = typeof t.investments.$inferSelect;
const inv = (id: string, status: Inv["status"], amountCents: number): Inv => ({
  id, familyId: "f", symbol: "VTI", amountCents, answers: {}, status, alpacaAccountId: null, transferId: null, orderId: null,
  debitedAt: null, receiptNote: null, retryCount: 0, error: null,
});
const hers = [inv("filled-1", "filled", 500), inv("queued-1", "queued", 700)];

describe("Amara's 'Zoe's investments' (I1)", () => {
  it("Alpaca hanging: today's rows, at once, with no card", () => {
    const t = text(renderToStaticMarkup(createElement(HerInvestments, { investments: hers, holdings: never<Holding[]>(), zoe: "Zoe" })));
    expect(t).toContain("$5.00 in VTI Bought");
    expect(t).toContain("$7.00 in VTI Queued for market open");
    expect(t).not.toContain("Her $5.00 is worth");
  });

  it("Alpaca answered: the card replaces the row it covers; the other rows stay", async () => {
    const t = await settled(createElement(HerInvestments, { investments: hers, holdings: Promise.resolve([holding]), zoe: "Zoe" }));
    expect(t).toContain("Her $5.00 is worth $5.00. She owns 0.0138 of a share.");
    expect(t).not.toContain("$5.00 in VTI Bought");
    expect(t).toContain("$7.00 in VTI Queued for market open");
  });
});

describe("Zoe's 'Your investments' (I1)", () => {
  const row = (id: string, status: TeenInvestment["status"], amountCents: number): TeenInvestment =>
    ({ id, symbol: "VTI", amountCents, status, receiptNote: null, declined: false });
  const before = [row("filled-1", "queued", 500)]; // still queued in the database until the resume fills it

  it("Alpaca hanging: today's rows, at once, with no card", () => {
    const t = text(renderToStaticMarkup(createElement(YourInvestments, { rows: before, fresh: never<FreshInvestments>(), guardian: "Amara" })));
    expect(t).toContain("VTI Queued for market open");
    expect(t).not.toContain("worth today");
  });

  it("Alpaca answered: the resumed rows and the card", async () => {
    const fresh = Promise.resolve({ rows: [row("filled-1", "filled", 500), row("asked-1", "proposed", 300)], holdings: [holding] });
    const t = await settled(createElement(YourInvestments, { rows: before, fresh, guardian: "Amara" }));
    expect(t).toContain("$5.00 worth today");
    expect(t).not.toContain("Queued for market open");
    expect(t).toContain("$3.00");
  });
});
