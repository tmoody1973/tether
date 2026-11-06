import Image from "next/image";
import type { ReactNode } from "react";
import Link from "next/link";
import { formatCents } from "@/ui/grantWords";

export function Money({ cents }: { cents: number }) {
  return <span className="money">{formatCents(cents)}</span>;
}

export function Bar({ value, max, goal = false, label }: { value: number; max: number; goal?: boolean; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={goal ? "g-bar g-bar--goal" : "g-bar"} role="img" aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

const NAV = [
  { key: "home", href: "/g", label: "Zoe" },
  { key: "grant", href: "/g/grant", label: "Grant" },
  { key: "record", href: "/g/record", label: "Record" },
  { key: "review", href: "/g/review", label: "Review" },
  { key: "invest", href: "/g/invest", label: "Investing" },
] as const;

/** Sidebar + content at 1280; a top bar at 390. Rendered only for a signed-in guardian. */
export function GuardianShell({ active, teenName, side, children }: {
  active: (typeof NAV)[number]["key"] | null; teenName: string; side?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="g-app">
      <nav className="g-side" aria-label="Tether">
        <div className="g-brand"><Image className="g-brand__logo" src="/brand/tether-horizontal-color.svg" alt="Tether" width={106} height={32} priority /></div>
        <ul className="g-nav">
          {NAV.map((n) => (
            <li key={n.key}>
              <Link href={n.href} aria-current={n.key === active ? "page" : undefined}>{n.key === "home" ? teenName : n.label}</Link>
            </li>
          ))}
        </ul>
        {side}
      </nav>
      <main className="g-main">{children}</main>
    </div>
  );
}

/** The neutral page for anyone without Amara's cookie: no data, no navigation. */
export function SignedOut() {
  return (
    <div className="g-app">
      <main className="g-gate">
        <div className="g-card">
          <div className="g-brand" style={{ justifyContent: "center" }}><Image className="g-brand__logo" src="/brand/tether-horizontal-color.svg" alt="Tether" width={106} height={32} priority /></div>
          <p>Open your Tether link to continue.</p>
        </div>
      </main>
    </div>
  );
}

/** Static shell while the request-time part streams in. Never a spinner on a money number. */
export function GuardianLoading() {
  return <div className="g-app" aria-busy="true" />;
}
