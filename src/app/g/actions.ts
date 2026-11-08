"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { ApprovalError, decideApproval } from "@/flows/approvals";
import { approveAndSettle } from "@/flows/approve";
import { ADVANCES, advanceDemoClock, type Advance } from "@/flows/demo";
import {
  GrantError, ReasonRequiredError, RulesStoppedError, WeekChangedError, guardianSetLevel, nextMonday, resetTeenLink, revoke, signGrant, type ApplyNow,
} from "@/flows/grant";
import { confirmRelease } from "@/flows/month";
import { DemoResetError, resetDemo } from "@/flows/reset";
import { SHOP_QUERY_MAX, addShop, removeShop, searchShopSites, type FoundSite } from "@/flows/shops";
import { DAILY_CAP_MESSAGE } from "@/flows/usage";
import { getFamily, getLatestGrant } from "@/db/repo";
import { parseCosts, parseSpending } from "./rules/consentForm";
import { SHOP_QUERY_WORDS, SHOP_SEARCH_DOWN, noShopsFound, weekChangeWords } from "@/ui/grantWords";
import type { Level } from "@/engine/ladder";
import { paymentDeps, paypalOrUnavailable } from "./flowDeps";
import { guardianDeps } from "./guardianDeps";

const SIGNED_OUT = "Open your Tether link to continue.";


const int = (v: FormDataEntryValue | null): number => (typeof v === "string" && /^\d{1,3}$/.test(v) ? Number(v) : NaN);

export type SignState = { error?: string };

/** "Change this week too" (decision 029), with the numbers Amara was shown; a missing or bad number never matches. */
function applyNowFrom(form: FormData): ApplyNow {
  if (form.get("applyNow") !== "1") return false;
  const cents = (k: string) => { const v = form.get(k); return typeof v === "string" && /^\d{1,7}$/.test(v) ? Number(v) : -1; };
  return { shownFromCents: cents("shownFromCents"), shownSpentCents: cents("shownSpentCents"), shownPromisedCents: cents("shownPromisedCents") };
}

/** The week moved since the page was drawn: nothing changed. Re-draw the page and say what it means now. */
async function weekChanged(db: Awaited<ReturnType<typeof getDb>>, familyId: string, err: WeekChangedError, startsOn: Date): Promise<string> {
  const zoe = (await getFamily(db, familyId))?.teenName ?? "Her";
  refresh();
  const now = weekChangeWords({ teenName: zoe, ...err.change, startsOn }).now;
  return `${zoe}'s week changed since this page opened, so nothing changed. Here's what it means now: ${now} Confirm again if that's still what you want.`;
}

/** Sign and send: validates the form, then the flow does the work (and refuses a level change without a reason). */
export async function signGrantAction(_prev: SignState, form: FormData): Promise<SignState> {
  const g = await guardianDeps(form);
  if (!g) return { error: SIGNED_OUT };
  const level = int(form.get("level"));
  const floorPct = int(form.get("floorPct"));
  const matchPct = int(form.get("matchPct"));
  const reason = String(form.get("reason") ?? "").slice(0, 500);
  if (![1, 2, 3].includes(level)) return { error: "Choose a level." };
  if (!(floorPct >= 10 && floorPct <= 100)) return { error: "Her savings floor must be between 10% and 100% of the allowance." };
  if (!(matchPct >= 0 && matchPct <= 200)) return { error: "Choose a match." };
  // Decision 030: cost estimates are required to sign. A form without them (a savings-only re-sign) keeps the rules' own.
  const hasCosts = form.has("salesTax");
  const costs = hasCosts ? parseCosts(form) ?? undefined : undefined;
  if (hasCosts && costs === undefined) return { error: "Enter the sales tax where you live (0% to 15%) and a shipping estimate ($0.00 to $50.00). Nothing changed." };
  // Required when signing rules that aren't in force; a savings-only change to rules in force keeps whatever they have.
  const latest = await getLatestGrant(g.deps.db, g.familyId);
  const inForce = latest?.status === "active" && latest.expiresAt > await g.deps.now(g.familyId);
  if (!costs && !latest?.body.costs && !inForce) {
    return { error: "Set the sales tax where you live first, under Estimated costs. Nothing changed." };
  }
  const spending = form.has("spendingMode") ? parseSpending(form) : undefined;
  if (spending === null) return { error: "Choose how she spends, and an amount in dollars and cents. Nothing changed." };
  const investing = form.get("investing") === "off" ? false : form.get("investing") === "on" ? true : undefined;
  let version: number;
  try {
    ({ version } = await signGrant(g.deps, g.familyId, {
      level: level as Level, commitmentFloorPct: floorPct, matchPct, reason, applyNow: applyNowFrom(form), costs, spending, investing,
    }));
  } catch (err) {
    if (err instanceof WeekChangedError) return { error: await weekChanged(g.deps.db, g.familyId, err, nextMonday(await g.deps.now(g.familyId))) };
    if (err instanceof ReasonRequiredError) return { error: "Say why you're changing her level — it goes on the record." };
    if (err instanceof GrantError && /spending amount/.test(err.message)) return { error: "The amount must be between $1.00 and her weekly money. Nothing changed." };
    if (err instanceof GrantError) return { error: "Those rules couldn't be signed. Nothing changed." };
    console.error("signGrant failed", err);
    return { error: "Those rules couldn't be signed. Nothing changed." };
  }
  redirect(`/g?signed=${version}`);
}

