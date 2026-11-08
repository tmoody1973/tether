"use server";

// Decision 030: Amara's consent controls. Every form carries the teen it was drawn for (guardianDeps refuses a stale
// one). Nothing here is reachable by the AI: these are parent forms only.
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { GrantError, RulesNotInForceError, setCosts, setInvesting, setPaused, setSpending } from "@/flows/grant";
import { getActiveGrant } from "@/db/repo";
import { formatCents } from "@/ui/grantWords";
import type { SpendingMode } from "@/engine/types";
import { guardianDeps } from "../guardianDeps";
import { parseCosts, parseSpending } from "./consentForm";

export type ControlState = { error?: string; done?: string };

const SIGNED_OUT = "Open your Tether link to continue.";
const NOT_IN_FORCE = "Her rules aren't in force, so there's nothing to change now. Set this when you sign them.";

async function weekly(familyId: string, db: Parameters<typeof getActiveGrant>[0]): Promise<string> {
  const g = await getActiveGrant(db, familyId);
  return g ? formatCents(g.body.weeklyCents) : "her weekly amount";
}

/** "Ask me before every purchase" / "Up to $X without asking". Applies at once, as a new rules version. */
export async function spendingAction(_prev: ControlState, form: FormData): Promise<ControlState> {
  const g = await guardianDeps(form);
  if (!g) return { error: SIGNED_OUT };
  const spending: SpendingMode | null = parseSpending(form);
  if (!spending) return { error: "Choose how she spends, and an amount in dollars and cents. Nothing changed." };
  try {
    const { version } = await setSpending(g.deps, g.familyId, spending);
    refresh();
    return { done: `Saved. Her rules are now version ${version}.` };
  } catch (err) {
    if (err instanceof RulesNotInForceError) return { error: NOT_IN_FORCE };
    if (err instanceof GrantError) return { error: `The amount must be between $1.00 and ${await weekly(g.familyId, g.deps.db)}. Nothing changed.` };
    console.error("setSpending failed", err);
    return { error: "That couldn't be saved. Nothing changed." };
  }
}

/** Sales tax and shipping estimates, at once, as a new rules version. */
export async function costsAction(_prev: ControlState, form: FormData): Promise<ControlState> {
  const g = await guardianDeps(form);
  if (!g) return { error: SIGNED_OUT };
  const costs = parseCosts(form);
  if (!costs) return { error: "Sales tax must be between 0% and 15%, and shipping between $0.00 and $50.00. Nothing changed." };
  try {
    const { version } = await setCosts(g.deps, g.familyId, costs);
    refresh();
    return { done: `Saved. New purchases use these estimates. Her rules are now version ${version}.` };
  } catch (err) {
    if (err instanceof RulesNotInForceError) return { error: NOT_IN_FORCE };
    console.error("setCosts failed", err);
    return { error: "That couldn't be saved. Nothing changed." };
  }
}

/** Investing on or off, at once, as a new rules version. */
export async function investingAction(_prev: ControlState, form: FormData): Promise<ControlState> {
  const g = await guardianDeps(form);
  if (!g) return { error: SIGNED_OUT };
  const on = form.get("investing");
  if (on !== "on" && on !== "off") return { error: "Choose on or off. Nothing changed." };
  try {
    const { version } = await setInvesting(g.deps, g.familyId, on === "on");
    refresh();
    return { done: `Investing is ${on}. Her rules are now version ${version}.` };
  } catch (err) {
    if (err instanceof RulesNotInForceError) return { error: NOT_IN_FORCE };
    console.error("setInvesting failed", err);
    return { error: "That couldn't be saved. Nothing changed." };
  }
}

/** Pause or resume spending: instant, reversible, not a re-signing. Back to the page the control was on. */
export async function pauseAction(form: FormData): Promise<void> {
  const g = await guardianDeps(form);
  if (!g) redirect("/g");
  const paused = form.get("paused");
  if (paused === "1" || paused === "0") await setPaused(g.deps, g.familyId, paused === "1");
  refresh();
}
