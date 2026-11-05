import { eq, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { GrantError, withFamilyLock } from "@/flows/grant";
import { closeWeek } from "@/flows/week";
import { runMonthReview, type MonthResult } from "@/flows/month";
import type { Deps } from "@/flows/purchase";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

export const ADVANCES = ["day", "week", "endOfWeek", "endOfMonth"] as const;
export type Advance = (typeof ADVANCES)[number];

/** Where the demo clock lands. "End of week/month" = one minute into the next one, so the ended period can close. */
export function advanceTarget(now: Date, to: Advance): Date {
  if (to === "day") return new Date(now.getTime() + DAY_MS);
  if (to === "week") return new Date(now.getTime() + 7 * DAY_MS);
  if (to === "endOfWeek") {
    const daysToMonday = 7 - ((now.getUTCDay() + 6) % 7);
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToMonday) + MINUTE_MS);
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) + MINUTE_MS);
}

/**
 * D10 demo clock: moves this family's "today" forward, closes every week that ended on the way
 * (unspent allowance → savings), and at a month end runs the monthly review.
 */
export async function advanceDemoClock(
  deps: Pick<Deps, "db" | "now">, familyId: string, to: Advance,
): Promise<{ weekKeys: string[]; review?: MonthResult }> {
  await withFamilyLock(deps, familyId, (tx, now) =>
    tx.update(t.families).set({ clockOffsetMs: sql`${t.families.clockOffsetMs} + ${advanceTarget(now, to).getTime() - now.getTime()}` })
      .where(eq(t.families.id, familyId)));
  const noGrant = <T>(fallback: T) => (err: unknown): T => { if (err instanceof GrantError) return fallback; throw err; };
  const { weekKeys } = await closeWeek(deps, familyId).catch(noGrant({ closed: false, weekKeys: [] as string[] }));
  if (to !== "endOfMonth") return { weekKeys };
  const review = await runMonthReview(deps, familyId).catch(noGrant(undefined));
  return { weekKeys, review };
}
