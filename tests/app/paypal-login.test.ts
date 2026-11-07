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
import { LOGIN_STATE_COOKIE, START_COOKIE, openStart, sealStart } from "@/auth/start";
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
async function roundTrip(code: string, opts: { state?: string; keepCookie?: boolean } = {}) {
  const start = await login(new Request("http://localhost/g/login/paypal"));
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const cookie = opts.keepCookie === false ? "" : `${LOGIN_STATE_COOKIE}=${encodeURIComponent(valueOf(start, LOGIN_STATE_COOKIE)!)}`;
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
    expect(openStart(valueOf(res, START_COOKIE)!, new Date())).toEqual(who);
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
    expect(openStart(valueOf(res, START_COOKIE)!, new Date())?.sub).toBe("S-two");
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
