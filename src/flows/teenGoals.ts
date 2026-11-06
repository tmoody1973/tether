// Zoe's goal and her own weekly savings promise (F13, D15). familyId always comes from her link (R39).
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { getActiveGrant, getFamily } from "@/db/repo";
import { commitmentFloorCents } from "@/engine/ladder";
import { GrantError, setCommitment } from "@/flows/grant";
import type { Deps } from "@/flows/purchase";
import { teenWeek, TeenError, type TeenWeek } from "@/flows/teen";

export const GOAL_TITLE_MAX = 40;
export const GOAL_TARGET_MAX_CENTS = 1_000_000; // $10,000
export const GOAL_TARGET_MIN_CENTS = 100;

export interface TeenGoals {
  week: TeenWeek;
  /** The promise in force this week, and the one she chose that starts at the next week close (null: no change). */
  commitmentCents: number; pendingCents: number | null;
  floorCents: number; weeklyCents: number; matchPct: number;
}

export async function teenGoals(db: Db, familyId: string, now: Date): Promise<TeenGoals> {
  const [week, fam, grant] = await Promise.all([teenWeek(db, familyId, now), getFamily(db, familyId), getActiveGrant(db, familyId)]);
  if (!fam) throw new TeenError(`unknown family ${familyId}`);
  const body = grant?.body;
  return {
    week, commitmentCents: week.commitmentCents, pendingCents: fam.pendingCommitmentCents,
    floorCents: body ? commitmentFloorCents(body.weeklyCents, body.commitmentFloorPct) : 0,
    weeklyCents: body?.weeklyCents ?? week.weeklyCents, matchPct: body?.matchPct ?? 0,
  };
}

export type GoalResult = { ok: true } | { ok: false; error: "title" | "target" };

/** Name (or rename) what she's saving for. One goal per family. */
export async function setGoal(deps: Pick<Deps, "db">, familyId: string, title: string, targetCents: number): Promise<GoalResult> {
  const name = title.trim();
  if (!name || name.length > GOAL_TITLE_MAX) return { ok: false, error: "title" };
  if (!Number.isInteger(targetCents) || targetCents < GOAL_TARGET_MIN_CENTS || targetCents > GOAL_TARGET_MAX_CENTS) return { ok: false, error: "target" };
  await deps.db.insert(t.goals).values({ familyId, title: name, targetCents })
    .onConflictDoUpdate({ target: t.goals.familyId, set: { title: name, targetCents } });
  return { ok: true };
}

export type CommitmentResult = { ok: true } | { ok: false; error: "floor"; minCents: number } | { ok: false; error: "max"; maxCents: number } | { ok: false; error: "rules" };

/** Her promise for next week: at least Amara's floor, at most the allowance. Applied at the next week close. */
export async function setTeenCommitment(deps: Deps, familyId: string, cents: number): Promise<CommitmentResult> {
  const grant = await getActiveGrant(deps.db, familyId);
  if (!grant || grant.expiresAt <= await deps.now(familyId)) return { ok: false, error: "rules" };
  if (Number.isInteger(cents) && cents > grant.body.weeklyCents) return { ok: false, error: "max", maxCents: grant.body.weeklyCents };
  try {
    await setCommitment(deps, familyId, cents);
    return { ok: true };
  } catch (e) {
    if (e instanceof GrantError && e.minCents !== undefined) return { ok: false, error: "floor", minCents: e.minCents };
    if (e instanceof GrantError) return { ok: false, error: "rules" };
    throw e;
  }
}
