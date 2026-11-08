"use client";

import { useEffect, useId, useRef, useState } from "react";
import { needsBadge } from "@/ui/activityWords";
import type { SwitcherTeen } from "@/flows/home";

// Stable colour per teen (from the family id), each dark enough for white initials. Not a warning colour, so no red.
const COLOURS = ["#0F6E5C", "#6B46C1", "#2B5DA8", "#1F6F8B", "#8A5A00", "#9D2F6B"];
export function teenColour(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLOURS[h % COLOURS.length];
}

function Avatar({ t }: { t: Pick<SwitcherTeen, "id" | "teenName"> }) {
  return <span className="g-avatar" style={{ background: teenColour(t.id) }} aria-hidden="true">{Array.from(t.teenName)[0]?.toUpperCase()}</span>;
}

function Count({ n }: { n: number | null }) {
  const b = n === null ? null : needsBadge(n);
  return b ? <span className="g-badge">{b}<span className="g-sr"> waiting</span></span> : null;
}

/**
 * The teen switcher (decision 028): the current teen as an initial and a name; tapping lists her teens with what's
 * waiting on each, and "Add a teen". A disclosure (a button that shows and hides the list): Escape or a tap outside
 * closes it, and Escape puts focus back on the button. Switching posts to the ownership-checked switch route with the
 * tab she's on, so Rules opens the other teen's Rules.
 */
export function TeenSwitcher({ teens, active }: { teens: SwitcherTeen[]; active: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = `${useId()}-teens`;
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const current = teens.find((t) => t.current) ?? teens[0];
  const elsewhere = teens.reduce((n, t) => n + (t.current ? 0 : t.needs ?? 0), 0);
  return (
    <div className="g-switcher" ref={box}
      onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); button.current?.focus(); } }}>
      <button ref={button} type="button" className="g-switcher__btn" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
        <Avatar t={current} />
        <span className="g-switcher__name"><span className="g-sr">Teen: </span>{current.teenName}</span>
        {elsewhere > 0 && <span className="g-badge">{needsBadge(elsewhere)}<span className="g-sr"> waiting for your other teens</span></span>}
        <svg className="g-switcher__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <div id={listId} className="g-switcher__pop" hidden={!open}>
        <p className="g-label">Your teens</p>
        <ul className="g-switcher__list">
          {teens.map((t) => (
            <li key={t.id}>
              {t.current ? (
                <div className="g-switcher__row" aria-current="true">
                  <Avatar t={t} /><span className="g-switcher__rowname">{t.teenName}</span><span className="g-switcher__now">Open now</span><Count n={t.needs} />
                </div>
              ) : (
                <form method="post" action="/g/settings/switch">
                  <input type="hidden" name="familyId" value={t.id} />
                  <input type="hidden" name="to" value={active} />
                  <button type="submit" className="g-switcher__row">
                    <Avatar t={t} /><span className="g-switcher__rowname"><span className="g-sr">Switch to </span>{t.teenName}</span><Count n={t.needs} />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {/* A plain <a>: this starts a PayPal redirect and must never be prefetched. */}
        <a className="g-switcher__add" href="/g/login/paypal?add=1">+ Add a teen</a>
      </div>
    </div>
  );
}
