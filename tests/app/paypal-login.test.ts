import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: async () => testDb }));
let testDb: import("@/db/client").Db;
// PayPal stand-in: "good" is the only code it accepts; userinfo answers with whoever `who` is.
let who: import("@/adapters/paypal/identity").PaypalIdentity;
const exchanged: string[] = [];
vi.mock("@/adapters/paypal/identity", async (orig) => ({
  ...(await orig<typeof import("@/adapters/paypal/identity")>()),
  identityFromEnv: (redirectUri: string) => ({
    authorizeUrl: (state: string) => `https://www.sandbox.paypal.com/connect?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    exchangeCode: async (code: string) => { exchanged.push(code); if (code !== "good") throw new Error("invalid_grant"); return "AT"; },
    userInfo: async () => who,
  }),
}));
vi.mock("@/adapters/paypal/vault", async (orig) => ({ ...(await orig<typeof import("@/adapters/paypal/vault")>()), deletePaymentToken: async () => undefined }));
import { createDb, migrateDb } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { eq } from "drizzle-orm";
import { GUARDIAN_COOKIE, verifyGuardianCookie } from "@/auth/guardian";
import { BROWSER_FAMILY_COOKIE, LOGIN_STATE_COOKIE, START_COOKIE, openBrowserFamily, openStart, sealBrowserFamily, sealStart } from "@/auth/start";
import { SANDBOX_LOGIN } from "@/ui/sandboxAccount";
import { GET as login } from "@/app/g/login/paypal/route";
import { GET as loginReturn } from "@/app/g/login/paypal/return/route";
import { POST as choose } from "@/app/g/login/choose/open/route";

process.env.TETHER_SIGNING_KEY = "test-key";
process.env.APP_BASE_URL = "https://tether-five-beta.vercel.app";
beforeAll(async () => { testDb = createDb("pglite:memory"); await migrateDb(testDb); });
beforeEach(() => { exchanged.length = 0; });

const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
const valueOf = (res: Response, name: string) => { const c = cookieOf(res, name); return c ? decodeURIComponent(c.split(";")[0].slice(name.length + 1)) : undefined; };
const where = (res: Response) => { const u = new URL(res.headers.get("location")!, "http://localhost"); return `${u.pathname}${u.search}`; };

/** Starts a login, then comes back from PayPal with `code` and the state PayPal echoed (or a forged one). */
async function roundTrip(code: string, opts: { state?: string; keepCookie?: boolean; browserFamily?: string } = {}) {
  const start = await login(new Request("http://localhost/g/login/paypal"));
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const jar = opts.keepCookie === false ? [] : [`${LOGIN_STATE_COOKIE}=${encodeURIComponent(valueOf(start, LOGIN_STATE_COOKIE)!)}`];
  if (opts.browserFamily) jar.push(`${BROWSER_FAMILY_COOKIE}=${encodeURIComponent(opts.browserFamily)}`);
  const cookie = jar.join("; ");
  return loginReturn(new Request(`http://localhost/g/login/paypal/return?code=${code}&state=${opts.state ?? state}`, { headers: { cookie } }));
}

const own = (sub: string, teenName: string, extra: Partial<repo.Family> = {}) =>
  repo.insertFamily(testDb, { name: `P & ${teenName}`, teenToken: `t-${sub}-${teenName}`, guardianName: "Amara", teenName, ...extra })
    .then(async (f) => { await testDb.update(t.families).set({ paypalSub: sub, ...extra }).where(eq(t.families.id, f.id)); return f; });

describe("GET /g/login/paypal", () => {
  it("redirects to PayPal with a fresh random state, kept in a short-lived HttpOnly cookie for the return page only", async () => {
    const a = await login(new Request("http://localhost/g/login/paypal"));
    const b = await login(new Request("http://localhost/g/login/paypal"));
    expect(a.status).toBe(303);
    const url = new URL(a.headers.get("location")!);
    expect(url.host).toBe("www.sandbox.paypal.com");
    expect(url.searchParams.get("redirect_uri")).toBe("https://tether-five-beta.vercel.app/g/login/paypal/return");
    const state = url.searchParams.get("state")!;
    expect(state.length).toBeGreaterThanOrEqual(32);
    expect(state).not.toBe(new URL(b.headers.get("location")!).searchParams.get("state"));
    const c = cookieOf(a, LOGIN_STATE_COOKIE)!;
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\/g\/login\/paypal/);
    expect(c).toMatch(/Max-Age=600/);
  });
});

describe("GET /g/login/paypal/return", () => {
  it("state that doesn't match this browser's ⇒ refused before any code exchange, no session", async () => {
    who = { sub: "S-any" };
    const res = await roundTrip("good", { state: "forged-state-forged-state-forged-state" });
    expect(where(res)).toBe("/g?login=failed");
    expect(cookieOf(res, GUARDIAN_COOKIE)).toBeUndefined();
    expect(exchanged).toEqual([]);
  });

  it("no state cookie (a link someone sent) ⇒ refused", async () => {
    const res = await roundTrip("good", { keepCookie: false });
    expect(where(res)).toBe("/g?login=failed");
    expect(exchanged).toEqual([]);
  });

  it("cancelled at PayPal ⇒ the calm cancelled page; a code PayPal refuses ⇒ failed", async () => {
    const res = await loginReturn(new Request("http://localhost/g/login/paypal/return?error=access_denied&state=x"));
    expect(where(res)).toBe("/g?login=cancelled");
    expect(where(await roundTrip("bad"))).toBe("/g?login=failed");
  });

  it("the state cookie is cleared on the way back, whatever happened", async () => {
    who = { sub: "S-clear" };
    expect(cookieOf(await roundTrip("good"), LOGIN_STATE_COOKIE)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it("no family for this PayPal ⇒ the teen form, carrying who they are in a signed starting cookie; not signed in", async () => {
    who = { sub: "S-new", givenName: "Amara", email: "amara@example.com", payerId: "P-NEW" };
    const res = await roundTrip("good");
    expect(where(res)).toBe("/g/start/teen");
    expect(cookieOf(res, GUARDIAN_COOKIE)).toBeUndefined();
    const c = cookieOf(res, START_COOKIE)!;
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/Path=\/g/);
    expect(openStart(valueOf(res, START_COOKIE)!, new Date())?.who).toEqual(who);
  });

  it("one family ⇒ signed in to it", async () => {
    const f = await own("S-one", "Zoe");
    who = { sub: "S-one", givenName: "Amara" };
    const res = await roundTrip("good");
    expect(where(res)).toBe("/g");
    expect(verifyGuardianCookie(valueOf(res, GUARDIAN_COOKIE)!, new Date())).toBe(f.id);
  });

  it("two families ⇒ the 'Which teen?' chooser; retired families don't count", async () => {
    await own("S-two", "Zoe");
    await own("S-two", "Kai");
    await own("S-two", "Old", { guardianToken: `${repo.ARCHIVED_PREFIX}x1` });
    who = { sub: "S-two" };
    const res = await roundTrip("good");
    expect(where(res)).toBe("/g/login/choose");
    expect(cookieOf(res, GUARDIAN_COOKIE)).toBeUndefined();
    expect(openStart(valueOf(res, START_COOKIE)!, new Date())?.who.sub).toBe("S-two");
  });
});

describe("L2: malformed input is the calm page, never a 500", () => {
  it("a state of the right length with multibyte characters, or a broken %-escape in the cookie ⇒ failed", async () => {
    const start = await login(new Request("http://localhost/g/login/paypal"));
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const cookie = `${LOGIN_STATE_COOKIE}=${encodeURIComponent(valueOf(start, LOGIN_STATE_COOKIE)!)}`;
    const wide = "é".repeat(state.length);
    expect(where(await loginReturn(new Request(`http://localhost/g/login/paypal/return?code=good&state=${encodeURIComponent(wide)}`, { headers: { cookie } })))).toBe("/g?login=failed");
    expect(where(await loginReturn(new Request(`http://localhost/g/login/paypal/return?code=good&state=${state}`, { headers: { cookie: `${LOGIN_STATE_COOKIE}=%E0%A4%A` } })))).toBe("/g?login=failed");
  });
});

describe("H1: the published shared sandbox login works per browser", () => {
  const SHARED = { sub: "S-shared", email: SANDBOX_LOGIN.email.toUpperCase(), givenName: "John", payerId: "P-SHARED" };

  it("a second browser with the shared login never reaches the first browser's family: it starts its own", async () => {
    const first = await own("S-shared", "Zoe", { paypalEmail: SANDBOX_LOGIN.email, paypalPayerId: "P-SHARED" });
    who = SHARED;
    const res = await roundTrip("good"); // a browser with no "family in this browser" cookie
    expect(where(res)).toBe("/g/start/teen");
    expect(cookieOf(res, GUARDIAN_COOKIE)).toBeUndefined();
    // even though this PayPal id owns exactly one family, which would sign in for anyone else
    const theirs = await roundTrip("good", { browserFamily: sealBrowserFamily(first.id, new Date()) });
    expect(verifyGuardianCookie(valueOf(theirs, GUARDIAN_COOKIE)!, new Date())).toBe(first.id);
  });

  it("never the chooser, however many families the shared login owns", async () => {
    await own("S-shared", "Kai", { paypalEmail: SANDBOX_LOGIN.email });
    who = SHARED;
    expect(where(await roundTrip("good"))).toBe("/g/start/teen");
  });

  it("the browser cookie only counts for a live family this PayPal owns: forged, someone else's or retired ⇒ teen form", async () => {
    const other = await own("S-other-owner", "Mia");
    const retired = await own("S-shared", "Old", { guardianToken: `${repo.ARCHIVED_PREFIX}r1` });
    who = SHARED;
    for (const browserFamily of [sealBrowserFamily(other.id, new Date()), sealBrowserFamily(retired.id, new Date()), "forged.1.x", `${other.id}`]) {
      const res = await roundTrip("good", { browserFamily });
      expect(where(res)).toBe("/g/start/teen");
      expect(cookieOf(res, GUARDIAN_COOKIE)).toBeUndefined();
    }
  });

  it("recognised by payer id when PayPal leaves the email out", async () => {
    await own("S-shared-2", "Zoe", { paypalEmail: SANDBOX_LOGIN.email, paypalPayerId: "P-SHARED-2" });
    who = { sub: "S-shared-2", payerId: "P-SHARED-2" }; // no email; owns exactly one family
    expect(where(await roundTrip("good"))).toBe("/g/start/teen");
  });

  it("any other PayPal account keeps today's flow: one family ⇒ signed in, with no browser cookie needed", async () => {
    const f = await own("S-ordinary", "Zoe", { paypalEmail: "parent@example.com" });
    who = { sub: "S-ordinary", email: "parent@example.com" };
    const res = await roundTrip("good");
    expect(verifyGuardianCookie(valueOf(res, GUARDIAN_COOKIE)!, new Date())).toBe(f.id);
  });

  it("the chooser refuses the shared login even for a family it owns", async () => {
    const mine = await own("S-shared", "Ana", { paypalEmail: SANDBOX_LOGIN.email });
    const res = await choose(new Request("http://localhost/g/login/choose/open", {
      method: "POST", body: new URLSearchParams({ familyId: mine.id }),
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: `${START_COOKIE}=${encodeURIComponent(sealStart(SHARED, new Date()))}` },
    }));
    expect(cookieOf(res, GUARDIAN_COOKIE)).toBeUndefined();
    expect(where(res)).toBe("/g?login=failed");
  });

  it("the browser cookie opens only for its own purpose", () => {
    const v = sealBrowserFamily("fam-1", new Date());
    expect(openBrowserFamily(v, new Date())).toBe("fam-1");
    expect(openBrowserFamily(sealStart({ sub: "x" }, new Date()), new Date())).toBeNull();
    expect(openBrowserFamily(v, new Date(Date.now() + 9 * 86_400_000))).toBeNull();
  });
});

describe("POST /g/login/choose/open", () => {
  const post = (familyId: string, sub: string | null, origin?: string) => {
    const body = new URLSearchParams({ familyId });
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
    if (sub) headers.cookie = `${START_COOKIE}=${encodeURIComponent(sealStart({ sub }, new Date()))}`;
    if (origin) headers.origin = origin;
    return choose(new Request("http://localhost/g/login/choose/open", { method: "POST", body, headers }));
  };

  it("signs in to the chosen family when this PayPal owns it", async () => {
    const zoe = await own("S-pick", "Zoe");
    await own("S-pick", "Kai");
    const res = await post(zoe.id, "S-pick");
    expect(where(res)).toBe("/g");
    expect(verifyGuardianCookie(valueOf(res, GUARDIAN_COOKIE)!, new Date())).toBe(zoe.id);
    expect(cookieOf(res, START_COOKIE)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it("someone else's family, no starting cookie, or a cross-site post ⇒ no session", async () => {
    const theirs = await own("S-theirs", "Mia");
    await own("S-mine", "Zoe");
    for (const res of [await post(theirs.id, "S-mine"), await post(theirs.id, null), await post(theirs.id, "S-theirs", "https://evil.example")]) {
      expect(cookieOf(res, GUARDIAN_COOKIE)).toBeUndefined();
      expect(where(res)).toMatch(/^\/g\?login=(failed|expired)$/);
    }
  });
});