export async function resetTeenLinkAction(form: FormData): Promise<void> {
  const g = await guardianDeps(form);
  if (!g) redirect("/g");
  await resetTeenLink(g.deps, g.familyId);
  redirect("/g/settings?link=reset");
}

/** Demo clock (D10): moves this family's "today" forward, closes ended weeks and, at a month end, runs the review. */
export async function advanceClockAction(form: FormData): Promise<void> {
  const g = await guardianDeps(form);
  if (!g) redirect("/g");
  const to = String(form.get("to") ?? "");
  if (!(ADVANCES as readonly string[]).includes(to)) redirect("/g");
  const { review } = await advanceDemoClock(g.deps, g.familyId, to as Advance);
  redirect(review?.action === "PROMOTE" ? "/g/activity?promoted=1" : `/g?advanced=${to}`);
}

/** Reset demo (D11): only the shared demo family, identified by the configured demo keys; anyone else is refused. */
export async function resetDemoAction(form: FormData): Promise<void> {
  const g = await guardianDeps(form);
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
  const g = await guardianDeps(form);
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
  const g = await guardianDeps(form);
  if (!g) redirect("/g");
  try {
    await confirmRelease(g.deps, String(form.get("releaseId") ?? "").slice(0, 100), g.familyId);
  } catch (err) {
    if (!(err instanceof GrantError)) throw err;
    redirect("/g/activity");
  }
  redirect(form.get("back") === "savings" ? "/g/savings?sent=1" : "/g/activity?sent=1"); // only these two places
}

export type LevelState = { error?: string };

/** Amara overrides the level. A reason is required and goes on the record; without one nothing changes. */
export async function setLevelAction(_prev: LevelState, form: FormData): Promise<LevelState> {
  const g = await guardianDeps(form);
  if (!g) return { error: SIGNED_OUT };
  const level = int(form.get("level"));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  if (![1, 2, 3].includes(level)) return { error: "Choose a level." };
  if (!reason) return { error: "Say why — it goes on the record. Nothing changed." };
  try {
    await guardianSetLevel(g.deps, g.familyId, level as Level, reason, applyNowFrom(form));
  } catch (err) {
    if (err instanceof WeekChangedError) return { error: await weekChanged(g.deps.db, g.familyId, err, nextMonday(await g.deps.now(g.familyId))) };
    if (err instanceof RulesStoppedError) return { error: "Her rules are stopped. Sign new rules to change her level." };
    console.error("guardianSetLevel failed", err);
    return { error: "The level couldn't be changed. Nothing changed." };
  }
  redirect(`/g/rules?level=${level}`);
}

/**
 * Stop Zoe's rules (after the page's confirm step). The rules stop even if PayPal won't remove the saved wallet.
 * Lands on the closing statement (decision 029): what is still promised, with this week counted.
 */
