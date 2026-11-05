"use server";

import { redirect } from "next/navigation";
import { guardianFamilyId } from "@/auth/guardianSession";
import { advance, clockFor } from "@/clock/clock";
import { getDb } from "@/db/client";
import { GrantError, ReasonRequiredError, resetTeenLink, signGrant } from "@/flows/grant";
import { closeWeek } from "@/flows/week";
import type { Level } from "@/engine/ladder";

const DAY_MS = 86_400_000;
const SIGNED_OUT = "Open your Tether link to continue.";

async function guardianDeps() {
  const familyId = await guardianFamilyId();
  if (!familyId) return null;
  const db = await getDb();
  return { familyId, deps: { db, now: clockFor(db) } };
}

const int = (v: FormDataEntryValue | null): number => (typeof v === "string" && /^\d{1,3}$/.test(v) ? Number(v) : NaN);

export type SignState = { error?: string };

/** Sign and send: validates the form, then the flow does the work (and refuses a level change without a reason). */
export async function signGrantAction(_prev: SignState, form: FormData): Promise<SignState> {
  const g = await guardianDeps();
  if (!g) return { error: SIGNED_OUT };
  const level = int(form.get("level"));
  const floorPct = int(form.get("floorPct"));
  const matchPct = int(form.get("matchPct"));
  const reason = String(form.get("reason") ?? "").slice(0, 500);
  if (![1, 2, 3].includes(level)) return { error: "Choose a level." };
  if (!(floorPct >= 10 && floorPct <= 100)) return { error: "Her savings floor must be between 10% and 100% of the allowance." };
  if (!(matchPct >= 0 && matchPct <= 200)) return { error: "Choose a match." };
  let version: number;
  try {
    ({ version } = await signGrant(g.deps, g.familyId, { level: level as Level, commitmentFloorPct: floorPct, matchPct, reason }));
  } catch (err) {
    if (err instanceof ReasonRequiredError) return { error: "Say why you're changing her level — it goes on the record." };
    if (err instanceof GrantError) return { error: "Those rules couldn't be signed. Nothing changed." };
    console.error("signGrant failed", err);
    return { error: "Those rules couldn't be signed. Nothing changed." };
  }
  redirect(`/g?signed=${version}`);
}

export async function resetTeenLinkAction(): Promise<void> {
  const g = await guardianDeps();
  if (!g) redirect("/g");
  await resetTeenLink(g.deps, g.familyId);
  redirect("/g?link=reset");
}

/** Demo clock: moves this family's "today" forward, then closes any week that ended (unspent allowance → savings). */
export async function advanceClockAction(form: FormData): Promise<void> {
  const g = await guardianDeps();
  if (!g) redirect("/g");
  const days = int(form.get("days"));
  if (days !== 1 && days !== 7) redirect("/g");
  await advance(g.deps.db, g.familyId, days * DAY_MS);
  try {
    await closeWeek(g.deps, g.familyId);
  } catch (err) {
    if (!(err instanceof GrantError)) throw err; // no grant yet: nothing to close
  }
  redirect(`/g?advanced=${days}`);
}
