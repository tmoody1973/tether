import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: async () => testDb }));
let testDb: import("@/db/client").Db;
// PayPal stand-in: "good" is the only code; userinfo answers with whoever `who` is.
let who: import("@/adapters/paypal/identity").PaypalIdentity;
vi.mock("@/adapters/paypal/identity", async (orig) => ({
  ...(await orig<typeof import("@/adapters/paypal/identity")>()),
  identityFromEnv: () => ({
    authorizeUrl: (state: string) => `https://www.sandbox.paypal.com/connect?state=${state}`,
    exchangeCode: async (code: string) => { if (code !== "good") throw new Error("invalid_grant"); return "AT"; },
    userInfo: async () => who,
  }),
}));
vi.mock("@/adapters/paypal/vault", async (orig) => ({ ...(await orig<typeof import("@/adapters/paypal/vault")>()), deletePaymentToken: async () => undefined }));
import { eq } from "drizzle-orm";
import { createDb, migrateDb } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { GUARDIAN_COOKIE, signGuardianCookie, verifyGuardianCookie } from "@/auth/guardian";
import {
  BROWSER_FAMILY_COOKIE, LOGIN_STATE_COOKIE, sealStart, PAYPAL_WHO_COOKIE, START_COOKIE, STARTED_COOKIE, openBrowserFamilies, openLoginState,
  openPaypalWho, openStart, sealBrowserFamilies, sealLoginState, sealPaypalWho, sealStarted, type PaypalWho,
} from "@/auth/start";
import { NEW_FAMILIES_PER_DAY, parseTeensForm, settingsTeens } from "@/flows/start";
import { requestElsewhere, switcherTeens } from "@/flows/home";
import { NEW_TEENS_PER_ACCOUNT_PER_DAY, isSharedLogin, retireStaleFamilies, startProblem, RETIRE_AFTER_MS } from "@/flows/start";
import { pushAliasFor } from "@/flows/notify";
import { parentPushAlias, pushAlias } from "@/auth/guardian";
import { SANDBOX_LOGIN } from "@/ui/sandboxAccount";
import { GET as login } from "@/app/g/login/paypal/route";
import { GET as loginReturn } from "@/app/g/login/paypal/return/route";
import { POST as create } from "@/app/g/start/teen/create/route";
import { POST as switchTeen } from "@/app/g/settings/switch/route";

process.env.TETHER_SIGNING_KEY = "test-key";
process.env.APP_BASE_URL = "https://tether-five-beta.vercel.app";
beforeAll(async () => { testDb = createDb("pglite:memory"); await migrateDb(testDb); });

const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
const valueOf = (res: Response, name: string) => { const c = cookieOf(res, name); return c ? decodeURIComponent(c.split(";")[0].slice(name.length + 1)) : undefined; };
const where = (res: Response) => { const u = new URL(res.headers.get("location")!, "http://localhost"); return `${u.pathname}${u.search}`; };
const jar = (c: Record<string, string | undefined>) => Object.entries(c).flatMap(([k, v]) => (v ? [`${k}=${encodeURIComponent(v)}`] : [])).join("; ");
const signedInTo = (res: Response) => { const v = valueOf(res, GUARDIAN_COOKIE); return v ? verifyGuardianCookie(v, new Date()) : null; };

let n = 0;
const own = async (sub: string | null, teenName: string, opts: { retired?: boolean } = {}) => {
  const f = await repo.insertFamily(testDb, { name: `P & ${teenName}`, teenToken: `t-${++n}-${teenName}`, guardianName: "Amara", teenName });
  await testDb.update(t.families).set({
    paypalSub: sub, ...(opts.retired ? { guardianToken: `${repo.ARCHIVED_PREFIX}${n}` } : {}),
  }).where(eq(t.families.id, f.id));
  return f;
};

