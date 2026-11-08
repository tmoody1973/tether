import type { ReactNode } from "react";
import { formatCents } from "@/ui/grantWords";
import { Bar, Money } from "@/ui/guardian";
import { PROMISED_SUB, promisedLabel } from "@/ui/savingsWords";

/** The savings figure, on Home and the Savings page: an amount promised to the teen, never money held (decision 028). */
export function PromisedCard({ teen, cents, goal, children }: {
  teen: string; cents: number; goal: { title: string; targetCents: number } | null; children?: ReactNode;
}) {
  return (
    <section className="g-card" aria-labelledby="promised-h">
      <h2 className="g-label" id="promised-h">{promisedLabel(teen)}</h2>
      {goal && <div className="g-goal__name">{teen}&apos;s goal: {goal.title}</div>}
      <div className="g-figure" style={{ fontSize: 19 }}>
        <Money cents={cents} />{goal && <> <small>of <Money cents={goal.targetCents} /> goal</small></>}
      </div>
      {goal && <Bar goal value={cents} max={goal.targetCents} label={`${formatCents(cents)} promised of ${formatCents(goal.targetCents)} goal`} />}
      <div className="g-card__sub">{PROMISED_SUB}</div>
      {children}
    </section>
  );
}
