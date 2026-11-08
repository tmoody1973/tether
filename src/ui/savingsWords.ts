// What "savings" means on Tether, in fixed sentences (decision 028). Facts, not advice, and never money held: Tether
// records an amount the parent promises; it holds nothing. Pinned by tests/ui/savingsWords.test.ts.

/** The savings figure's label, on Home's card and the Savings page. */
export const promisedLabel = (teen: string) => `Promised to ${teen}`;

/** Under the figure, wherever it appears. */
export const PROMISED_SUB = "This is your recorded commitment, not a separate PayPal balance. Tether has not reserved or transferred this money.";

/** Where money is first explained: the teen form. */
export const ONBOARDING_MONEY =
  "Tether does not hold money or create a savings account. Unspent allowance is recorded as an amount you promise your teen. You remain responsible for paying it.";

/** The Savings page's opening lines. */
export const SAVINGS_INTRO =
  "Tether tracks allowance and savings promises. It doesn't hold or set aside money. Purchases charge your saved PayPal when they happen.";

/** The payout action, everywhere it's named. Never "withdraw". */
export const recordPayment = (teen: string) => `Record payment to ${teen}`;

/** Changing the amount and stopping are explained on the rules page, which owns that behaviour. */
export const CHANGE_OR_STOP = "What happens if I change the amount or stop?";

export type SavingsFact = { q: string; a: string[] };

export function savingsFacts(teen: string): SavingsFact[] {
  return [
    {
      // confirmRelease only records that she says she paid; nothing moves at PayPal.
      q: `Paying ${teen}`,
      a: [
        `You pay ${teen} yourself (Venmo, PayPal or cash), then tap "${recordPayment(teen)}".`,
        "Tether can't see or prove that payment.",
      ],
    },
    {
      // purchase.ts R37: declined ⇒ reversal + failed. No balance check anywhere before a charge.
      q: "If your PayPal balance runs low",
      a: [
        "Tether never checks or holds your balance, so the amount promised doesn't change.",
        "Purchases are charged only when they're made.",
        `If PayPal declines one, nothing is charged and the money goes back to ${teen}'s week.`,
      ],
    },
    {
      // invest.ts: an approved investment funds the teen's Alpaca account (sandbox: a simulated deposit).
      q: "Investing is different",
      a: [
        `Money ${teen} invests, with your OK, does move: into ${teen}'s own investing account.`,
        "In this demo, that's a simulated sandbox deposit.",
      ],
    },
  ];
}