/** Log in with PayPal end to end: step 1 (optionally `?add=1`), then PayPal's return carrying that browser's state cookie. */
async function roundTrip(opts: { add?: boolean; returnQuery?: string; stateCookie?: (v: string) => string; browser?: string } = {}) {
  const start = await login(new Request(`http://localhost/g/login/paypal${opts.add ? "?add=1" : ""}`));
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const sealed = valueOf(start, LOGIN_STATE_COOKIE)!;
  const cookie = jar({ [LOGIN_STATE_COOKIE]: opts.stateCookie ? opts.stateCookie(sealed) : sealed, [BROWSER_FAMILY_COOKIE]: opts.browser });
  return loginReturn(new Request(`http://localhost/g/login/paypal/return?code=good&state=${state}${opts.returnQuery ?? ""}`, { headers: { cookie } }));
}

function createPost(start: string, extra: Record<string, string | undefined> = {}) {
  return create(new Request("http://localhost/g/start/teen/create", {
    method: "POST", body: new URLSearchParams({ teenName: "Kofi", age: "14", guardian: "on" }),
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar({ [START_COOKIE]: start, ...extra }) },
  }));
}

function switchPost(target: string, c: { current?: string; who?: PaypalWho; browser?: string[]; origin?: string; to?: string }) {
  const now = new Date();
  return switchTeen(new Request("http://localhost/g/settings/switch", {
    method: "POST", body: new URLSearchParams({ familyId: target, ...(c.to ? { to: c.to } : {}) }),
    headers: {
      "content-type": "application/x-www-form-urlencoded", ...(c.origin ? { origin: c.origin } : {}),
      cookie: jar({
        [GUARDIAN_COOKIE]: c.current ? signGuardianCookie(c.current, now) : undefined,
        [PAYPAL_WHO_COOKIE]: c.who ? sealPaypalWho(c.who, now) : undefined,
        [BROWSER_FAMILY_COOKIE]: c.browser ? sealBrowserFamilies(c.browser, now) : undefined,
      }),
    },
  }));
}

