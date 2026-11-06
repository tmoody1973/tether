"use server";

import { redirect } from "next/navigation";
import { teenFromForm } from "@/auth/teen";
import { marketFromEnv } from "@/adapters/alpaca/data";
import { ANSWER_MAX, isSymbol, proposeFromTeen, type Answers } from "@/flows/teenInvest";
import { formatCents } from "@/ui/grantWords";
import { parseDollars } from "@/ui/teenWords";
import { teenDeps } from "../../teenDeps";

export type ProposeState = { error?: string; values?: Record<string, string> };
const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** "Propose to Amara" from the fund page. Her answers are kept on the form if anything needs fixing. */
export async function proposeAction(_prev: ProposeState, form: FormData): Promise<ProposeState> {
  const f = await teenFromForm(form);
  if (!f) return { error: "This link doesn't work any more. Ask whoever sent it to you for a new one." };
  const g = f.fam.guardianName;
  const symbol = text(form.get("symbol"), 6).toUpperCase();
  const answers: Answers = { why: text(form.get("why"), ANSWER_MAX + 1), sell: text(form.get("sell"), ANSWER_MAX + 1), drop: text(form.get("drop"), ANSWER_MAX + 1) };
  const amount = text(form.get("amount"), 20);
  const values = { ...answers, amount };
  if (!isSymbol(symbol)) return { error: "We couldn't find that one.", values };
  try {
    const hit = (await marketFromEnv().searchAssets(symbol)).some((a) => a.symbol === symbol);
    if (!hit) return { error: "We couldn't find that one.", values };
  } catch (err) {
    console.error("proposeAction: market unavailable", err instanceof Error ? err.message : err);
    return { error: "Prices aren't available right now. Try again in a bit.", values };
  }
  const cents = parseDollars(amount);
  const r = cents === null ? { ok: false as const, error: "amount" as const } : await proposeFromTeen(teenDeps(f.db), f.fam.id, symbol, cents, answers);
  if (r.ok) redirect(`/t/${f.token}/invest/${symbol}?sent=${r.sent}`);
  const words: Record<Exclude<typeof r.error, "savings">, string> = {
    level: "Investing opens at Level 3.",
    rules: "Your rules aren't in force right now, so nothing can be proposed.",
    symbol: "We couldn't find that one.",
    answers: "Answer all three questions in your own words.",
    amount: "Say an amount in dollars, at least $1.00.",
    asked: `You've already asked ${g} about this one.`,
  };
  return { error: r.error === "savings" ? `You have ${formatCents(r.savingsCents)} saved, so at most that.` : words[r.error], values };
}
