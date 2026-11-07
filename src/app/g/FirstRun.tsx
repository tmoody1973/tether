import Link from "next/link";
import type { FirstRunStep } from "@/flows/home";
import "@/ui/start.css";

/**
 * Home's first-run checklist for a family started with PayPal (mockup 03a/03b), in place of "Needs you" while a step
 * is open. Only the first open step gets the filled button. New screens use the teen's name, never "her" or "his".
 */
export function FirstRun({ steps, teen, rulesLine }: { steps: FirstRunStep[]; teen: string; rulesLine: string }) {
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done)?.key;
  const btn = (key: FirstRunStep["key"]) => (key === next ? "g-btn g-btn--small" : "g-btn g-btn--ghost g-btn--small");
  const row = {
    paypal: {
      title: steps[0].done ? "PayPal saved" : "Save your PayPal",
      sub: `Sandbox. Tether charges it only for purchases that pass ${teen}'s rules.`,
      // A plain <a>: this starts a PayPal redirect and must never be prefetched.
      action: <a className={btn("paypal")} href="/g/connect-paypal">Save your PayPal</a>,
    },
    rules: { title: `Sign ${teen}'s first rules`, sub: rulesLine, action: <Link className={btn("rules")} href="/g/rules">Sign the rules</Link> },
    link: {
      title: `Send ${teen} the link`, sub: `Opening it is how ${teen} gets in. No app, no password.`,
      action: <Link className={btn("link")} href="/g/send-link">Send the link</Link>,
    },
  };
  return (
    <section className="g-card g-home__needs" aria-labelledby="first-h">
      <div className="s-headrow">
        <h2 className="g-label" id="first-h">Get {teen} started</h2>
        <span className="s-count">{done} of 3 done</span>
      </div>
      <ol className="s-steps">
        {steps.map((s, i) => (
          <li key={s.key} className={s.done ? "s-done" : undefined}>
            <span className="s-num" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
            <span><b>{row[s.key].title}</b><small>{row[s.key].sub}</small><span className="g-sr">{s.done ? " Done." : ""}</span></span>
            {s.done ? <span /> : row[s.key].action}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "Your way back in" for a family started with PayPal: no private link to bookmark, just the same PayPal. */
export function WayBackIn() {
  return (
    <section className="g-card" aria-labelledby="back-h">
      <h2 className="g-label" id="back-h">Your way back in</h2>
      <p><b>Next time, Log in with PayPal.</b></p>
      <p className="g-note" style={{ marginTop: 6 }}>Use the same PayPal you logged in with today. PayPal confirms it&apos;s you; Tether never sees your PayPal password.</p>
    </section>
  );
}