describe("Add another teen: the intent rides inside the sealed login state", () => {
  it("survives the PayPal round trip: a parent who already has a teen goes to the teen form, not into that family", async () => {
    who = { sub: "S-add-1", givenName: "Amara", email: "amara1@example.com" };
    const zoe = await own("S-add-1", "Zoe");
    const res = await roundTrip({ add: true });
    expect(where(res)).toBe("/g/start/teen");
    expect(signedInTo(res)).toBeNull();
    expect(openStart(valueOf(res, START_COOKIE), new Date())).toMatchObject({ who: { sub: "S-add-1" }, add: true });
    expect(openPaypalWho(valueOf(res, PAYPAL_WHO_COOKIE), new Date())).toEqual({ sub: "S-add-1", shared: false });

    // The teen form makes a second family, even inside the one-per-browser-hour window, and signs her in to it.
    const browser = sealBrowserFamilies([zoe.id], new Date());
    const made = await createPost(valueOf(res, START_COOKIE)!, { [STARTED_COOKIE]: sealStarted(new Date()), [BROWSER_FAMILY_COOKIE]: browser });
    expect(where(made)).toBe("/g?started=added");
    const kofi = signedInTo(made)!;
    expect(kofi).not.toBe(zoe.id);
    expect(await repo.getFamily(testDb, kofi)).toMatchObject({ teenName: "Kofi", paypalSub: "S-add-1" });
    expect(await repo.getVault(testDb, kofi)).toBeNull(); // her own saved PayPal, never Zoe's
    expect(openBrowserFamilies(valueOf(made, BROWSER_FAMILY_COOKIE), new Date())).toEqual([zoe.id, kofi]);
  });

  it("re-review LOW-3: on the shared login, adding a teen keeps the hourly per-browser limit (no per-account cap there)", async () => {
    const judge = { sub: "S-add-shared-hour", email: SANDBOX_LOGIN.email };
    const blocked = await createPost(sealStart(judge, new Date(), undefined, true), { [STARTED_COOKIE]: sealStarted(new Date()) });
    expect(where(blocked)).toBe("/g/start/teen?e=browser");
    expect(signedInTo(blocked)).toBeNull();
    // An ordinary PayPal adding a teen within the hour goes through (it has its own 5-a-day cap).
    const parent = { sub: "S-add-ordinary-hour", email: "hour@example.com" };
    const made = await createPost(sealStart(parent, new Date(), undefined, true), { [STARTED_COOKIE]: sealStarted(new Date()) });
    expect(where(made)).toBe("/g?started=added");
  });

  it("without the add intent, the hourly per-browser limit still holds", async () => {
    who = { sub: "S-add-2", email: "amara2@example.com" };
    const res = await roundTrip();
    expect(where(res)).toBe("/g/start/teen");
    expect(openStart(valueOf(res, START_COOKIE), new Date())?.add).toBe(false);
    const made = await createPost(valueOf(res, START_COOKIE)!, { [STARTED_COOKIE]: sealStarted(new Date()) });
    expect(where(made)).toBe("/g/start/teen?e=browser");
  });

  it("is ignored when it only appears on the return URL: one family ⇒ signed straight in", async () => {
    who = { sub: "S-add-3", email: "amara3@example.com" };
    const zoe = await own("S-add-3", "Zoe");
    const res = await roundTrip({ returnQuery: "&add=1&intent=add" });
    expect(where(res)).toBe("/g");
    expect(signedInTo(res)).toBe(zoe.id);
  });

  it("a tampered state cookie fails the whole login, add or not", async () => {
    who = { sub: "S-add-4", email: "amara4@example.com" };
    const flip = (v: string) => { const [d, e, s] = v.split("."); return `${Buffer.from(`add:${Buffer.from(d, "base64url")}`).toString("base64url")}.${e}.${s}`; };
    const res = await roundTrip({ stateCookie: flip });
    expect(where(res)).toBe("/g?login=failed");
    expect(signedInTo(res)).toBeNull();
    expect(cookieOf(res, START_COOKIE)).toBeUndefined();
  });

  it("the sealed state opens to the same state and intent; a plain one has no intent", () => {
    const now = new Date();
    expect(openLoginState(sealLoginState("abc_DEF-1", now, "add"), now)).toEqual({ state: "abc_DEF-1", intent: "add" });
    expect(openLoginState(sealLoginState("abc_DEF-1", now), now)).toEqual({ state: "abc_DEF-1", intent: null });
  });

  it("the shared login with the add intent goes to the teen form even when this browser has a live family", async () => {
    who = { sub: "S-shared-add", email: SANDBOX_LOGIN.email };
    const mine = await own("S-shared-add", "Zoe");
    const browser = sealBrowserFamilies([mine.id], new Date());
    expect(signedInTo(await roundTrip({ browser }))).toBe(mine.id);
    const res = await roundTrip({ add: true, browser });
    expect(where(res)).toBe("/g/start/teen");
    expect(openPaypalWho(valueOf(res, PAYPAL_WHO_COOKIE), new Date())).toEqual({ sub: "S-shared-add", shared: true });
  });

  it("the shared login signs in to the NEWEST live family this browser made", async () => {
    who = { sub: "S-shared-new", email: SANDBOX_LOGIN.email };
    const a = await own("S-shared-new", "Ama"), b = await own("S-shared-new", "Ben"), gone = await own("S-shared-new", "Cy", { retired: true });
    expect(signedInTo(await roundTrip({ browser: sealBrowserFamilies([a.id, b.id, gone.id], new Date()) }))).toBe(b.id);
  });
});

