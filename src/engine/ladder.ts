import type { Cents, Constraint, Grant } from "./types";

export type Level = 1 | 2 | 3;

export interface LevelDef {
  level: Level; weeklyCents: Cents; approvalOverCents: Cents | null; firstTimeApproval: boolean;
  merchantClasses: string[]; investing: boolean;
}

export const LEVELS: Record<Level, LevelDef> = {
  1: { level: 1, weeklyCents: 2000, approvalOverCents: 1000, firstTimeApproval: true, merchantClasses: ["general"], investing: false },
  2: { level: 2, weeklyCents: 3000, approvalOverCents: 2000, firstTimeApproval: false, merchantClasses: ["general", "books"], investing: false },
  3: { level: 3, weeklyCents: 5000, approvalOverCents: null, firstTimeApproval: false, merchantClasses: ["general", "books", "apparel", "sneakers"], investing: true },
};

export interface WeekRecord { weekKey: string; allowanceCents: Cents; spentCents: Cents; commitmentCents: Cents }

export const commitmentKept = (w: WeekRecord): boolean => w.allowanceCents - w.spentCents >= w.commitmentCents;

/** Consecutive kept weeks ending at the last element (chronological input). */
export function streak(weeks: WeekRecord[]): number {
  let n = 0;
  for (let i = weeks.length - 1; i >= 0 && commitmentKept(weeks[i]); i--) n++;
  return n;
}

/** The least Zoe may commit to save each week: Amara's floor, as a share of the allowance. */
export const commitmentFloorCents = (weeklyCents: Cents, floorPct: number): Cents => Math.ceil((weeklyCents * floorPct) / 100);

export function validateCommitment(
  commitmentCents: Cents, weeklyCents: Cents, floorPct: number,
): { ok: true } | { ok: false; minCents: Cents } {
  const minCents = commitmentFloorCents(weeklyCents, floorPct);
  return Number.isInteger(commitmentCents) && commitmentCents >= 0 && commitmentCents >= minCents
    ? { ok: true } : { ok: false, minCents };
}

export type Review = { action: "PROMOTE" | "HOLD"; streak: number; reason: string };

export function reviewMonth(weeks: WeekRecord[], level: Level): Review {
  const s = streak(weeks);
  if (s >= 4 && level < 3) return { action: "PROMOTE", streak: s, reason: `Kept your savings commitment ${s} weeks running.` };
  if (level === 3) return { action: "HOLD", streak: s, reason: "Already at the top level." };
  const recent = weeks.slice(-4);
  return { action: "HOLD", streak: s, reason: `${recent.filter(commitmentKept).length} of ${recent.length} weeks kept — keep going.` };
}

const WEEK_MS = 7 * 86_400_000;

export function grantForLevel(
  level: Level,
  base: Pick<Grant, "id" | "familyId" | "version" | "commitmentFloorPct" | "matchPct" | "fundAllowlist">,
  merchantsByClass: Record<string, string[]>, bookshopIds: string[], now: Date,
): Grant {
  const def = LEVELS[level];
  const expiresAt = new Date(now.getTime() + WEEK_MS).toISOString();
  const payees = [...new Set(def.merchantClasses.flatMap((c) => merchantsByClass[c] ?? []))];
  const constraints: Constraint[] = [
    { type: "payment.amount_range", minCents: 100, maxCents: def.weeklyCents },
    { type: "payment.budget", maxCents: def.weeklyCents, period: "WEEKLY" },
    { type: "payment.allowed_payees", merchantIds: payees },
    { type: "payment.execution_date", notBefore: now.toISOString(), notAfter: expiresAt },
    ...(def.approvalOverCents !== null ? [{ type: "approval.over_amount", overCents: def.approvalOverCents } as const] : []),
    ...(def.firstTimeApproval ? [{ type: "approval.first_time_merchant" } as const] : []),
    ...(level >= 2 && bookshopIds.length > 0
      ? [{ type: "checkout.semantic_category", merchantIds: bookshopIds, rule: "BOOKS_ONLY" } as const] : []),
  ];
  return {
    id: base.id, familyId: base.familyId, version: base.version, level, weeklyCents: def.weeklyCents,
    commitmentFloorPct: base.commitmentFloorPct, matchPct: base.matchPct, constraints,
    fundAllowlist: base.fundAllowlist, signedAt: now.toISOString(), expiresAt,
  };
}
