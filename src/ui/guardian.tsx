import Image from "next/image";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { needsBadge } from "@/ui/activityWords";
import { PaypalLoginButton } from "@/ui/PaypalLogin";
import { TeenSwitcherSlot } from "@/ui/TeenSwitcherSlot";

// Money and Bar live in @/ui/money so client components (the assistant's answer cards) can use them too.
export { Bar, Money } from "@/ui/money";

const ICON = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

// Amara's jobs (house, sliders, piggy bank, trend line, receipt, cog), not Tether's internals. Six in the sidebar; the
// phone's tab bar has the first five, and Settings is a gear in the phone's top bar beside the teen switcher.
const COG = <svg {...ICON}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>;
const NAV = [
  { key: "home", href: "/g", label: "Home", short: "Home",
    icon: <svg {...ICON}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg> },
  { key: "rules", href: "/g/rules", label: "rules", short: "Rules",
    icon: <svg {...ICON}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg> },
  { key: "savings", href: "/g/savings", label: "Savings", short: "Savings",
    icon: <svg {...ICON}><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z" /><path d="M2 9v1c0 1.1.9 2 2 2h1" /><path d="M16 11h.01" /></svg> },
  { key: "invest", href: "/g/invest", label: "Investing", short: "Investing",
    icon: <svg {...ICON}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg> },
  { key: "activity", href: "/g/activity", label: "Activity", short: "Activity",
    icon: <svg {...ICON}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg> },
  { key: "settings", href: "/g/settings", label: "Settings", short: "Settings", icon: COG },
] as const;

export type GuardianTab = (typeof NAV)[number]["key"];

/**
 * Sidebar + content on desktop; at phone width a top bar (teen switcher, Settings gear) and a fixed bottom tab bar
 * (CSS swaps them). Rendered only for a signed-in guardian. `needs` = Home's count: the Home tab shows it. `familyId`
 * turns on the teen switcher (decision 028), which appears only when this session can switch teens.
 */
export function GuardianShell({ active, teenName, needs = 0, familyId, children }: {
  active: GuardianTab | null; teenName: string; needs?: number; familyId?: string; children: ReactNode;
}) {
  const badge = needsBadge(needs);
  const items = (phone: boolean) => NAV.filter((n) => !phone || n.key !== "settings").map((n) => (
    <Link key={n.key} href={n.href} aria-current={n.key === active ? "page" : undefined}>
      {n.icon}{phone ? n.short : n.key === "rules" ? `${teenName}'s rules` : n.label}
      {n.key === "home" && badge && <span className="g-badge">{badge}<span className="g-sr"> waiting</span></span>}
    </Link>
  ));
  // The slot keeps its height whether or not a switcher streams into it, so nothing below it moves.
  const switcher = (
    <div className="g-switcher-slot">
      {familyId && <Suspense fallback={null}><TeenSwitcherSlot familyId={familyId} active={active ?? "home"} /></Suspense>}
    </div>
  );
  return (
    <div className="g-app">
      <nav className="g-side" aria-label="Main">
        <div className="g-brand"><Image className="g-brand__logo" src="/brand/tether-horizontal-color.svg" alt="Tether" width={106} height={32} priority /></div>
        {switcher}
        <ul className="g-nav">{items(false).map((l) => <li key={l.key}>{l}</li>)}</ul>
      </nav>
      <main className="g-main">
        <div className="g-topbar">
          {switcher}
          <Link className="g-gear" href="/g/settings" aria-label="Settings" aria-current={active === "settings" ? "page" : undefined}>{COG}</Link>
        </div>
        {children}
      </main>
      <nav className="g-tabbar" aria-label="Main">{items(true)}</nav>
    </div>
  );
}

const LOGIN_TROUBLE: Record<string, string> = {
  failed: "PayPal didn't finish signing you in, so nothing changed.",
  cancelled: "You left PayPal before signing in. Nothing changed.",
  expired: "That took a while, so Tether lost track of who you are. Nothing was made.",
  used: "That sign-in was already used to start a family. Log in with PayPal again to open it or start another.",
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
