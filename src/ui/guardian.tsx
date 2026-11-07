import Image from "next/image";
import type { ReactNode } from "react";
import Link from "next/link";
import { needsBadge } from "@/ui/activityWords";
import { PaypalLoginButton } from "@/ui/PaypalLogin";

// Money and Bar live in @/ui/money so client components (the assistant's answer cards) can use them too.
export { Bar, Money } from "@/ui/money";

const ICON = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

// Amara's three jobs (house, sliders, receipt), not Tether's internals.
const NAV = [
  { key: "home", href: "/g", label: "Home", short: "Home",
    icon: <svg {...ICON}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg> },
  { key: "rules", href: "/g/rules", label: "rules", short: "Rules",
    icon: <svg {...ICON}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg> },
  { key: "activity", href: "/g/activity", label: "Activity", short: "Activity",
    icon: <svg {...ICON}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg> },
] as const;

export type GuardianTab = (typeof NAV)[number]["key"];

/**
 * Sidebar + content on desktop; a fixed bottom tab bar at phone width (CSS swaps them). Rendered only for a
 * signed-in guardian. `needs` = items in Needs you: the Home tab shows the count.
 */
export function GuardianShell({ active, teenName, needs = 0, children }: {
  active: GuardianTab | null; teenName: string; needs?: number; children: ReactNode;
}) {
  const badge = needsBadge(needs);
  const links = (phone: boolean) => NAV.map((n) => (
    <Link key={n.key} href={n.href} aria-current={n.key === active ? "page" : undefined}>
      {n.icon}{phone ? n.short : n.key === "rules" ? `${teenName}'s rules` : n.label}
      {n.key === "home" && badge && <span className="g-badge">{badge}<span className="g-sr"> waiting</span></span>}
    </Link>
  ));
  return (
    <div className="g-app">
      <nav className="g-side" aria-label="Main">
        <div className="g-brand"><Image className="g-brand__logo" src="/brand/tether-horizontal-color.svg" alt="Tether" width={106} height={32} priority /></div>
        <ul className="g-nav">{links(false).map((l) => <li key={l.key}>{l}</li>)}</ul>
      </nav>
      <main className="g-main">{children}</main>
      <nav className="g-tabbar" aria-label="Main">{links(true)}</nav>
    </div>
  );
}

const LOGIN_TROUBLE: Record<string, string> = {
  failed: "PayPal didn't finish signing you in, so nothing changed.",
  cancelled: "You left PayPal before signing in. Nothing changed.",
  expired: "That took a while, so Tether lost track of who you are. Nothing was made.",
};

/**
 * The neutral page for anyone without Amara's cookie: no data, no navigation. Offers Log in with PayPal (decision 026);
 * `login` is the outcome of a PayPal round trip that didn't sign her in.
 */
export function SignedOut({ login }: { login?: string } = {}) {
  const trouble = login ? LOGIN_TROUBLE[login] : undefined;
  return (
    <div className="g-app">
      <main className="g-gate">
        <div className="g-card">
          <div className="g-brand" style={{ justifyContent: "center" }}><Image className="g-brand__logo" src="/brand/tether-horizontal-color.svg" alt="Tether" width={106} height={32} priority /></div>
          <h1 className="g-title" style={{ fontSize: 24 }}>Welcome back</h1>
          {trouble && <p className="g-flash g-flash--warn" role="status" style={{ marginTop: 10 }}>{trouble} <a className="g-textlink" href="/g/login/paypal">Try again</a></p>}
          <p style={{ margin: "10px 0 16px" }}>Sign in with the PayPal you used to start your family.</p>
          <PaypalLoginButton />
          <p className="g-note" style={{ marginTop: 12 }}>PayPal confirms it&apos;s you. Tether never sees your PayPal password.</p>
          <p className="g-note" style={{ marginTop: 6 }}>Have a private Tether link? Open your Tether link to continue.</p>
          <p className="g-note" style={{ marginTop: 6 }}>Sandbox only; no real money moves.</p>
        </div>
      </main>
    </div>
  );
}

/** Static shell while the request-time part streams in. Never a spinner on a money number. */
export function GuardianLoading() {
  return <div className="g-app" aria-busy="true" />;
}
