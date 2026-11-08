// What "savings" means on Tether, in fixed sentences (decision 028). Facts, not advice. Each one is checked against the
// code that makes it true (noted beside it) and pinned by tests/ui/savingsWords.test.ts.

/** Home's savings card and the Savings page say this under the figure. */
export const savingsSub = (teen: string) => `What ${teen} didn't spend. It stays in your PayPal; Tether keeps count.`;

export type SavingsFact = { q: string; a: string[] };

export function savingsFacts(teen: string, opts: { demo: boolean }): SavingsFact[] {
  return [
    {
      // ledger: week_close journals allowance minus spent; nothing moves at PayPal. confirmRelease only records "sent".
      q: "It's a record, not separate money",
      a: [
        `Tether counts what ${teen} didn't spend each week.`,
        `The dollars stay in your PayPal, mixed with the rest of your balance, until you send them to ${teen} yourself (Venmo, PayPal or cash) and tap "I've sent it".`,
        "Tether can't see or prove that transfer.",
      ],
    },
    {
      // purchase.ts R37: declined ⇒ reversal + failed. No balance check anywhere before a charge.
      q: "If your PayPal balance runs low",
      a: [
        "Tether never checks or holds your balance, so the savings number doesn't change.",
        "Purchases are charged only when they're made.",
        `If PayPal declines one, nothing is charged and the money goes back to ${teen}'s week.`,
      ],
    },
    {
      // week.ts: each week closes against the grant signed before it ended; pendingCommitmentCents applies after a close.
      q: "If you change the weekly amount",
      a: [
        "Closed weeks keep their amount.",
        "A change applies to the whole current week: the rules in force when the week ends are the ones that count.",
        `A change to ${teen}'s savings promise starts next week.`,
      ],
    },
    {
      // grant.ts revoke: grant revoked at once; vault deleted at PayPal, except the shared demo family (C1). week.ts: a
      // stopped grant gives 0 allowance, so this week saves nothing. Journal rows are never deleted.
      q: "If you stop",
      a: [
        `"Stop ${teen}'s rules" ends spending at once and ${opts.demo ? "keeps the saved PayPal on this shared demo family, so the next person can try it" : "removes your saved PayPal"}.`,
        "This week counts no savings.",
        "Past savings stay on the record and are still yours to pay out.",
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
