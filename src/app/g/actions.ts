"use server";

import { redirect } from "next/navigation";
import { guardianFamilyId } from "@/auth/guardianSession";
import { clockFor } from "@/clock/clock";
import { getDb } from "@/db/client";
import { ApprovalError, decideApproval } from "@/flows/approvals";
import { approveAndSettle } from "@/flows/approve";
import { ADVANCES, advanceDemoClock, type Advance } from "@/flows/demo";
import { GrantError, ReasonRequiredError, RulesStoppedError, guardianSetLevel, resetTeenLink, revoke, signGrant } from "@/flows/grant";
import { confirmRelease } from "@/flows/month";
import { DemoResetError, resetDemo } from "@/flows/reset";
import type { Level } from "@/engine/ladder";
import { paymentDeps, paypalOrUnavailable } from "./flowDeps";

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

/** Demo clock (D10): moves this family's "today" forward, closes ended weeks and, at a month end, runs the review. */
export async function advanceClockAction(form: FormData): Promise<void> {
  const g = await guardianDeps();
  if (!g) redirect("/g");
  const to = String(form.get("to") ?? "");
  if (!(ADVANCES as readonly string[]).includes(to)) redirect("/g");
  const { review } = await advanceDemoClock(g.deps, g.familyId, to as Advance);
  redirect(review?.action === "PROMOTE" ? "/g/review?promoted=1" : `/g?advanced=${to}`);
}

/** Reset demo (D11): only the shared demo family, identified by the configured demo keys; anyone else is refused. */
export async function resetDemoAction(): Promise<void> {
  const g = await guardianDeps();
  if (!g) redirect("/g");
  let needsPaypal: boolean;
  try {
    const r = await resetDemo(paymentDeps(g.deps.db), g.familyId,
      { guardianKey: process.env.DEMO_GUARDIAN_KEY, teenToken: process.env.DEMO_TEEN_TOKEN });
    needsPaypal = r?.needsPaypal ?? false; // null only with ifStaleMs, which this button never passes
  } catch (err) {
    if (!(err instanceof DemoResetError)) throw err;
    redirect("/g");
  }
  redirect(`/g?demo=${needsPaypal ? "reset-paypal" : "reset"}`);
}

/**
 * One tap on a request (R36): approving also charges the purchase or places the investment. A closed,
 * decided or foreign request lands on the same calm "closed" page.
 */
export async function decideRequestAction(form: FormData): Promise<void> {
  const g = await guardianDeps();
  if (!g) redirect("/g");
  const id = String(form.get("approvalId") ?? "").slice(0, 100);
  const result = form.get("result");
  if (result !== "approved" && result !== "declined") redirect(`/g/requests/${encodeURIComponent(id)}`);
  let code: string;
  try {
    code = result === "approved"
      ? await approveAndSettle(paymentDeps(g.deps.db), g.familyId, id)
      : (await decideApproval(g.deps, id, "declined", g.familyId), "declined");
  } catch (err) {
    if (!(err instanceof ApprovalError)) throw err;
    redirect(`/g/requests/${encodeURIComponent(id)}`);
  }
  redirect(`/g?decided=${code}&req=${encodeURIComponent(id)}`);
}

/** "I've sent it": Amara moved the money herself (Venmo, PayPal or cash); Tether only records that she says so. */
export async function confirmReleaseAction(form: FormData): Promise<void> {
  const g = await guardianDeps();
  if (!g) redirect("/g");
  try {
    await confirmRelease(g.deps, String(form.get("releaseId") ?? "").slice(0, 100), g.familyId);
  } catch (err) {
    if (!(err instanceof GrantError)) throw err;
    redirect("/g/review");
  }
  redirect("/g/review?sent=1");
}

export type LevelState = { error?: string };

/** Amara overrides the level. A reason is required and goes on the record; without one nothing changes. */
export async function setLevelAction(_prev: LevelState, form: FormData): Promise<LevelState> {
  const g = await guardianDeps();
  if (!g) return { error: SIGNED_OUT };
  const level = int(form.get("level"));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  if (![1, 2, 3].includes(level)) return { error: "Choose a level." };
  if (!reason) return { error: "Say why — it goes on the record. Nothing changed." };
  try {
    await guardianSetLevel(g.deps, g.familyId, level as Level, reason);
  } catch (err) {
    if (err instanceof RulesStoppedError) return { error: "Her rules are stopped. Sign new rules to change her level." };
    console.error("guardianSetLevel failed", err);
    return { error: "The level couldn't be changed. Nothing changed." };
  }
  redirect(`/g/review?level=${level}`);
}

/** Stop Zoe's rules (after the page's confirm step). The rules stop even if PayPal won't remove the saved wallet. */
export async function revokeAction(): Promise<void> {
  const g = await guardianDeps();
  if (!g) redirect("/g");
  const r = await revoke({ ...g.deps, paypal: paypalOrUnavailable() }, g.familyId);
  if (r.error) console.error("revoke: PayPal delete failed", r.error);
  const how = r.paypalTokenDeleted ? "wallet-removed"
    : r.reason === "no_vault" ? "no-wallet" : r.reason === "demo_kept" ? "demo-kept" : "wallet-kept";
  redirect(`/g/review?stopped=${how}`);
}
