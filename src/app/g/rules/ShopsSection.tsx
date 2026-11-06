"use client";

import { useActionState, useState } from "react";
import type { FoundSite, ListedShop } from "@/flows/shops";
import { SHOP_QUERY_MAX } from "@/ui/grantWords";
import {
  addShopAction, removeShopAction, searchShopsAction, type ShopChangeState, type ShopSearchState,
} from "../actions";

export interface ShopsSectionProps { teenName: string; inForce: boolean; shops: ListedShop[] }

type Pending = { op: "add"; site: FoundSite } | { op: "remove"; shop: ListedShop } | null;

const Logo = ({ name }: { name: string }) => <span className="g-shop__logo" aria-hidden="true">{name.trim().charAt(0).toUpperCase() || "?"}</span>;

/**
 * Amara's say over Zoe's shops: remove any, or search Channel3 and add any, at any level. One in-page confirm, then the
 * change applies right away (or, with no rules in force, at her next signing). Its own section so it can move pages.
 */
export function ShopsSection({ teenName: zoe, inForce, shops }: ShopsSectionProps) {
  const [confirm, setConfirm] = useState<Pending>(null);
  const [found, search, searching] = useActionState<ShopSearchState, FormData>(searchShopsAction, {});
  const [change, submitChange, changing] = useActionState<ShopChangeState, FormData>(async (prev, form) => {
    const r = form.get("op") === "remove" ? await removeShopAction(prev, form) : await addShopAction(prev, form);
    setConfirm(null);
    return r;
  }, {});
  const listed = new Set(shops.map((s) => s.domain)); // from the server after every change: results stay current

  return (
    <section className="g-card g-section" aria-labelledby="shops-h">
      <div className="g-section__head">
        <h2 id="shops-h">Shops</h2>
        <span className="g-muted">{shops.length === 1 ? "1 shop" : `${shops.length} shops`}</span>
      </div>
      {!inForce && <p className="g-note">{zoe}&apos;s rules aren&apos;t in force. Changes here apply when you next sign them.</p>}
      {change.done && <p className="g-flash" role="status">{change.done}</p>}
      {change.error && <p className="g-error" role="alert">{change.error}</p>}

      <ul className="g-shops" aria-label={`${zoe}'s shops`}>
        {shops.length === 0 && <li className="g-muted">No shops. {zoe} can&apos;t buy anything until you add one.</li>}
        {shops.map((s) => (
          <li key={s.merchantId}>
            <Logo name={s.name} />
            <span><span className="g-shop__name">{s.name}</span><br /><span className="g-shop__meta">{s.domain} · {s.note}</span></span>
            <span className="g-shop__act">
              <button type="button" className="g-btn g-btn--ghost g-btn--small" onClick={() => setConfirm({ op: "remove", shop: s })}
                aria-label={`Remove ${s.name}`}>Remove</button>
            </span>
          </li>
        ))}
      </ul>

      {confirm && <Confirm zoe={zoe} pending={confirm} inForce={inForce} busy={changing} action={submitChange} onBack={() => setConfirm(null)} />}

      <form action={search} className="g-stack" style={{ gap: 8, marginTop: 6 }} role="search">
        <label htmlFor="shop-q" className="g-def__k">Add a shop</label>
        <div className="g-search">
          <input id="shop-q" name="q" type="search" className="g-input" placeholder="Search by name, like Lego or Etsy"
            autoComplete="off" maxLength={SHOP_QUERY_MAX} required defaultValue={found.query ?? ""} />
          <button type="submit" className="g-btn g-btn--ghost" disabled={searching}>{searching ? "Searching…" : "Search"}</button>
        </div>
      </form>
      {found.error && <p className="g-error" role="alert">{found.error}</p>}
      {found.note && <p className="g-muted" role="status">{found.note}</p>}
      {found.sites && found.sites.length > 0 && (
        <ul className="g-results" aria-label="Search results">
          {found.sites.map((s) => (
            <li key={s.domain}>
              <Logo name={s.name} />
              <span>
                <span className="g-shop__name">{s.name}</span><br />
                <span className="g-shop__meta">{s.domain}{s.opensAt ? ` · usually opens at Level ${s.opensAt}` : ""}</span>
              </span>
              <span className="g-shop__act">
                {listed.has(s.domain)
                  ? <span className="g-chip">On {zoe}&apos;s list</span>
                  : <button type="button" className="g-btn g-btn--small" onClick={() => setConfirm({ op: "add", site: s })}
                    aria-label={`Add ${s.name}`}>Add</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="g-note">Search covers the shops Tether&apos;s product search knows. {zoe} can also ask for a shop; it lands in Needs you.</p>
    </section>
  );
}

function Confirm({ zoe, pending, inForce, busy, action, onBack }: {
  zoe: string; pending: NonNullable<Pending>; inForce: boolean; busy: boolean; action: (f: FormData) => void; onBack: () => void;
}) {
  const later = inForce ? "" : " It applies when you next sign her rules.";
  const add = pending.op === "add";
  const name = add ? pending.site.name : pending.shop.name;
  const question = add ? `Add ${name} to ${zoe}'s shops?` : `Remove ${name} from ${zoe}'s shops?`;
  const early = add && pending.site.opensAt ? ` It usually opens at Level ${pending.site.opensAt}; you're choosing to open it early.` : "";
  const body = add ? `She can buy there under her usual rules.${early}${later}` : `She won't be able to buy there until you add it back.${later}`;
  return (
    <form action={action} className="g-confirm" role="group" aria-label="Confirm">
      <input type="hidden" name="op" value={pending.op} />
      {add
        ? <><input type="hidden" name="domain" value={pending.site.domain} /><input type="hidden" name="name" value={pending.site.name} /></>
        : <input type="hidden" name="merchantId" value={pending.shop.merchantId} />}
      <p style={{ fontWeight: 600 }}>{question}</p>
      <p className="g-note" style={{ marginBottom: 10 }}>{body}</p>
      <div className="g-btnrow">
        <button type="submit" className="g-btn" disabled={busy} autoFocus>{busy ? "Saving…" : add ? "Yes, add" : "Yes, remove"}</button>
        <button type="button" className="g-btn g-btn--ghost" onClick={onBack} disabled={busy}>Go back</button>
      </div>
    </form>
  );
}
