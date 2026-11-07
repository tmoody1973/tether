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

/** Who PayPal said they are, between the PayPal return and the teen form (or the "Which teen?" chooser). */
export const START_COOKIE = "tether_start";
const START_MS = 30 * 60_000;
export const startCookieOptions = () => opts("/g", START_MS / 1000);
// Sealed in PayPal's own field names so opening it runs the same whitelist (cleanIdentity) as the userinfo reply did.
export const sealStart = (who: PaypalIdentity, now: Date) => sealValue("start", JSON.stringify({
  sub: who.sub, payer_id: who.payerId, given_name: who.givenName, name: who.name, email: who.email, verified_account: who.verified,
}), now, START_MS);
export function openStart(value: string | null | undefined, now: Date): PaypalIdentity | null {
  const json = value ? safely(() => openValue("start", value, now)) : null;
  if (!json) return null;
  try { return cleanIdentity(JSON.parse(json) as unknown); } catch { return null; }
}

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
