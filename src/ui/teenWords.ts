// Zoe's words. Deterministic: numbers come from the engine and ledger, never from a model (the refusal sentence
// itself is src/ai/explain.ts, which falls back to its own template).
import { LEVELS, commitmentKept, type Level, type WeekRecord } from "@/engine/ladder";
import type { Cents, Decision } from "@/engine/types";
import { formatCents } from "@/ui/grantWords";

export type CardKind = "fits" | "needs" | "over" | "refused";

/** The label every result card carries (D6 / F5): what the rules would do, never a rating. */
export function cardOutcome(d: Decision, guardian: string): { kind: CardKind; label: string } {
  if (d.outcome === "ALLOW") return { kind: "fits", label: "Fits your week" };
  if (d.outcome === "NEEDS_APPROVAL") return { kind: "needs", label: `Needs ${guardian}'s OK` };
  return d.reasons.some((r) => r.constraint === "payment.budget")
    ? { kind: "over", label: "Over budget" } : { kind: "refused", label: "Not this time" };
}

export const sheetNumbers = (spentCents: Cents, weeklyCents: Cents): string =>
  `You've spent ${formatCents(spentCents)} of your ${formatCents(weeklyCents)}, so there's ${formatCents(Math.max(0, weeklyCents - spentCents))} left.`;

const weeks = (n: number) => `${n} week${n === 1 ? "" : "s"}`;

/** D12 moment 1: "This sets Headphones back 1 week." Weeks at her own weekly savings promise. */
export function setsBack(goal: { title: string } | null, amountCents: Cents, commitmentCents: Cents): string | null {
  if (!goal || commitmentCents <= 0 || amountCents <= 0) return null;
  return `This sets ${goal.title} back ${weeks(Math.ceil(amountCents / commitmentCents))}.`;
}

/** Weekly budgets are ISO weeks in UTC, so they always start again on Monday. */
export const resetDay = (): string => "Monday";

/** D12 moment 2, on the week-ended screen: her last (up to) 4 weeks against herself, then the goal. */
export function reflection(
  last: WeekRecord[], goal: { title: string; targetCents: Cents } | null, savingsCents: Cents, commitmentCents: Cents,
): string {
  const recent = last.slice(-4);
  if (recent.length === 0) return "That was your first week with Tether.";
  const inside = recent.filter((w) => w.spentCents <= w.allowanceCents).length;
  const kept = recent.filter(commitmentKept).length;
  const parts = [`Inside your rules ${inside} of ${weeks(recent.length)}.`, `You kept your savings promise ${kept} of ${recent.length}.`];
  if (goal) {
    const short = goal.targetCents - savingsCents;
    if (short <= 0) parts.push(`You've saved enough for ${goal.title}.`);
    else if (commitmentCents > 0) parts.push(`${goal.title}: ${weeks(Math.ceil(short / commitmentCents))} away.`);
  }
  return parts.join(" ");
}

function asking(level: Level, guardian: string): string {
  const def = LEVELS[level];
  if (def.approvalOverCents === null) return "nothing inside your shops needs asking";
  return `over ${formatCents(def.approvalOverCents)}${def.firstTimeApproval ? " or a new shop" : ""} needs ${guardian}'s OK`;
}

export const levelLine = (level: Level, guardian: string): string => `Level ${level} · ${asking(level, guardian)}`;

export function levelProgress(streak: number, level: Level): string {
  if (level === 3) return "You're at the top level.";
  const goal = `Keep your savings promise 4 weeks running to reach Level ${level + 1}.`;
  return streak > 0 ? `${goal} You're on ${Math.min(streak, 4)}.` : goal;
}

const OPENS: Record<string, string> = { books: "A bookshop opens too.", apparel: "Clothes and sneaker shops open too." };

/** Mock 5's "What changed", from the level table itself. */
export function whatChanged(from: Level, to: Level, guardian: string): string {
  const def = LEVELS[to];
  const ask = def.approvalOverCents === null
    ? "nothing inside your shops needs asking"
    : `only things over ${formatCents(def.approvalOverCents)} need ${guardian}'s OK`;
  const added = def.merchantClasses.filter((c) => !LEVELS[from].merchantClasses.includes(c));
  const opens = added.map((c) => OPENS[c]).filter(Boolean);
  return [`Your weekly limit is now ${formatCents(def.weeklyCents)}, and ${ask}.`, ...opens].join(" ");
}
