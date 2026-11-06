"use client";

import { useActionState, useState } from "react";
import { PendingButton } from "@/ui/PendingButton";
import { SHOP_QUERY_MAX, matchingProducts, sellsTooSlow } from "@/ui/grantWords";
import { searchSitesAction, suggestAction, type SiteSearchState, type SuggestState } from "./actions";

/**
 * "Suggest a shop": she searches for what she wants or a shop's name, picks one (shops that sell it, shops named it),
 * says why in a line, and it goes to her guardian's Needs you.
 */
export function SuggestForm({ token, guardian }: { token: string; guardian: string }) {
  const [found, search] = useActionState<SiteSearchState, FormData>(searchSitesAction, {});
  const [state, suggest] = useActionState<SuggestState, FormData>(suggestAction, {});
  const [picked, setPicked] = useState<string | null>(null);
  const groups = [
    { title: `Shops that sell ${found.query}`, sites: found.selling ?? [] },
    { title: `Shops named ${found.query}`, sites: found.named ?? [] },
  ].filter((g) => g.sites.length > 0);
  const sites = groups.flatMap((g) => g.sites);
  const choice = sites.some((s) => s.domain === picked && !s.onList) ? picked : null; // a new search clears an old pick

  return (
    <section className="t-form t-card" aria-labelledby="suggest-h">
      <h2 className="t-label" id="suggest-h" style={{ fontSize: 16 }}>Suggest a shop</h2>
      <p className="t-small">{guardian} says yes or no. If she says yes, it goes into your rules.</p>
      <form action={search} className="t-form" role="search">
        <input type="hidden" name="token" value={token} />
        <label className="t-label" htmlFor="shop-q">Find the shop</label>
        <input id="shop-q" name="q" type="search" className="t-input" placeholder="What you want, or a shop like Etsy" autoComplete="off"
          maxLength={SHOP_QUERY_MAX} required defaultValue={found.query ?? ""} />
        <PendingButton label="Search" pendingLabel="Searching…" className="t-btn t-btn--ghost" />
      </form>
      {found.error && <p className="t-flash t-flash--warn" role="alert">{found.error}</p>}
      {found.note && <p className="t-small" role="status">{found.note}</p>}
      {found.sellsTimedOut && found.query && <p className="t-small" role="status">{sellsTooSlow(found.query)}</p>}
      {sites.length > 0 && (
        <form action={suggest} className="t-form">
          <input type="hidden" name="token" value={token} />
          <p className="t-label">Pick the shop</p>
          {groups.map((g) => (
            <fieldset key={g.title} className="t-form" style={{ border: "none" }}>
              <legend className="t-small">{g.title}</legend>
              {g.sites.map((s) => (
                <label key={s.domain} className="t-row" style={{ alignItems: "center", cursor: s.onList ? "default" : "pointer" }}>
                  <span className="t-row__who">{s.name}
                    <small>{[
                      s.products ? matchingProducts(s.products) : s.domain,
                      s.onList ? "already on your map" : s.opensAt ? `usually opens at Level ${s.opensAt}` : "",
                    ].filter(Boolean).join(" · ")}</small>
                  </span>
                  <input type="radio" name="domain" value={s.domain} disabled={s.onList} checked={choice === s.domain}
                    onChange={() => setPicked(s.domain)} required aria-label={s.name} />
                </label>
              ))}
            </fieldset>
          ))}
          <label className="t-label" htmlFor="shop-why">Why this shop?</label>
          <input id="shop-why" name="why" className="t-input" maxLength={200} required autoComplete="off" />
          {state.error && <p className="t-flash t-flash--warn" role="alert">{state.error}</p>}
          <PendingButton label={`Suggest to ${guardian}`} pendingLabel="Sending…" className="t-btn t-btn--primary" />
        </form>
      )}
    </section>
  );
}
