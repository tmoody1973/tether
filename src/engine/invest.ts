import type { Cents, Decision, Grant, Reason } from "./types";

export const MIN_INVEST_CENTS = 100;
export const QUEUED_LABEL = "Queued for market open";
export const CASH_HELD_LABEL = "Held as cash in Zoe's investing account. Amara can try the order again.";
export const NEEDS_REVIEW_LABEL = "Checking with the broker";
export const investReceiptNote = (teenName: string) => `This money now belongs to ${teenName} and can't be taken back.`;

export interface InvestProposal { symbol: string; amountCents: Cents }

/** Pure. Refuses below Level 3, off the allowlist, above savings or under $1; otherwise the custodian always approves. */
export function decideInvestment(grant: Grant, p: InvestProposal, savingsCents: Cents): Decision {
  const refuse = (constraint: string, detail: string): Reason => ({ constraint, detail });
  const reasons: Reason[] = [
    ...(grant.level < 3 ? [refuse("invest.level", "Investing opens at Level 3")] : []),
    ...(!grant.fundAllowlist.includes(p.symbol) ? [refuse("invest.allowlist", `${p.symbol} is not on the approved fund list`)] : []),
    ...(!Number.isInteger(p.amountCents) || p.amountCents < MIN_INVEST_CENTS ? [refuse("invest.minimum", "Minimum investment is $1.00")] : []),
    ...(p.amountCents > savingsCents ? [refuse("invest.savings", "More than the savings available")] : []),
  ];
  if (reasons.length > 0) return { outcome: "REFUSE", reasons, semanticRules: [] };
  return { outcome: "NEEDS_APPROVAL", reasons: [refuse("approval.investment", "Every investment needs the guardian's approval")], semanticRules: [] };
}
