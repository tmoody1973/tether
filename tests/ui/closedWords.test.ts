import { describe, expect, it } from "vitest";
import type { ClosedRequest } from "@/flows/request";
import { closedWords } from "@/ui/approveWords";

const AT = new Date("2026-11-06T20:54:00Z");
const base = { teenName: "Zoe", at: AT };
const invest = (outcome: ClosedRequest["outcome"], status: NonNullable<ClosedRequest["investment"]>["status"], receiptNote: string | null = null): ClosedRequest =>
  ({ ...base, outcome, subject: "investment", investment: { symbol: "VTI", amountCents: 500, status, receiptNote } });

describe("closedWords", () => {
  it("approved investment: heading, subject and time, current status, receipt note, and a link to her investments", () => {
    expect(closedWords(invest("approved", "queued", "Order accepted; fills at the open."))).toEqual({
      heading: "Already approved.",
      line: "$5.00 in VTI · approved 6 Nov 20:54",
      status: "Queued for market open",
      note: "Order accepted; fills at the open.",
      href: "/g/invest", button: "See Zoe's investments",
    });
  });

  it("never says 'you approved' (on the shared demo someone else may have tapped first)", () => {
    for (const outcome of ["approved", "declined", "expired"] as const) {
      expect(JSON.stringify(closedWords(invest(outcome, "filled")))).not.toMatch(/you approved|you declined|you answered/i);
    }
  });

  it("declined and expired have their own headings and no status line", () => {
    expect(closedWords(invest("declined", "rejected"))).toMatchObject({ heading: "Already answered: not this time.", status: null, note: null });
    expect(closedWords(invest("expired", "expired"))).toMatchObject({ heading: "This one ran out of time.", status: null, note: null });
    expect(closedWords(invest("expired", "expired")).line).toBe("$5.00 in VTI · ran out of time 6 Nov 20:54");
  });

  it("an approved investment that did not go through does not read 'Not this time'", () => {
    expect(closedWords(invest("approved", "rejected")).status).toBe("Not bought — Zoe's savings are unchanged.");
  });

  it("a purchase links to activity and says where the payment stands", () => {
    const w = closedWords({ ...base, outcome: "approved", subject: "purchase", purchase: { amountCents: 1200, shop: "Target", status: "paid" } });
    expect(w).toMatchObject({ line: "$12.00 at Target · approved 6 Nov 20:54", status: "Paid.", href: "/g/activity", button: "See activity" });
  });

  it("an approved purchase that is not yet paying or paid never claims nothing was charged (the charge may be about to start)", () => {
    const purchase = (status: NonNullable<ClosedRequest["purchase"]>["status"]) =>
      closedWords({ ...base, outcome: "approved", subject: "purchase", purchase: { amountCents: 800, shop: "Best Buy", status } });
    expect(purchase("approved").status).toBe("Approved. The payment hasn't gone to PayPal yet.");
    for (const status of ["approved", "paying", "paid"] as const) expect(purchase(status).status).not.toMatch(/nothing was charged/i);
  });

  it("a fund links to her investments, a shop to her rules", () => {
    expect(closedWords({ ...base, outcome: "approved", subject: "fund", fund: { symbol: "VOO" } }))
      .toMatchObject({ line: "Adding VOO to your investing list · approved 6 Nov 20:54", href: "/g/invest", button: "See Zoe's investments" });
    expect(closedWords({ ...base, outcome: "declined", subject: "shop", shop: { domain: "nike.com" } }))
      .toMatchObject({ line: "A new shop: nike.com · declined 6 Nov 20:54", href: "/g/rules", button: "See her rules" });
  });

  it("leaves the time out when none was recorded", () => {
    expect(closedWords({ ...invest("approved", "filled"), at: null }).line).toBe("$5.00 in VTI · approved");
  });
});
