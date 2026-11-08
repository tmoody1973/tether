"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { NOTIFY_WORDS, notifyState, type NotifyEnv } from "@/ui/notifyState";

// OneSignal web SDK v16. Its push handling runs inside Tether's root worker (public/sw.js), which controls every page.
const SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
const LOAD_TIMEOUT_MS = 10_000;

/** The slice of the OneSignal page SDK this card uses. */
interface OneSignalApi {
  init(o: Record<string, unknown>): Promise<void>;
  login(externalId: string): Promise<void>;
  User: { PushSubscription: { optedIn?: boolean; optIn(): Promise<void> } };
}
type Deferred = { push(fn: (os: OneSignalApi) => void | Promise<void>): void };
declare global { interface Window { OneSignalDeferred?: Deferred | ((os: OneSignalApi) => void)[] } }

let ready: Promise<OneSignalApi> | null = null;

/** Loads and initialises the SDK once per page. It never prompts on its own: no bell, no slidedown, autoPrompt off. */
function loadOneSignal(appId: string): Promise<OneSignalApi> {
  ready ??= new Promise<OneSignalApi>((resolve, reject) => {
    // The first version registered OneSignal at /push/onesignal/: drop that registration (and its push subscription),
    // or a device opted in back then would get every push twice, the old copy unable to open the request.
    navigator.serviceWorker?.getRegistrations?.()
      .then((rs) => Promise.all(rs.filter((r) => r.scope.endsWith("/push/onesignal/")).map((r) => r.unregister())))
      .catch(() => {});
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (os) => {
      try {
        await os.init({
          appId,
          // Tether's own root worker hosts OneSignal (see public/sw.js), so a tapped push can navigate the open app.
          serviceWorkerPath: "sw.js",
          serviceWorkerParam: { scope: "/" },
          // Take whatever Tether window is open (an installed app has just one) and move it to the request.
          notificationClickHandlerMatch: "origin",
          notificationClickHandlerAction: "navigate",
          notifyButton: { enable: false },
          promptOptions: { slidedown: { prompts: [{ type: "push", autoPrompt: false }] } },
        });
        resolve(os);
      } catch (e) { reject(e); }
    });
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.defer = true;
    s.dataset.onesignal = "sdk";
    s.onerror = () => reject(new Error("OneSignal SDK failed to load"));
    document.head.appendChild(s);
  });
  // ponytail: a failed load stays failed until a reload; retrying would queue a second init.
  return Promise.race([ready, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("OneSignal SDK timed out")), LOAD_TIMEOUT_MS))]);
}

type Browser = Omit<NotifyEnv, "optedIn">;
let browser: Browser | null = null;
const noSubscribe = () => () => {};

/** What this browser can do, read once (a stable snapshot for useSyncExternalStore; the server has none). */
function readBrowser(): Browser {
  if (browser) return browser;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (browser = {
    supported: "Notification" in window && "serviceWorker" in navigator && "PushManager" in window,
    ios: /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1),
    standalone: window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
    permission: "Notification" in window ? Notification.permission : "default",
  });
}

/**
 * Home, invisible (review LOW-2): where notifications are already allowed and on, keeps this device on the parent's
 * current alias, as the card used to when it lived on Home. Never prompts; loads nothing unless permission was granted.
 */
export function PushAliasRefresh({ appId, alias }: { appId: string; alias: string }) {
  const b = useSyncExternalStore(noSubscribe, readBrowser, () => null);
  useEffect(() => {
    if (!b?.supported || b.permission !== "granted") return;
    loadOneSignal(appId).then(async (os) => {
      if (os.User.PushSubscription.optedIn === true) await os.login(alias);
    }).catch((err) => console.error("OneSignal unavailable", err));
  }, [b, appId, alias]);
  return null;
}

/** Settings' "get a buzz" card. `alias` is this family's opaque OneSignal external id, computed on the server. */
export function NotifyCard({ appId, alias, teenName }: { appId: string; alias: string; teenName: string }) {
  const b = useSyncExternalStore(noSubscribe, readBrowser, () => null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null); // after her tap
  const [optedIn, setOptedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const env: NotifyEnv | null = b && { ...b, permission: permission ?? b.permission, optedIn };

  useEffect(() => {
    // Already allowed earlier: load quietly (no prompt is possible) to show "on" and keep this device on the family alias.
    if (!b?.supported || b.permission !== "granted") return;
    loadOneSignal(appId).then(async (os) => {
      const on = os.User.PushSubscription.optedIn === true;
      if (on) await os.login(alias);
      setOptedIn(on);
    }).catch((err) => console.error("OneSignal unavailable", err));
  }, [b, appId, alias]);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      // The browser's own prompt first, straight from the tap (Safari only allows it inside the gesture).
      const answer = await Notification.requestPermission();
      setPermission(answer);
      if (answer !== "granted") return;
      const os = await loadOneSignal(appId);
      await os.login(alias); // before subscribing, so the subscription lands on the family's alias
      await os.User.PushSubscription.optIn();
      setOptedIn(true);
    } catch (err) {
      console.error("turning on notifications failed", err);
      setError("Couldn't turn notifications on. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  const state = env ? notifyState(env) : "off";
  return (
    <section className="g-card g-notify" aria-labelledby="notify-h">
      <div className="g-phonenote" role="img" aria-label={`Example notification: Tether, ${teenName} is asking for $25.30 at Best Buy`}>
        <span className="g-phonenote__icon" aria-hidden="true">
          <svg width="20" height="12" viewBox="0 0 30 18"><path d="M3 6c0 6 5 9 9 6s7-8 12-5" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" /></svg>
        </span>
        <span aria-hidden="true">
          <span className="g-phonenote__app"><span>TETHER</span><span>now</span></span>
          <span className="g-phonenote__title">{teenName} is asking for $25.30 at Best Buy</span>
          <span className="g-phonenote__body">Tap to decide.</span>
        </span>
      </div>
      <div className="g-notify__side">
        <h2 className="g-notify__h" id="notify-h">Get a buzz when {teenName} asks.</h2>
        <span className="g-muted">One notification per ask. Tapping it opens the request, so you can decide in one step.</span>
        {state === "off" ? (
          <button className="g-btn g-btn--small" type="button" onClick={turnOn} disabled={!env || busy} aria-busy={busy}>
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
        ) : state === "on" ? (
          <p className="g-notify__on" role="status">{NOTIFY_WORDS.on}</p>
        ) : (
          <p className="g-warntext" role="status">{NOTIFY_WORDS[state]}</p>
        )}
        {error && <p className="g-warntext" role="alert">{error}</p>}
      </div>
    </section>
  );
}
