import type { Cents, Constraint, CostTerms, Grant, SpendingMode } from "./types";

export type Level = 1 | 2 | 3;

export interface LevelDef {
  level: Level; weeklyCents: Cents; approvalOverCents: Cents | null; firstTimeApproval: boolean;
  merchantClasses: string[]; investing: boolean;
}

export const LEVELS: Record<Level, LevelDef> = {
  1: { level: 1, weeklyCents: 2000, approvalOverCents: 1000, firstTimeApproval: true, merchantClasses: ["general"], investing: false },
  2: { level: 2, weeklyCents: 3000, approvalOverCents: 2000, firstTimeApproval: false, merchantClasses: ["general", "books"], investing: true },
  3: { level: 3, weeklyCents: 5000, approvalOverCents: null, firstTimeApproval: false, merchantClasses: ["general", "books", "apparel", "sneakers"], investing: true },
};

/** The lowest level that can invest; every "Investing opens at Level N" line reads this. */
export const INVESTING_FROM: Level = ([1, 2, 3] as const).find((l) => LEVELS[l].investing)!;

/** stopped: Amara stopped the rules during this week (decision 029). It still saves, but never counts as kept. */
export interface WeekRecord { weekKey: string; allowanceCents: Cents; spentCents: Cents; commitmentCents: Cents; stopped?: boolean }

export const commitmentKept = (w: WeekRecord): boolean => !w.stopped && w.allowanceCents - w.spentCents >= w.commitmentCents;

/** What a week adds to savings: the allowance she didn't spend. The one formula week close and the statement share. */
export const unspentCents = (allowanceCents: Cents, spentCents: Cents): Cents => Math.max(0, allowanceCents - spentCents);

/**
 * The grant as it stands at `at` (decision 029): before `thisWeek.until`, its weekly amount, weekly budget and
 * per-purchase cap are the amount kept from the rules it replaced. Everything else (shops, approvals) is the new rules.
 */
export function asOf(g: Grant, at: Date): Grant {
  if (!g.thisWeek || at.getTime() >= Date.parse(g.thisWeek.until)) return g;
  const cents = g.thisWeek.weeklyCents;
  return {
    ...g, weeklyCents: cents,
    constraints: g.constraints.map((c) => (c.type === "payment.budget" || c.type === "payment.amount_range" ? { ...c, maxCents: cents } : c)),
  };
}

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
  if (s >= 4 && level < 3) return { action: "PROMOTE", streak: s, reason: `Kept her savings promise ${s} weeks running.` }; // Amara reads this, about Zoe
  if (level === 3) return { action: "HOLD", streak: s, reason: "Already at the top level." };
  const recent = weeks.slice(-4);
  return { action: "HOLD", streak: s, reason: `${recent.filter(commitmentKept).length} of ${recent.length} weeks kept — keep going.` };
}

const WEEK_MS = 7 * 86_400_000;

/**
 * Decision 030: the approval rules from the level, or from Amara's spending mode. "every": each purchase asks her.
 * "upTo": her number replaces the level's (null = no per-purchase limit); Level 1's first-shop check stays.
 */
export function approvalConstraints(level: Level, spending?: SpendingMode): Constraint[] {
  const def = LEVELS[level];
  if (spending?.mode === "every") return [{ type: "approval.every_purchase" }];
  const over = spending?.mode === "upTo" ? spending.upToCents : def.approvalOverCents;
  return [
    ...(over !== null ? [{ type: "approval.over_amount", overCents: over } as const] : []),
    ...(def.firstTimeApproval ? [{ type: "approval.first_time_merchant" } as const] : []),
  ];
}

/** `cs` with its approval rules replaced by those of `spending` (absent: the level's). Other rules untouched. */
export const withSpending = (cs: Constraint[], level: Level, spending?: SpendingMode): Constraint[] =>
  [...cs.filter((c) => !String(c.type).startsWith("approval.")), ...approvalConstraints(level, spending)];

/** Decision 030: while Amara has paused spending, every purchase needs her yes (an approval reason, so her yes clears it). */
export const withPause = (g: Grant, paused: boolean): Grant =>
  paused ? { ...g, constraints: [...g.constraints, { type: "approval.paused" }] } : g;

/**
 * Decision 030 (review HIGH 1): Amara's spending mode across a level change, never looser than she chose. "every" and
 * "no limit" stay as they are; an "up to" amount stays, capped at the new level's weekly money. The server and the
 * rules page's preview both use this, so the clause she confirms is the rule that's signed.
 */
export function carrySpending(spending: SpendingMode | undefined, level: Level): SpendingMode | undefined {
  if (!spending || spending.mode === "every" || spending.upToCents === null) return spending;
  return { mode: "upTo", upToCents: Math.min(spending.upToCents, LEVELS[level].weeklyCents) };
}

/** Decision 030: the consent settings a signing carries. */
export interface ConsentSettings { spending?: SpendingMode; investing?: boolean; costs?: CostTerms }

/**
 * Review NEW-1: the one rule for what a signing ends up with. What the form sends, else the latest rules' setting (the
 * spending mode carried by level). The server signs with it and the rules page's clause previews with it.
 */
export function settingsToSign(level: Level, sent: ConsentSettings, latest?: ConsentSettings): ConsentSettings {
  return {
    spending: sent.spending ?? carrySpending(latest?.spending, level),
    investing: sent.investing ?? latest?.investing,
    costs: sent.costs ?? latest?.costs,
  };
}

/** Amara's "up to" amount: whole cents, at least $1, at most the weekly amount (null: no limit, Level 3's default). */
export const validSpending = (s: SpendingMode, weeklyCents: Cents): boolean =>
  s.mode === "every" || s.upToCents === null || (Number.isInteger(s.upToCents) && s.upToCents >= 100 && s.upToCents <= weeklyCents);

/** The amount over which a purchase asks Amara, or null if none does ("every" asks for everything: 0). */
export function askOverCents(level: Level, spending?: SpendingMode): Cents | null {
  if (spending?.mode === "every") return 0;
  return spending?.mode === "upTo" ? spending.upToCents : LEVELS[level].approvalOverCents;
}

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
