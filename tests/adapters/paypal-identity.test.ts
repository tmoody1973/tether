import { describe, expect, it } from "vitest";
import { PaypalError } from "@/adapters/paypal/http";
import { LOGIN_SCOPE, SANDBOX_CONNECT_URL, USERINFO_PATH, cleanIdentity, identityFromEnv, paypalIdentity } from "@/adapters/paypal/identity";

const RETURN = "https://tether-five-beta.vercel.app/g/login/paypal/return";
const cfg = { baseUrl: "https://api-m.sandbox.paypal.com", connectUrl: SANDBOX_CONNECT_URL, clientId: "cid", secret: "sec", redirectUri: RETURN };

type Call = { url: string; init: RequestInit };
function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fn };
}

describe("Log in with PayPal adapter", () => {
  it("authorize URL: sandbox /connect, flowEntry=static, code flow, the four scopes, URL-encoded redirect, the state", () => {
    const raw = paypalIdentity(cfg).authorizeUrl("st4te-xyz");
    const u = new URL(raw);
    expect(`${u.origin}${u.pathname}`).toBe("https://www.sandbox.paypal.com/connect");
    expect(u.searchParams.get("flowEntry")).toBe("static");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("scope")).toBe(LOGIN_SCOPE);
    expect(LOGIN_SCOPE).toBe("openid profile email https://uri.paypal.com/services/paypalattributes");
    expect(u.searchParams.get("redirect_uri")).toBe(RETURN);
    expect(u.searchParams.get("state")).toBe("st4te-xyz");
    expect(raw).toContain("redirect_uri=https%3A%2F%2Ftether-five-beta.vercel.app%2Fg%2Flogin%2Fpaypal%2Freturn");
    expect(raw).not.toContain("sec"); // the secret never goes to the browser
  });

  it("exchangeCode: POSTs the token endpoint with Basic auth and the authorization_code grant; returns the access token", async () => {
    const f = fakeFetch(200, { access_token: "AT-1", token_type: "Bearer", expires_in: 28800, refresh_token: "RT" });
    expect(await paypalIdentity(cfg, f.fn).exchangeCode("c0de+/=")).toBe("AT-1");
    expect(f.calls).toHaveLength(1);
    const { url, init } = f.calls[0];
    expect(url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("cid:sec").toString("base64")}`);
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("c0de+/=");
  });

  it("exchangeCode: a refused code is a PaypalError whose message carries neither the secret nor the code", async () => {
    const f = fakeFetch(400, { error: "invalid_grant", error_description: "Invalid authorization code" });
    const err = await paypalIdentity(cfg, f.fn).exchangeCode("secret-code-123").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaypalError);
    expect(String((err as Error).message)).not.toMatch(/secret-code-123|sec\b/);
  });

  it("exchangeCode: a 200 without an access token is refused", async () => {
    const f = fakeFetch(200, { token_type: "Bearer" });
    await expect(paypalIdentity(cfg, f.fn).exchangeCode("c")).rejects.toThrow(PaypalError);
  });

  it("userInfo: GETs the one userinfo path with the Bearer token and keeps only whitelisted fields", async () => {
    expect(USERINFO_PATH).toMatch(/^\/v1\/identity\//);
    const f = fakeFetch(200, {
      user_id: "https://www.paypal.com/webapps/auth/identity/user/AbC123", name: "Amara Okafor", given_name: "Amara",
      family_name: "Okafor", payer_id: "PAYER123", verified_account: "true",
      emails: [{ value: "old@example.com", primary: false }, { value: "Amara@Example.com", primary: true, confirmed: true }],
      address: { street_address: "1 Main St" }, birthdate: "1980-01-01", phone_number: "555", age_range: "36-45",
    });
    const who = await paypalIdentity(cfg, f.fn).userInfo("AT-1");
    expect(f.calls[0].url).toBe(`https://api-m.sandbox.paypal.com${USERINFO_PATH}`);
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer AT-1");
    expect(who).toEqual({
      sub: "https://www.paypal.com/webapps/auth/identity/user/AbC123", payerId: "PAYER123", givenName: "Amara",
      name: "Amara Okafor", email: "amara@example.com", verified: true,
    });
  });
});

describe("cleanIdentity (untrusted userinfo)", () => {
  it("OIDC shape: sub, email, email_verified-style boolean verified_account", () => {
    expect(cleanIdentity({ sub: "S1", email: "a@b.co", verified_account: false, given_name: "Ana" }))
      .toEqual({ sub: "S1", email: "a@b.co", verified: false, givenName: "Ana" });
  });

  it("no identity id ⇒ throws: nothing to key the family on", () => {
    expect(() => cleanIdentity({ name: "Amara" })).toThrow();
    expect(() => cleanIdentity(null)).toThrow();
    expect(() => cleanIdentity({ sub: "x".repeat(300) })).toThrow();
  });

  it("drops junk: wrong types, a bad email, control characters; caps a long name", () => {
    const who = cleanIdentity({ sub: "S2", given_name: "Ama\u0000ra\n", name: 42, email: "not an email", payer_id: { x: 1 }, verified_account: "maybe" });
    expect(who).toEqual({ sub: "S2", givenName: "Ama ra" });
    expect(cleanIdentity({ sub: "S3", given_name: "A".repeat(200) }).givenName).toHaveLength(40);
  });
});

describe("identityFromEnv", () => {
  const env = (base: string, extra: Record<string, string> = {}) =>
    ({ PAYPAL_CLIENT_ID: "cid", PAYPAL_CLIENT_SECRET: "sec", PAYPAL_BASE_URL: base, NODE_ENV: "test", ...extra }) as unknown as NodeJS.ProcessEnv;

  it("sandbox ⇒ the sandbox /connect page", () => {
    expect(identityFromEnv(RETURN, env("https://api-m.sandbox.paypal.com")).authorizeUrl("s")).toMatch(/^https:\/\/www\.sandbox\.paypal\.com\/connect\?/);
  });

  it("refuses live PayPal and anything else", () => {
    expect(() => identityFromEnv(RETURN, env("https://api-m.paypal.com"))).toThrow();
    expect(() => identityFromEnv(RETURN, env("http://localhost:3101"))).toThrow();
  });

  it("the e2e fake (TETHER_E2E=1, not production) gets its own /connect", () => {
    expect(identityFromEnv(RETURN, env("http://localhost:3101", { TETHER_E2E: "1" })).authorizeUrl("s")).toMatch(/^http:\/\/localhost:3101\/connect\?/);
  });
});
