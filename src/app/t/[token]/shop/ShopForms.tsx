"use client";

import { useActionState } from "react";
import Link from "next/link";
import { formatCents } from "@/ui/grantWords";
import { PendingButton } from "@/ui/PendingButton";
import { Chip } from "@/ui/teen";
import { ProductPhoto } from "@/ui/ProductPhoto";
import { TEEN_ESTIMATES } from "@/ui/teenWords";
import { buyAction, shopAction, type ShopCard, type ShopState } from "../actions";

/**
 * D18 agent box (one text box, not a chat), paste-a-link, and search inside her shops. All three share one
 * result list; every card carries the engine's label and the one action that label allows.
 */
export function ShopForms({ token, guardian }: { token: string; guardian: string }) {
  const [state, action, pending] = useActionState<ShopState, FormData>(shopAction, { cards: [] });
  const hidden = (mode: string) => <><input type="hidden" name="token" value={token} /><input type="hidden" name="mode" value={mode} /></>;
  return (
    <>
      <form action={action} className="t-card t-form">
        {hidden("agent")}
        <label className="t-label" htmlFor="request">What are you after?</label>
        <input id="request" name="request" className="t-input" maxLength={200} required placeholder="noise-cancelling headphones under $50" />
        <PendingButton label="Find options" pendingLabel="Looking in your shops…" className="t-btn t-btn--primary" />
        <p className="t-muted">A helper looks only in your shops and suggests two or three. It can&apos;t buy anything — your rules decide.</p>
      </form>

      <form action={action} className="t-card t-form">
        {hidden("link")}
        <label className="t-label" htmlFor="url">Paste a product link</label>
        <input id="url" name="url" type="url" className="t-input" maxLength={500} required placeholder="https://…" />
        <PendingButton label="Check it" pendingLabel="Checking…" className="t-btn t-btn--ghost" />
      </form>

      <form action={action} className="t-card t-form" role="search">
        {hidden("search")}
        <label className="t-label" htmlFor="query">Search your shops</label>
        <input id="query" name="query" type="search" className="t-input" maxLength={100} required />
        <PendingButton label="Search" pendingLabel="Searching…" className="t-btn t-btn--ghost" />
      </form>

      <section aria-label="Results" aria-busy={pending} aria-live="polite">
        {state.cards.length > 0 && <h2 className="t-eyebrow" style={{ marginBottom: 6 }}>What your rules say</h2>}
        {state.error && <p className="t-flash t-flash--warn" role="alert">{state.error}</p>}
        {state.note && <p className="t-flash">{state.note}</p>}
        <ul className="t-results" style={{ listStyle: "none" }}>
          {state.cards.map((c) => <li key={c.purchaseId}><ResultCard card={c} token={token} guardian={guardian} /></li>)}
        </ul>
        {state.cards.some((c) => c.cost.startsWith("Item ")) && <p className="t-hint">{TEEN_ESTIMATES}</p>}
      </section>
    </>
  );
}

/** Shop name only — never an offer link (affiliate), never a rating. */
function ResultCard({ card: c, token, guardian }: { card: ShopCard; token: string; guardian: string }) {
  return (
    <article className="t-card t-result" aria-label={`${c.title}, ${formatCents(c.priceCents)} at ${c.shop}: ${c.label}`}>
      <div className="t-result__row">
        <ProductPhoto src={c.imageUrl} title={c.title} className="t-photo" />
        <div className="t-result__main">
          <div className="t-result__top">
            <span className="t-result__title">{c.title}</span>
            <span className="t-result__price money">{formatCents(c.priceCents)}</span>
          </div>
          <div className="t-result__shop">{c.shop}{c.reason ? ` · ${c.reason}` : ""}</div>
          {c.condition && <span className="t-chip t-chip--note">{c.condition}</span>}
        </div>
      </div>
      <p className="t-small t-result__cost">{c.cost}</p>
      <Chip kind={c.kind} label={c.label} />
      {c.setsBack && <p className="t-small t-result__goal" data-testid="sets-back">{c.setsBack}</p>}
      {c.kind === "fits" && (
        <form action={buyAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="purchaseId" value={c.purchaseId} />
          <PendingButton label={`Buy for ${formatCents(c.priceCents)}`} pendingLabel="Paying…" className="t-btn t-btn--primary" />
        </form>
      )}
      {c.kind === "needs" && <Link className="t-btn t-btn--primary" href={`/t/${token}/ask/${c.purchaseId}`}>Ask {guardian}</Link>}
      {(c.kind === "over" || c.kind === "refused") && <Link className="t-btn t-btn--ghost" href={`/t/${token}?sheet=${c.purchaseId}`}>Why not?</Link>}
    </article>
  );
}
