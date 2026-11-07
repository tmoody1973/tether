import { PaypalError, REQUEST_TIMEOUT_MS, isE2eLocal } from "./http";

// Log in with PayPal (decision 026): the authorization-code flow with a confidential client. No PKCE and no id_token:
// PayPal documents neither for this product, so the code is exchanged server-side and identity comes from userinfo.

/** PayPal's sign-in page. Sandbox only: this build refuses live PayPal everywhere (see paypalFromEnv). */
export const SANDBOX_CONNECT_URL = "https://www.sandbox.paypal.com/connect";
const SANDBOX_API_HOST = "api-m.sandbox.paypal.com";
/** paypalattributes = "PayPal account ID (payer ID)" and "Account verification status" (PayPal's scope reference). */
export const LOGIN_SCOPE = "openid profile email https://uri.paypal.com/services/paypalattributes";
/**
 * UNVERIFIED (check in the live sandbox): PayPal's integrate guide names /v1/identity/oauth2/userinfo, its OpenAPI spec
 * names /v1/identity/openidconnect/userinfo, and older integrations pass ?schema=paypalv1.1, the schema that carries
 * payer_id and verified_account. If the sandbox answers 404 or leaves those out, change this one line.
 */
export const USERINFO_PATH = "/v1/identity/oauth2/userinfo?schema=paypalv1.1";

export interface IdentityConfig { baseUrl: string; connectUrl: string; clientId: string; secret: string; redirectUri: string }

/** Only these fields of PayPal's userinfo are ever kept. Address, phone, birthdate and the rest are dropped. */
export interface PaypalIdentity { sub: string; payerId?: string; givenName?: string; name?: string; email?: string; verified?: boolean }

export interface IdentityClient {
  authorizeUrl(state: string): string;
  /** The access token for this one login. Never stored, never logged. */
  exchangeCode(code: string): Promise<string>;
  userInfo(accessToken: string): Promise<PaypalIdentity>;
}

const CONTROL = /[\p{Cc}\s]+/gu;
/** PayPal ids are printable ASCII (user_id is a URL): no spaces, no control characters. */
const ID = /^[\x21-\x7E]{1,255}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(CONTROL, " ").trim();
  return s ? s.slice(0, max) : undefined;
}

/** Whitelists PayPal's (untrusted) userinfo reply. Throws if there's no usable identity id to key a family on. */
export function cleanIdentity(raw: unknown): PaypalIdentity {
  const r = (raw ?? {}) as Record<string, unknown>;
  // OIDC replies carry `sub`; the paypalv1.1 schema carries `user_id`. Whichever PayPal sends is the family's key.
  const sub = [r.sub, r.user_id].find((v): v is string => typeof v === "string" && ID.test(v));
  if (!sub) throw new PaypalError(0, "BAD_USERINFO", "no identity id in userinfo");
  const emails = Array.isArray(r.emails) ? (r.emails as { value?: unknown; primary?: unknown }[]) : [];
  const rawEmail = r.email ?? (emails.find((e) => e?.primary === true) ?? emails[0])?.value;
  const email = str(rawEmail, 254)?.toLowerCase();
  const v = r.verified_account;
  const verified = v === true || v === "true" ? true : v === false || v === "false" ? false : undefined;
  const who: PaypalIdentity = { sub };
  const payerId = str(r.payer_id, 64);
  const givenName = str(r.given_name, 40);
  const name = str(r.name, 80);
  if (payerId && /^[A-Za-z0-9_-]+$/.test(payerId)) who.payerId = payerId;
  if (givenName) who.givenName = givenName;
  if (name) who.name = name;
  if (email && EMAIL.test(email)) who.email = email;
  if (verified !== undefined) who.verified = verified;
  return who;
}

export function paypalIdentity(cfg: IdentityConfig, fetchImpl: typeof fetch = fetch): IdentityClient {
  async function call(path: string, init: RequestInit): Promise<unknown> {
    let res: Response;
    try {
      res = await fetchImpl(`${cfg.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new PaypalError(0, "NETWORK_ERROR", err instanceof Error ? err.name : "network failure");
    }
    const data = (await res.json().catch(() => undefined)) as Record<string, unknown> | undefined;
    if (!res.ok) {
      // PayPal's own error name only: the code, token and secret never reach a message or a log.
      const e = data ?? {};
      throw new PaypalError(res.status, String(e.name ?? e.error ?? "HTTP_ERROR"), String(e.error_description ?? e.message ?? res.statusText ?? "request failed").slice(0, 120));
    }
    return data;
  }

  return {
    authorizeUrl(state) {
      const u = new URL(cfg.connectUrl);
      u.search = new URLSearchParams({
        flowEntry: "static", client_id: cfg.clientId, response_type: "code", scope: LOGIN_SCOPE, redirect_uri: cfg.redirectUri, state,
      }).toString();
      return u.toString();
    },
    async exchangeCode(code) {
      const basic = Buffer.from(`${cfg.clientId}:${cfg.secret}`).toString("base64");
      const data = (await call("/v1/oauth2/token", {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code }).toString(),
      })) as { access_token?: unknown } | undefined;
      if (typeof data?.access_token !== "string" || !data.access_token) throw new PaypalError(0, "BAD_OAUTH_RESPONSE", "no access_token in response");
      return data.access_token;
    },
    async userInfo(accessToken) {
      return cleanIdentity(await call(USERINFO_PATH, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } }));
    },
  };
}

/** From env, like paypalFromEnv: the sandbox over https, or the e2e suite's local fake (which serves its own /connect). */
export function identityFromEnv(redirectUri: string, env: NodeJS.ProcessEnv = process.env): IdentityClient {
  const { PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: secret } = env;
  if (!clientId || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");
  const baseUrl = env.PAYPAL_BASE_URL || `https://${SANDBOX_API_HOST}`;
  const url = new URL(baseUrl);
  if (url.protocol === "https:" && url.hostname === SANDBOX_API_HOST) {
    return paypalIdentity({ baseUrl, connectUrl: SANDBOX_CONNECT_URL, clientId, secret, redirectUri });
  }
  if (isE2eLocal(url, env)) return paypalIdentity({ baseUrl, connectUrl: `${baseUrl}/connect`, clientId, secret, redirectUri });
  throw new Error("PAYPAL_BASE_URL must be the PayPal sandbox");
}