describe("POST /g/settings/switch", () => {
  const ordinary: PaypalWho = { sub: "S-switch", shared: false };

  it("signs her in to another live teen her PayPal owns", async () => {
    const zoe = await own("S-switch", "Zoe"), kofi = await own("S-switch", "Kofi");
    const res = await switchPost(kofi.id, { current: zoe.id, who: ordinary });
    expect(where(res)).toBe("/g?switched=1");
    expect(signedInTo(res)).toBe(kofi.id);
  });

  it("refuses a family her PayPal doesn't own, a retired one, or with no remembered PayPal", async () => {
    const zoe = await own("S-switch-2", "Zoe");
    const theirs = await own("S-someone-else", "Ola"), retired = await own("S-switch-2", "Old", { retired: true });
    const me: PaypalWho = { sub: "S-switch-2", shared: false };
    for (const res of [
      await switchPost(theirs.id, { current: zoe.id, who: me }),
      await switchPost(retired.id, { current: zoe.id, who: me }),
      await switchPost("no-such-family", { current: zoe.id, who: me }),
      await switchPost(zoe.id, { current: zoe.id }), // signed in, but no PayPal remembered
    ]) {
      expect(where(res)).toBe("/g/settings?switch=failed");
      expect(cookieOf(res, GUARDIAN_COOKIE)).toBeUndefined();
    }
  });

  it("refuses when she's signed in some other way: a remembered PayPal doesn't open teens from a guardian-link session", async () => {
    const mine = await own("S-switch-3", "Zoe"), linked = await own(null, "Demo");
    const res = await switchPost(mine.id, { current: linked.id, who: { sub: "S-switch-3", shared: false } });
    expect(where(res)).toBe("/g/settings?switch=failed");
    expect(cookieOf(res, GUARDIAN_COOKIE)).toBeUndefined();
  });

  it("shared login: only families THIS browser made; another browser's family is refused even though the PayPal owns it", async () => {
    const shared: PaypalWho = { sub: "S-switch-shared", shared: true };
    const a = await own("S-switch-shared", "Ama"), b = await own("S-switch-shared", "Ben"), otherBrowser = await own("S-switch-shared", "Kim");
    expect(signedInTo(await switchPost(b.id, { current: a.id, who: shared, browser: [a.id, b.id] }))).toBe(b.id);
    const res = await switchPost(otherBrowser.id, { current: a.id, who: shared, browser: [a.id, b.id] });
    expect(where(res)).toBe("/g/settings?switch=failed");
    expect(cookieOf(res, GUARDIAN_COOKIE)).toBeUndefined();
  });

  it("signed out ⇒ Home; a cross-site post ⇒ refused", async () => {
    const zoe = await own("S-switch-4", "Zoe"), kofi = await own("S-switch-4", "Kofi");
    expect(where(await switchPost(kofi.id, { who: { sub: "S-switch-4", shared: false } }))).toBe("/g");
    const cross = await switchPost(kofi.id, { current: zoe.id, who: { sub: "S-switch-4", shared: false }, origin: "https://evil.example" });
    expect(where(cross)).toBe("/g/settings?switch=failed");
    expect(cookieOf(cross, GUARDIAN_COOKIE)).toBeUndefined();
  });
});

