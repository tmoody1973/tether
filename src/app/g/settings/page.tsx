import { Suspense } from "react";
import { cookies } from "next/headers";
import { pushAlias } from "@/auth/guardian";
import { guardianFamilyId } from "@/auth/guardianSession";
import { BROWSER_FAMILY_COOKIE, PAYPAL_WHO_COOKIE, openBrowserFamilies, openPaypalWho } from "@/auth/start";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import { guardianHome } from "@/flows/home";
import { settingsTeens } from "@/flows/start";
import { GuardianLoading, GuardianShell, SignedOut } from "@/ui/guardian";
import { appBaseUrl } from "../connect-paypal/setup";
import { NotifyCard } from "../NotifyCard";
import { ResetDemo } from "../ResetDemo";
import { ResetLink } from "../ResetLink";
import { TeenLink } from "../TeenLink";

// Settings (decision 028): her teens and switching between them, the current teen's link, notifications, PayPal, and
// Reset demo for the shared demo family. Signed-in guardian only.
export default function SettingsPage({ searchParams }: PageProps<"/g/settings">) {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <Settings searchParams={searchParams} />
    </Suspense>
  );
}

function flash(sp: Record<string, string | string[] | undefined>): { text: string; warn?: boolean } | null {
  if (sp.link === "reset") return { text: "The old link has stopped working. Send the new one." };
  if (sp.switch === "failed") return { text: "That teen can't be opened from here, so nothing changed. Log in with PayPal and try again.", warn: true };
  return null;
}

async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const familyId = await guardianFamilyId(); // reads the clock, so the cookie reads below are request time too
  if (!familyId) return <SignedOut />;
  const db = await getDb();
  const jar = await cookies();
  const now = new Date();
  const h = await guardianHome(db, familyId, await clockNow(db, familyId));
  const teen = h.teenName;
  const { viaPaypal, teens } = await settingsTeens(db, { id: familyId, teenName: teen },
    openPaypalWho(jar.get(PAYPAL_WHO_COOKIE)?.value, now), openBrowserFamilies(jar.get(BROWSER_FAMILY_COOKIE)?.value, now));
  const note = flash(await searchParams);
  const open = h.firstRun?.filter((s) => !s.done).length ?? 0;
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

  return (
    <GuardianShell active="settings" teenName={teen} needs={open > 0 ? open : h.needsYou.length}>
      <h1 className="g-title">Settings</h1>
      {note && <p className={note.warn ? "g-flash g-flash--warn" : "g-flash"} role="status">{note.text}</p>}

      <div className="g-two">
        <div className="g-stack">
          <section className="g-card" aria-labelledby="teens-h">
            <h2 className="g-label" id="teens-h">Your teens</h2>
            <ul className="g-rows g-teens">
              {teens.map((f) => (
                <li key={f.id}>
                  <b>{f.teenName}</b>
                  {f.current ? <span className="g-chip g-chip--accent">Open now</span> : (
                    <form method="post" action="/g/settings/switch">
                      <input type="hidden" name="familyId" value={f.id} />
                      <button type="submit" className="g-btn g-btn--ghost g-btn--small">Switch to {f.teenName}</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {viaPaypal ? (
              <>
                {/* A plain <a>: this starts a PayPal redirect and must never be prefetched. */}
                <a className="g-btn g-btn--block" href="/g/login/paypal?add=1" style={{ marginTop: 12 }}>Add another teen</a>
                <p className="g-note" style={{ marginTop: 8 }}>
                  You log in with PayPal again to confirm it&apos;s you. Each teen gets their own rules, budget, record, investing
                  and link, and you save your PayPal once for each teen.
                </p>
              </>
            ) : (
              <p className="g-note" style={{ marginTop: 10 }}>
                <a className="g-textlink" href="/g/login/paypal">Log in with PayPal</a> to see or add your other teens.
              </p>
            )}
          </section>

          <section className="g-card" aria-labelledby="link-h">
            <h2 className="g-label" id="link-h" style={{ display: "block", marginBottom: 8 }}>{teen}&apos;s way in</h2>
            <TeenLink url={`${appBaseUrl()}/t/${h.teenToken}`} teenName={teen} />
            <ResetLink teenName={teen} />
          </section>
        </div>

        <div className="g-stack">
          {/* Push is on only where OneSignal is set up; the alias is this family's opaque external id, never its raw id. */}
          {appId && <NotifyCard appId={appId} alias={pushAlias(familyId)} teenName={teen} />}

          <section className="g-card" aria-labelledby="paypal-h">
            <h2 className="g-label" id="paypal-h">PayPal</h2>
            {h.paypalSaved ? (
              <p style={{ marginTop: 6 }}>Saved for {teen}. Tether charges it only for purchases that pass {teen}&apos;s rules.</p>
            ) : (
              <>
                <p style={{ marginTop: 6 }}>Not saved for {teen} yet. Tether can&apos;t pay for anything {teen} buys until it is.</p>
                {/* A plain <a>: this starts a PayPal redirect and must never be prefetched. */}
                <a className="g-btn g-btn--block" href="/g/connect-paypal" style={{ marginTop: 10 }}>Save your PayPal</a>
              </>
            )}
            <p className="g-note" style={{ marginTop: 8 }}>Sandbox only; no real money moves.</p>
          </section>

          {h.isDemo && (
            <section className="g-card" aria-labelledby="demo-h">
              <h2 className="g-label" id="demo-h">Shared demo</h2>
              <p className="g-note" style={{ marginTop: 6 }}>Puts the demo family back as it was set up, for the next person.</p>
              <ResetDemo />
            </section>
          )}
        </div>
      </div>
    </GuardianShell>
  );
}
