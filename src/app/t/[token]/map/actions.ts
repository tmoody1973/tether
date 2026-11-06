"use server";

import { redirect } from "next/navigation";
import { teenFromForm } from "@/auth/teen";
import { SUGGEST_REASON_MAX, suggestShop } from "@/flows/teenMap";
import { SHOP_QUERY_MAX, searchShopSites, type FoundSite } from "@/flows/shops";
import { DAILY_CAP_MESSAGE } from "@/flows/usage";
import { SHOP_QUERY_WORDS, SHOP_SEARCH_DOWN, noShopsFound } from "@/ui/grantWords";
import { teenDeps } from "../../teenDeps";

export type SuggestState = { error?: string };
const GONE = "This link doesn't work any more. Ask whoever sent it to you for a new one.";
const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** "Suggest a shop" → a request on Amara's needs-you list. */
export async function suggestAction(_prev: SuggestState, form: FormData): Promise<SuggestState> {
  const f = await teenFromForm(form);
  if (!f) return { error: GONE };
  const g = f.fam.guardianName;
  const r = await suggestShop(teenDeps(f.db), f.fam.id, text(form.get("domain"), 200), text(form.get("why"), SUGGEST_REASON_MAX + 1));
  if (r.ok) redirect(`/t/${f.token}/map?suggested=${encodeURIComponent(r.domain)}`);
  const words: Record<typeof r.error, string> = {
    domain: "Search for the shop and pick it from the list.",
    reason: `Say why in up to ${SUGGEST_REASON_MAX} characters.`,
    have: "That shop is already on your map.",
    asked: `You've already suggested that one. ${g} will see it.`,
    many: `You have a few suggestions waiting. Give ${g} a chance to answer those first.`,
    rules: "Your rules aren't in force right now, so shops can't be added.",
  };
  return { error: words[r.error] };
}

export type SiteSearchState = {
  query?: string; selling?: FoundSite[]; named?: FoundSite[]; sellsTimedOut?: true; note?: string; error?: string;
};

/** Zoe types a shop's name; Channel3 website search (daily-capped) lists shops she can pick to suggest. */
export async function searchSitesAction(_prev: SiteSearchState, form: FormData): Promise<SiteSearchState> {
  const f = await teenFromForm(form);
  if (!f) return { error: GONE };
  const query = text(form.get("q"), SHOP_QUERY_MAX + 1);
  try {
    const r = await searchShopSites(teenDeps(f.db), f.fam.id, query, "teen_shop_sites");
    if (!r.ok) return { query, error: r.error === "cap" ? DAILY_CAP_MESSAGE : SHOP_QUERY_WORDS };
    const { selling, named, sellsTimedOut } = r;
    const found = { query, selling, named, ...(sellsTimedOut ? { sellsTimedOut } : {}) };
    return selling.length + named.length || sellsTimedOut ? found : { ...found, note: noShopsFound(query) };
  } catch (err) {
    console.error("teen shop search failed", err instanceof Error ? err.message : err);
    return { query, error: SHOP_SEARCH_DOWN };
  }
}