describe("Settings: which teens she sees", () => {
  it("ordinary PayPal: every live teen it owns, oldest first, the current one marked", async () => {
    const zoe = await own("S-list", "Zoe"), kofi = await own("S-list", "Kofi");
    await own("S-list", "Old", { retired: true });
    await own("S-not-me", "Ola");
    expect(await settingsTeens(testDb, { id: kofi.id, teenName: "Kofi" }, { sub: "S-list", shared: false }, [])).toEqual({
      viaPaypal: true, teens: [{ id: zoe.id, teenName: "Zoe", current: false }, { id: kofi.id, teenName: "Kofi", current: true }],
    });
  });

  it("shared login: only the live ones this browser made, never another browser's", async () => {
    const a = await own("S-list-shared", "Ama"), b = await own("S-list-shared", "Ben");
    await own("S-list-shared", "Kim"); // another judge's browser
    const gone = await own("S-list-shared", "Cy", { retired: true });
    expect(await settingsTeens(testDb, { id: a.id, teenName: "Ama" }, { sub: "S-list-shared", shared: true }, [a.id, b.id, gone.id])).toEqual({
      viaPaypal: true, teens: [{ id: a.id, teenName: "Ama", current: true }, { id: b.id, teenName: "Ben", current: false }],
    });
  });

  it("guardian link or the shared demo family (no PayPal proof): the current teen only", async () => {
    const demo = await own(null, "Zoe");
    await own("S-list-3", "Kofi");
    const only = { viaPaypal: false, teens: [{ id: demo.id, teenName: "Zoe", current: true }] };
    expect(await settingsTeens(testDb, { id: demo.id, teenName: "Zoe" }, null, [])).toEqual(only);
    // A PayPal remembered from earlier doesn't widen a guardian-link session.
    expect(await settingsTeens(testDb, { id: demo.id, teenName: "Zoe" }, { sub: "S-list-3", shared: false }, [])).toEqual(only);
  });
});

describe("the remembered PayPal cookie", () => {
  it("holds only her PayPal id and the shared flag, opens only for its own purpose, and expires", () => {
    const now = new Date();
    const v = sealPaypalWho({ sub: "S-x", shared: true }, now);
    expect(Buffer.from(v.split(".")[0], "base64url").toString()).toBe("s:S-x");
    expect(openPaypalWho(v, now)).toEqual({ sub: "S-x", shared: true });
    expect(openPaypalWho(sealBrowserFamilies(["S-x"], now), now)).toBeNull();
    expect(openPaypalWho(v, new Date(now.getTime() + 8 * 86_400_000))).toBeNull();
  });

  it("the browser's family list keeps the last 10", () => {
    const now = new Date();
    const ids = Array.from({ length: 12 }, (_, i) => `f${i}`);
    expect(openBrowserFamilies(sealBrowserFamilies(ids, now), now)).toEqual(ids.slice(2));
  });
});

