"use server";

import { redirect } from "next/navigation";
import { teenFromForm } from "@/auth/teen";
import { SUGGEST_REASON_MAX, suggestShop } from "@/flows/teenMap";
import { teenDeps } from "../../teenDeps";

export type SuggestState = { error?: string };
const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** "Suggest a shop" → a request on Amara's needs-you list. */
export async function suggestAction(_prev: SuggestState, form: FormData): Promise<SuggestState> {
  const f = await teenFromForm(form);
  if (!f) return { error: "This link doesn't work any more. Ask whoever sent it to you for a new one." };
  const g = f.fam.guardianName;
  const r = await suggestShop(teenDeps(f.db), f.fam.id, text(form.get("domain"), 200), text(form.get("why"), SUGGEST_REASON_MAX + 1));
  if (r.ok) redirect(`/t/${f.token}/map?suggested=${encodeURIComponent(r.domain)}`);
  const words: Record<Exclude<typeof r.error, "level">, string> = {
    domain: "Type the shop's web address, like etsy.com.",
    reason: `Say why in up to ${SUGGEST_REASON_MAX} characters.`,
    have: "That shop is already on your map.",
    asked: `You've already suggested that one. ${g} will see it.`,
    many: `You have a few suggestions waiting. Give ${g} a chance to answer those first.`,
    rules: "Your rules aren't in force right now, so shops can't be added.",
  };
  return { error: r.error === "level" ? `That shop opens at Level ${r.level}.` : words[r.error] };
}
