import { randomBytes } from "node:crypto";
import { openValue, sealValue } from "@/auth/guardian";
import { cleanIdentity, type PaypalIdentity } from "@/adapters/paypal/identity";

// Cookies for "Start your own family" (decision 026). All HttpOnly, SameSite=Lax (PayPal's redirect back is a top-level
// GET), Secure in production, signed with the guardian HMAC key under their own kind, each scoped to the paths that read it.

const secure = () => process.env.NODE_ENV === "production";
const opts = (path: string, maxAgeS: number) => ({ httpOnly: true, sameSite: "lax" as const, path, secure: secure(), maxAge: maxAgeS });

/** The OAuth state for one Log in with PayPal round trip. */
export const LOGIN_STATE_COOKIE = "tether_login";
const LOGIN_STATE_MS = 10 * 60_000;
export const loginStateCookieOptions = () => opts("/g/login/paypal", LOGIN_STATE_MS / 1000);
export const sealLoginState = (state: string, now: Date) => sealValue("login-state", state, now, LOGIN_STATE_MS);
export const openLoginState = (value: string | null, now: Date) => (value ? safely(() => openValue("login-state", value, now)) : null);

/**
 * Who PayPal said they are, between the PayPal return and the teen form (or the "Which teen?" chooser), plus a one-time
 * nonce: the server records it when the family is made, so one starting cookie makes at most one family (M1).
 */
export const START_COOKIE = "tether_start";
const START_MS = 30 * 60_000;
export const startCookieOptions = () => opts("/g", START_MS / 1000);
export type StartTicket = { who: PaypalIdentity; nonce: string };
const NONCE = /^[A-Za-z0-9_-]{16,64}$/;
// Sealed in PayPal's own field names so opening it runs the same whitelist (cleanIdentity) as the userinfo reply did.
export const sealStart = (who: PaypalIdentity, now: Date, nonce: string = randomBytes(18).toString("base64url")) => sealValue("start", JSON.stringify({
  sub: who.sub, payer_id: who.payerId, given_name: who.givenName, name: who.name, email: who.email, verified_account: who.verified, nonce,
}), now, START_MS);
export function openStart(value: string | null | undefined, now: Date): StartTicket | null {
  const json = value ? safely(() => openValue("start", value, now)) : null;
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as { nonce?: unknown };
    if (typeof raw.nonce !== "string" || !NONCE.test(raw.nonce)) return null;
    return { who: cleanIdentity(raw), nonce: raw.nonce };
  } catch { return null; }
}

/**
 * "The family in this browser" (decision 026, review H1): set when this browser makes a family. For the shared sandbox
 * login it is the ONLY way back into a family, so judges sharing one PayPal test account each keep their own.
 * Lasts a day past the 7-day retirement.
 */
export const BROWSER_FAMILY_COOKIE = "tether_family";
const BROWSER_FAMILY_MS = 8 * 86_400_000;
export const browserFamilyCookieOptions = () => opts("/g", BROWSER_FAMILY_MS / 1000);
export const sealBrowserFamily = (familyId: string, now: Date) => sealValue("browser-family", familyId, now, BROWSER_FAMILY_MS);
export const openBrowserFamily = (value: string | null | undefined, now: Date) => (value ? safely(() => openValue("browser-family", value, now)) : null);

/** This browser started a family: one per browser per hour (public-demo limit). */
export const STARTED_COOKIE = "tether_started";
const STARTED_MS = 60 * 60_000;
export const startedCookieOptions = () => opts("/g/start", STARTED_MS / 1000);
export const sealStarted = (now: Date) => sealValue("started", "1", now, STARTED_MS);
export const openStarted = (value: string | null | undefined, now: Date) => (value ? safely(() => openValue("started", value, now)) === "1" : false);

/** A missing signing key or a malformed cookie reads as "no cookie", never as a 500 or as valid. */
function safely(open: () => string | null): string | null {
  try { return open(); } catch { return null; }
}
