import { describe, expect, it } from "vitest";
import { savingsFacts, savingsSub } from "@/ui/savingsWords";

// Pins the Savings page's explainer (decision 028). Each sentence states what the code does; change the code and the
// words together, never one alone.
describe("what savings means, in fixed sentences", () => {
  const text = (demo: boolean) => savingsFacts("Maya", { demo }).map((f) => [f.q, ...f.a].join("\n")).join("\n\n");

  it("says exactly this for a family started with PayPal", () => {
    expect(savingsSub("Maya")).toBe("What Maya didn't spend. It stays in your PayPal; Tether keeps count.");
    expect(text(false)).toBe(`It's a record, not separate money
Tether counts what Maya didn't spend each week.
The dollars stay in your PayPal, mixed with the rest of your balance, until you send them to Maya yourself (Venmo, PayPal or cash) and tap "I've sent it".
Tether can't see or prove that transfer.

If your PayPal balance runs low
Tether never checks or holds your balance, so the savings number doesn't change.
Purchases are charged only when they're made.
If PayPal declines one, nothing is charged and the money goes back to Maya's week.

If you change the weekly amount
Closed weeks keep their amount.
A change applies to the whole current week: the rules in force when the week ends are the ones that count.
A change to Maya's savings promise starts next week.

If you stop
"Stop Maya's rules" ends spending at once and removes your saved PayPal.
This week counts no savings.
Past savings stay on the record and are still yours to pay out.

Investing is different
Money Maya invests, with your OK, does move: into Maya's own investing account.
In this demo, that's a simulated sandbox deposit.`);
  });

  it("on the shared demo family, Stop keeps the saved PayPal (the demo's own rule), and says so", () => {
    expect(text(true)).toContain(`"Stop Maya's rules" ends spending at once and keeps the saved PayPal on this shared demo family, so the next person can try it.`);
    expect(text(true)).not.toContain("removes your saved PayPal");
  });

  it("names the teen and never says her or his", () => {
    expect(text(false)).not.toMatch(/\b(her|his|she|he)\b/i);
  });
});
