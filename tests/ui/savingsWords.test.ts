import { describe, expect, it } from "vitest";
import {
  CHANGE_OR_STOP, ONBOARDING_MONEY, PROMISED_SUB, SAVINGS_INTRO, promisedLabel, recordPayment, savingsFacts,
} from "@/ui/savingsWords";

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