describe("onboarding several teens in one go", () => {
  const rows = (teens: [string, string][], guardian = true) => {
    const p = new URLSearchParams();
    for (const [n, a] of teens) { p.append("teenName", n); p.append("age", a); }
    if (guardian) p.set("guardian", "on");
    return p;
  };
  const postRows = (start: string, body: URLSearchParams, extra: Record<string, string | undefined> = {}) =>
    create(new Request("http://localhost/g/start/teen/create", {
      method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar({ [START_COOKIE]: start, ...extra }) },
    }));
  const pool = async () => (await testDb.select().from(t.usagePool).where(eq(t.usagePool.kind, "family_start")))[0]?.count ?? 0;

  it("two teens, one starting cookie ⇒ two families, signed in to the first, both in this browser's list; the cookie can't be replayed", async () => {
    const ticket = sealStart({ sub: "S-batch", givenName: "Amara", email: "batch@example.com" }, new Date());
    const before = await pool();
    const res = await postRows(ticket, rows([["Zoe", "15"], ["Maya", "13"]]));
    expect(where(res)).toBe("/g?started=1&teens=2");
    const ids = openBrowserFamilies(valueOf(res, BROWSER_FAMILY_COOKIE), new Date());
    expect(ids).toHaveLength(2);
    expect(signedInTo(res)).toBe(ids[0]);
    expect((await repo.getFamily(testDb, ids[0]))).toMatchObject({ teenName: "Zoe", paypalSub: "S-batch" });
    expect((await repo.getFamily(testDb, ids[1]))).toMatchObject({ teenName: "Maya", paypalSub: "S-batch" });
    expect(await pool()).toBe(before + 2); // each teen counts against the daily site cap
    const again = await postRows(ticket, rows([["Ola", "14"]]));
    expect(where(again)).toBe("/g?login=used");
    expect(signedInTo(again)).toBeNull();
  });

  it("when the daily cap can't take the whole list, none is made and the count doesn't move", async () => {
    const day = new Date().toISOString().slice(0, 10);
    await testDb.insert(t.usagePool).values({ kind: "family_start", day, count: NEW_FAMILIES_PER_DAY - 1 })
      .onConflictDoUpdate({ target: [t.usagePool.kind, t.usagePool.day], set: { count: NEW_FAMILIES_PER_DAY - 1 } });
    const ticket = sealStart({ sub: "S-batch-full", email: "full@example.com" }, new Date());
    const res = await postRows(ticket, rows([["Zoe", "15"], ["Maya", "13"]]));
    expect(where(res)).toBe("/g/start/teen?e=fullmany");
    expect(signedInTo(res)).toBeNull();
    expect(await pool()).toBe(NEW_FAMILIES_PER_DAY - 1);
    expect(await testDb.select().from(t.families).where(eq(t.families.paypalSub, "S-batch-full"))).toHaveLength(0);
    await testDb.delete(t.usagePool);
  });

  it("checks every row: names and ages as for one teen, no name twice, at most 5, the checkbox once", () => {
    const check = (b: URLSearchParams) => {
      const f = new FormData();
      for (const [k, v] of b) f.append(k, v);
      const r = parseTeensForm(f);
      return r.ok ? r.teens.map((x) => x.teenName) : r.error;
    };
    expect(check(rows([["Zoe", "15"], ["Maya", "13"]]))).toEqual(["Zoe", "Maya"]);
    expect(check(rows([["Zoe", "15"], ["zoe", "13"]]))).toBe("duplicate");
    expect(check(rows([["Zoe", "15"], ["Maya", "12"]]))).toBe("age");
    expect(check(rows([["Zoe", "15"], ["<b>", "13"]]))).toBe("name");
    expect(check(rows([["Zoe", "15"], ["Maya", "13"]], false))).toBe("guardian");
    expect(check(rows([["A", "13"], ["B", "13"], ["C", "13"], ["D", "13"], ["E", "13"], ["F", "13"]]))).toBe("many");
  });
});

describe("the teen switcher", () => {
  it("lists only the teens she may open; setup steps counted apart from what's waiting (LOW-4); null without PayPal proof", async () => {
    const zoe = await own("S-sw", "Zoe"), maya = await own("S-sw", "Maya");
    await testDb.update(t.families).set({ teenLinkSentAt: new Date() }).where(eq(t.families.id, maya.id)); // one first-run step done
    await testDb.update(t.families).set({ teenNudgeAt: new Date(), teenNudgeNote: "a phone case" }).where(eq(t.families.id, maya.id)); // Maya asked
    await own("S-sw", "Old", { retired: true });
    await own("S-not-her", "Ola");
    const list = await switcherTeens(testDb, { id: zoe.id, teenName: "Zoe" }, { sub: "S-sw", shared: false }, []);
    expect(list).toEqual([
      { id: zoe.id, teenName: "Zoe", current: true, needs: 0, setupLeft: 3 },
      { id: maya.id, teenName: "Maya", current: false, needs: 1, setupLeft: 2 },
    ]);
    expect(await switcherTeens(testDb, { id: zoe.id, teenName: "Zoe" }, null, [])).toBeNull();
  });

  it("shared login: only this browser's teens", async () => {
    const a = await own("S-sw-shared", "Ama"), b = await own("S-sw-shared", "Ben");
    await own("S-sw-shared", "Kim");
    const list = await switcherTeens(testDb, { id: a.id, teenName: "Ama" }, { sub: "S-sw-shared", shared: true }, [a.id, b.id]);
    expect(list?.map((x) => x.teenName)).toEqual(["Ama", "Ben"]);
  });

  it("switching lands on the same tab; an unknown tab lands on Home", async () => {
    const zoe = await own("S-tab", "Zoe"), maya = await own("S-tab", "Maya");
    const me: PaypalWho = { sub: "S-tab", shared: false };
    expect(where(await switchPost(maya.id, { current: zoe.id, who: me, to: "rules" }))).toBe("/g/rules");
    expect(where(await switchPost(maya.id, { current: zoe.id, who: me, to: "savings" }))).toBe("/g/savings");
    for (const to of ["https://evil.example", "/g/../x", "__proto__", "constructor"]) {
      expect(where(await switchPost(maya.id, { current: zoe.id, who: me, to }))).toBe("/g?switched=1");
    }
  });
});