export async function revokeAction(form: FormData): Promise<void> {
  const g = await guardianDeps(form);
  if (!g) redirect("/g");
  const r = await revoke({ ...g.deps, paypal: paypalOrUnavailable() }, g.familyId);
  if (r.error) console.error("revoke: PayPal delete failed", r.error);
  const how = r.paypalTokenDeleted ? "wallet-removed"
    : r.reason === "no_vault" ? "no-wallet" : r.reason === "demo_kept" ? "demo-kept" : "wallet-kept";
  redirect(`/g/statement?stopped=${how}`);
}

// ---- Zoe's shops (the Shops section on Zoe's rules page). No AI: Channel3 website search and plain rules. ----

export type ShopSearchState = {
  query?: string; selling?: FoundSite[]; named?: FoundSite[]; sellsTimedOut?: true; note?: string; error?: string;
};
export type ShopChangeState = { done?: string; error?: string };

/** "Add a shop": Channel3 website search, counted against the family's daily cap before Channel3 is called. */
export async function searchShopsAction(_prev: ShopSearchState, form: FormData): Promise<ShopSearchState> {
  const g = await guardianDeps(form);
  if (!g) return { error: SIGNED_OUT };
  const query = String(form.get("q") ?? "").trim().slice(0, SHOP_QUERY_MAX + 1);
  try {
    const r = await searchShopSites({ ...g.deps, channel3: paymentDeps(g.deps.db).channel3 }, g.familyId, query, "shop_sites");
    if (!r.ok) return { query, error: r.error === "cap" ? DAILY_CAP_MESSAGE : SHOP_QUERY_WORDS };
    const { selling, named, sellsTimedOut } = r;
    const found = { query, selling, named, ...(sellsTimedOut ? { sellsTimedOut } : {}) };
    return selling.length + named.length || sellsTimedOut ? found : { ...found, note: noShopsFound(query) };
  } catch (err) {
    console.error("shop search failed", err instanceof Error ? err.message : err);
    return { query, error: SHOP_SEARCH_DOWN };
  }
}

/** The line after a change: the new rules version, or (no rules in force) that it waits for her next signing. */
async function changed(db: Awaited<ReturnType<typeof getDb>>, familyId: string, what: string, version: number | null): Promise<string> {
  const teen = (await getFamily(db, familyId))?.teenName ?? "Her";
  return version === null ? `${what}. It applies when you next sign ${teen}'s rules.` : `${what}. ${teen}'s rules are now version ${version}.`;
}

/** Add a shop after the in-page confirm. It applies right away, at any level (levels are defaults, not gates). */
export async function addShopAction(_prev: ShopChangeState, form: FormData): Promise<ShopChangeState> {
  const g = await guardianDeps(form);
  if (!g) return { error: SIGNED_OUT };
  try {
    const r = await addShop(g.deps, g.familyId, { domain: String(form.get("domain") ?? "").slice(0, 200), name: String(form.get("name") ?? "") });
    refresh();
    return { done: await changed(g.deps.db, g.familyId, `${r.name} added`, r.version) };
  } catch (err) {
    if (err instanceof ApprovalError) return { error: "That isn't a shop's web address. Nothing changed." };
    console.error("addShop failed", err instanceof Error ? err.message : err);
    return { error: "That shop couldn't be added. Nothing changed." };
  }
}

/** Remove a shop after the in-page confirm: off every list right away, and it stays off until she adds it back. */
export async function removeShopAction(_prev: ShopChangeState, form: FormData): Promise<ShopChangeState> {
  const g = await guardianDeps(form);
  if (!g) return { error: SIGNED_OUT };
  try {
    const r = await removeShop(g.deps, g.familyId, String(form.get("merchantId") ?? "").slice(0, 100));
    refresh();
    return { done: await changed(g.deps.db, g.familyId, `${r.name} removed`, r.version) };
  } catch (err) {
    if (!(err instanceof GrantError)) console.error("removeShop failed", err instanceof Error ? err.message : err);
    return { error: "That shop couldn't be removed. Nothing changed." };
  }
}
