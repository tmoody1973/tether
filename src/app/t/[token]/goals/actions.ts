"use server";

import { redirect } from "next/navigation";
import { teenFromForm } from "@/auth/teen";
import { GOAL_TITLE_MAX, setGoal, setTeenCommitment } from "@/flows/teenGoals";
import { formatCents } from "@/ui/grantWords";
import { parseDollars } from "@/ui/teenWords";
import { teenDeps } from "../../teenDeps";

const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Name or rename the goal. The page reads the outcome from ?goal= (a code, never her words). */
export async function goalAction(form: FormData): Promise<void> {
  const f = await teenFromForm(form);
  if (!f) redirect("/t/gone");
  const cents = parseDollars(text(form.get("target"), 20));
  const r = cents === null ? { ok: false as const, error: "target" as const }
    : await setGoal({ db: f.db }, f.fam.id, text(form.get("title"), GOAL_TITLE_MAX + 1), cents);
  redirect(`/t/${f.token}/goals?goal=${r.ok ? "saved" : r.error}`);
}

export type PromiseState = { error?: string };

/** Her weekly savings promise (whole dollars from the −/+ editor). Applies from next week. */
export async function promiseAction(_prev: PromiseState, form: FormData): Promise<PromiseState> {
  const f = await teenFromForm(form);
  if (!f) return { error: "This link doesn't work any more. Ask whoever sent it to you for a new one." };
  const cents = Number(form.get("cents"));
  const r = await setTeenCommitment(teenDeps(f.db), f.fam.id, cents);
  if (r.ok) redirect(`/t/${f.token}/goals?promise=saved`);
  if (r.error === "floor") return { error: `At least ${formatCents(r.minCents)} a week` };
  if (r.error === "max") return { error: `At most ${formatCents(r.maxCents)} a week, which is all of your allowance` };
  return { error: "Your rules aren't in force right now, so your promise can't change yet." };
}