describe("push: where a family's asks go", () => {
  it("an ordinary parent's teens share one alias; the shared login and the demo keep one per family", async () => {
    const zoe = await own("S-push", "Zoe"), maya = await own("S-push", "Maya");
    await testDb.update(t.families).set({ paypalEmail: "push@example.com" }).where(eq(t.families.paypalSub, "S-push"));
    expect(await pushAliasFor(testDb, zoe.id)).toBe(parentPushAlias("S-push"));
    expect(await pushAliasFor(testDb, maya.id)).toBe(parentPushAlias("S-push"));
    expect(parentPushAlias("S-push")).not.toBe(pushAlias(zoe.id));

    const judge = await own("S-push-shared", "Ama");
    await testDb.update(t.families).set({ paypalEmail: SANDBOX_LOGIN.email }).where(eq(t.families.id, judge.id));
    expect(await pushAliasFor(testDb, judge.id)).toBe(pushAlias(judge.id));
    const noEmail = await own("S-push-noemail", "Cy"); // PayPal sent no email: can't tell, so per family
    expect(await pushAliasFor(testDb, noEmail.id)).toBe(pushAlias(noEmail.id));
    const demo = await own(null, "Zoe");
    expect(await pushAliasFor(testDb, demo.id)).toBe(pushAlias(demo.id));
  });
});

