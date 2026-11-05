import type { Outcome } from "./types";

export interface Probability { probability: number | null; model: string; modelVersion: string }
export interface SemanticRule { type: string; question: string; allowAt: number; refuseBelow: number }

export const BOOKS_ONLY: SemanticRule = {
  type: "checkout.semantic_category",
  question:
    "Is this item a printed book or an ebook for reading, rather than a game, " +
    "a toy, a collectible, or a gift card?",
  allowAt: 0.98,
  refuseBelow: 0.7,
};

export function bandOf(p: number | null, rule: SemanticRule): Outcome {
  if (p === null || !Number.isFinite(p)) return "REFUSE";
  if (p >= rule.allowAt) return "ALLOW";
  if (p >= rule.refuseBelow) return "NEEDS_APPROVAL";
  return "REFUSE";
}

/** AND-composition: gate 2 can only tighten gate 1, never loosen it. */
export function compose(gate1: Outcome, gate2: Outcome[]): Outcome {
  if (gate1 === "REFUSE" || gate2.includes("REFUSE")) return "REFUSE";
  if (gate1 === "NEEDS_APPROVAL" || gate2.includes("NEEDS_APPROVAL")) return "NEEDS_APPROVAL";
  return "ALLOW";
}
