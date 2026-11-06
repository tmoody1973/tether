import type { ReactNode } from "react";
import Link from "next/link";
import type { CardKind } from "@/ui/teenWords";
import { formatCents } from "@/ui/grantWords";

const TABS = [
  { key: "week", path: "", label: "Week" },
  { key: "shop", path: "/shop", label: "Shop" },
  { key: "goals", path: "/goals", label: "Goals" },
  { key: "map", path: "/map", label: "Map" },
  { key: "invest", path: "/invest", label: "Invest" },
] as const;

/**
 * Zoe's single column with the bottom tab bar. Every link carries her token (it is her only way in).
 * Invest is a tab only at Level 3 (below it the URL shows a calm "opens at Level 3" page).
 */
export function TeenShell({ token, active, level = null, center = false, children }: {
  token: string; active: (typeof TABS)[number]["key"] | null; level?: number | null; center?: boolean; children: ReactNode;
}) {
  const tabs = TABS.filter((tab) => tab.key !== "invest" || level === 3);
  return (
    <div className="t-app">
      <main className={center ? "t-col t-col--center" : "t-col"}>{children}</main>
      <nav className="t-tabs" aria-label="Tether">
        <ul>
          {tabs.map((tab) => (
            <li key={tab.key}>
              <Link className="t-tab" href={`/t/${token}${tab.path}`} aria-current={tab.key === active ? "page" : undefined}>
                <i aria-hidden />{tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** R39: unknown or reset link. No name, no money, no navigation. */
export function LinkGone() {
  return (
    <div className="t-app">
      <main className="t-col t-col--center">
        <div className="t-card">
          <p className="t-h2" style={{ fontSize: 20 }}>This link doesn&apos;t work any more.</p>
          <p className="t-small" style={{ marginTop: 6 }}>Ask whoever sent it to you for a new one.</p>
        </div>
      </main>
    </div>
  );
}

export function TeenLoading() {
  return <div className="t-app" aria-busy="true" />;
}

export const Money = ({ cents }: { cents: number }) => <span className="money">{formatCents(cents)}</span>;

/** One bar per screen at most (design system §4); gold is the savings goal. */
export function Bar({ value, max, label, gold = false }: { value: number; max: number; label: string; gold?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return <div className={gold ? "t-bar t-bar--gold" : "t-bar"} role="img" aria-label={label}><span style={{ width: `${pct}%` }} /></div>;
}

const STOP_HAND = <path d="M5 8V4.5a1 1 0 012 0V7m0-3.5a1 1 0 012 0V7m0-2a1 1 0 012 0v4.5A4.5 4.5 0 016.5 14 3.5 3.5 0 013 10.5V8.2a1 1 0 012 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />;
const ICONS: Record<CardKind, ReactNode> = {
  fits: <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  needs: <><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M8 5v3.2l2 1.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
  over: STOP_HAND,
  refused: STOP_HAND,
};

/** State chip: colour, icon and label, always all three (design system §2). */
export function Chip({ kind, label }: { kind: CardKind; label: string }) {
  return (
    <span className={`t-chip t-chip--${kind}`}>
      <svg viewBox="0 0 16 16" aria-hidden>{ICONS[kind]}</svg>{label}
    </span>
  );
}

const TILE_ICONS: Record<"open" | "ask" | "locked", ReactNode> = {
  open: ICONS.fits,
  ask: ICONS.needs,
  locked: <><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M5.5 7V5.2a2.5 2.5 0 015 0V7" fill="none" stroke="currentColor" strokeWidth="1.6" /></>,
};

/** A map tile's state chip: colour, icon and label (locked is muted, never alarming). */
export function TileChip({ kind, label }: { kind: "open" | "ask" | "locked"; label: string }) {
  return (
    <span className={`t-chip t-chip--${kind}`}>
      <svg viewBox="0 0 16 16" aria-hidden>{TILE_ICONS[kind]}</svg>{label}
    </span>
  );
}