describe("review fixes", () => {
  const approval = (familyId: string, id: string) => testDb.insert(t.approvals).values({
    id, familyId, subject: "shop", subjectId: `shop-${id}`, expiresAt: new Date(Date.now() + 86_400_000),
  });

  it("HIGH-2: a request belongs to another teen she may switch to ⇒ that teen; anyone else's ⇒ not found", async () => {
    const zoe = await own("S-req", "Zoe"), maya = await own("S-req", "Maya"), stranger = await own("S-req-other", "Ola");
    await approval(maya.id, "req-maya");
    await approval(stranger.id, "req-stranger");
    const others = [{ id: maya.id, teenName: "Maya" }];
    expect(await requestElsewhere(testDb, "req-maya", others)).toEqual({ id: maya.id, teenName: "Maya" });
    expect(await requestElsewhere(testDb, "req-stranger", others)).toBeNull();
    expect(await requestElsewhere(testDb, "req-maya", [])).toBeNull();
    // The switch it offers lands on that request; a request id that isn't one lands on Home.
    const me: PaypalWho = { sub: "S-req", shared: false };
    const go = (request: string) => switchTeen(new Request("http://localhost/g/settings/switch", {
      method: "POST", body: new URLSearchParams({ familyId: maya.id, to: "request", request }),
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar({
        [GUARDIAN_COOKIE]: signGuardianCookie(zoe.id, new Date()), [PAYPAL_WHO_COOKIE]: sealPaypalWho(me, new Date()) }) },
    }));
    const res = await go("req-maya");
    expect(where(res)).toBe("/g/requests/req-maya");
    expect(signedInTo(res)).toBe(maya.id);
    expect(where(await go("../../evil"))).toBe("/g?switched=1");
  });

  it("MEDIUM-1: the shared account is still recognised by its PayPal id after its email changes and its families retire", async () => {
    const judge = await own("S-shared-retire", "Ama");
    const parent = await own("S-ordinary-retire", "Zoe");
    await testDb.update(t.families).set({ paypalEmail: SANDBOX_LOGIN.email.toUpperCase(), createdAt: new Date(Date.now() - RETIRE_AFTER_MS - 60_000) })
      .where(eq(t.families.id, judge.id));
    await testDb.update(t.families).set({ paypalEmail: "parent@example.com", createdAt: new Date(Date.now() - RETIRE_AFTER_MS - 60_000) })
      .where(eq(t.families.id, parent.id));
    await retireStaleFamilies({ db: testDb, paypal: { configured: false } as never });
    const [j] = await testDb.select().from(t.families).where(eq(t.families.id, judge.id));
    const [p] = await testDb.select().from(t.families).where(eq(t.families.id, parent.id));
    expect(j.guardianToken.startsWith(repo.ARCHIVED_PREFIX)).toBe(true);
    expect(j).toMatchObject({ paypalSub: "S-shared-retire", paypalEmail: SANDBOX_LOGIN.email.toLowerCase(), teenName: "Removed" });
    expect(p).toMatchObject({ paypalSub: null, paypalEmail: null }); // anyone else's PayPal identity is wiped as before
    // Someone changed the shared account's email: still the shared login, by its PayPal id.
    expect(await isSharedLogin(testDb, { sub: "S-shared-retire", email: "changed@example.com" })).toBe(true);
    expect(await isSharedLogin(testDb, { sub: "S-ordinary-retire", email: "changed@example.com" })).toBe(false);
  });

  it("LOW-3: one ordinary PayPal makes at most 5 new teens a day; the shared login has only the site cap", async () => {
    expect(NEW_TEENS_PER_ACCOUNT_PER_DAY).toBe(5);
    const who = { sub: "S-cap", email: "cap@example.com" };
    for (const n of ["A", "B", "C", "D"]) await own("S-cap", n);
    expect(await startProblem(testDb, who, [{ teenName: "E", age: 14 }], [])).toBeNull();
    expect(await startProblem(testDb, who, [{ teenName: "E", age: 14 }, { teenName: "F", age: 14 }], [])).toBe("account");
    const judge = { sub: "S-cap-shared", email: SANDBOX_LOGIN.email };
    for (const n of ["A", "B", "C", "D", "E", "F"]) await own("S-cap-shared", n);
    expect(await startProblem(testDb, judge, [{ teenName: "G", age: 14 }], [])).toBeNull();
    // Refused before the ticket is spent: the same ticket still works with fewer teens.
    const ticket = sealStart(who, new Date());
    const body = (names: string[]) => { const p = new URLSearchParams(); for (const n of names) { p.append("teenName", n); p.append("age", "14"); } p.set("guardian", "on"); return p; };
    const send = (names: string[]) => create(new Request("http://localhost/g/start/teen/create", {
      method: "POST", body: body(names), headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar({ [START_COOKIE]: ticket }) },
    }));
    expect(where(await send(["Eve", "Fay"]))).toBe("/g/start/teen?e=account");
    expect(where(await send(["Eve"]))).toBe("/g?started=1");
  });

  it("LOW-5: a name she already has (any case) is refused before the ticket is spent", async () => {
    await own("S-taken", "Zoe");
    const who = { sub: "S-taken", email: "taken@example.com" };
    expect(await startProblem(testDb, who, [{ teenName: "zoe", age: 14 }], [])).toBe("taken");
    expect(await startProblem(testDb, who, [{ teenName: "Maya", age: 14 }], [])).toBeNull();
    // The shared login compares only with this browser's teens, never another judge's.
    const theirs = await own("S-taken-shared", "Kim");
    const judge = { sub: "S-taken-shared", email: SANDBOX_LOGIN.email };
    expect(await startProblem(testDb, judge, [{ teenName: "Kim", age: 14 }], [])).toBeNull();
    expect(await startProblem(testDb, judge, [{ teenName: "Kim", age: 14 }], [theirs.id])).toBe("taken");
  });
});
