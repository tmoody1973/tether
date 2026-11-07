import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: async () => testDb }));
let testDb: import("@/db/client").Db;
import { and, eq } from "drizzle-orm";
import { createDb, migrateDb } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import type { PaypalHttp } from "@/adapters/paypal/http";
import type { AlpacaBroker } from "@/adapters/alpaca/broker";
import { GUARDIAN_COOKIE, verifyGuardianCookie } from "@/auth/guardian";
import { BROWSER_FAMILY_COOKIE, START_COOKIE, STARTED_COOKIE, openBrowserFamily, sealStart, sealStarted } from "@/auth/start";
import { POST as create } from "@/app/g/start/teen/create/route";
import { ALPACA_ACCOUNTS_PER_DAY, AccountCapError, NEW_FAMILIES_PER_DAY, RETIRE_AFTER_MS, parseTeenForm, retireStaleFamilies } from "@/flows/start";
import { DAILY_CAPS, takeDaily } from "@/flows/usage";
import { ensureAccount } from "@/flows/invest";
import { firstRunSteps, guardianHome } from "@/flows/home";
import { DEMO_MERCHANTS } from "@/flows/seed";

process.env.TETHER_SIGNING_KEY = "test-key";
const DAY_MS = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);
const setPool = (kind: string, count: number) =>
  testDb.insert(t.usagePool).values({ kind, day: today(), count }).onConflictDoUpdate({ target: [t.usagePool.kind, t.usagePool.day], set: { count } });

beforeAll(async () => {
  testDb = createDb("pglite:memory"); await migrateDb(testDb);
  await testDb.insert(t.merchants).values(DEMO_MERCHANTS);
});
beforeEach(async () => { await testDb.delete(t.usagePool); });

const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
const valueOf = (res: Response, name: string) => { const c = cookieOf(res, name); return c ? decodeURIComponent(c.split(";")[0].slice(name.length + 1)) : undefined; };
const where = (res: Response) => { const u = new URL(res.headers.get("location")!, "http://localhost"); return `${u.pathname}${u.search}`; };
const form = (v: Record<string, string>) => { const f = new FormData(); for (const [k, x] of Object.entries(v)) f.set(k, x); return f; };

const AMARA = { sub: "S-amara", givenName: "Amara", email: "amara@example.com", payerId: "P-AMARA" };
function post(fields: Record<string, string>, cookies: { start?: string | null; started?: string } = {}) {
  const jar: string[] = [];
  const start = cookies.start === undefined ? sealStart(AMARA, new Date()) : cookies.start;
  if (start) jar.push(`${START_COOKIE}=${encodeURIComponent(start)}`);
  if (cookies.started) jar.push(`${STARTED_COOKIE}=${encodeURIComponent(cookies.started)}`);
  return create(new Request("http://localhost/g/start/teen/create", {
    method: "POST", body: new URLSearchParams(fields), headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.join("; ") },
  }));
}
const GOOD = { teenName: "Zoe", age: "15", guardian: "on" };

describe("parseTeenForm", () => {
  it("first name, age 13 to 17 and the parent checkbox", () => {
    expect(parseTeenForm(form({ teenName: "  Zoë-Ann ", age: "13", guardian: "on" }))).toEqual({ ok: true, teen: { teenName: "Zoë-Ann", age: 13 } });
    expect(parseTeenForm(form({ ...GOOD, age: "17" })).ok).toBe(true);
  });

  it("refuses ages 12 and 18, non-numbers, a missing checkbox, an empty or odd name", () => {
    const err = (v: Record<string, string>) => { const r = parseTeenForm(form(v)); return r.ok ? null : r.error; };
    expect(err({ ...GOOD, age: "12" })).toBe("age");
    expect(err({ ...GOOD, age: "18" })).toBe("age");
    expect(err({ ...GOOD, age: "15.5" })).toBe("age");
    expect(err({ ...GOOD, age: "" })).toBe("age");
    expect(err({ teenName: "Zoe", age: "15" })).toBe("guardian");
    expect(err({ ...GOOD, teenName: "   " })).toBe("name");
    expect(err({ ...GOOD, teenName: "<script>" })).toBe("name");
    expect(err({ ...GOOD, teenName: "Z".repeat(31) })).toBe("name");
  });
});

describe("POST /g/start/teen/create", () => {
  it("creates the family with no rules, Amara's PayPal identity and her PayPal name; signs her in; goes Home", async () => {
    const res = await post(GOOD);
    expect(where(res)).toBe("/g?started=1");
    const familyId = verifyGuardianCookie(valueOf(res, GUARDIAN_COOKIE)!, new Date())!;
    const f = (await repo.getFamily(testDb, familyId))!;
    expect(f).toMatchObject({
      teenName: "Zoe", guardianName: "Amara", parentGivenName: "Amara", name: "Amara & Zoe",
      paypalSub: "S-amara", paypalEmail: "amara@example.com", paypalPayerId: "P-AMARA", demo: null, teenLinkSentAt: null,
    });
    expect(f.teenToken).toMatch(/^[A-Za-z0-9_-]{32,64}$/);
    expect(await repo.getLatestGrant(testDb, familyId)).toBeNull(); // no rules until she signs (Level 1)
    expect(await repo.getVault(testDb, familyId)).toBeNull();
    expect(cookieOf(res, START_COOKIE)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(cookieOf(res, STARTED_COOKIE)).toMatch(/HttpOnly/i);
    // "family in this browser": how the shared sandbox login finds this family again, here only (decision 026, H1)
    expect(cookieOf(res, BROWSER_FAMILY_COOKIE)).toMatch(/HttpOnly/i);
    expect(openBrowserFamily(valueOf(res, BROWSER_FAMILY_COOKIE)!, new Date())).toBe(familyId);
  });

  it("M1: a starting cookie makes one family; replaying it is refused calmly", async () => {
    const ticket = sealStart({ sub: "S-replay", givenName: "Amara" }, new Date());
    expect(where(await post(GOOD, { start: ticket }))).toBe("/g?started=1");
    const before = (await testDb.select().from(t.families)).length;
    const again = await post(GOOD, { start: ticket });
    expect(where(again)).toBe("/g?login=used");
    expect(cookieOf(again, GUARDIAN_COOKIE)).toBeUndefined();
    expect((await testDb.select().from(t.families)).length).toBe(before);
  });

  it("M1: two creates at once with one starting cookie make exactly one family", async () => {
    const ticket = sealStart({ sub: "S-race", givenName: "Amara" }, new Date());
    const results = await Promise.all([post(GOOD, { start: ticket }), post(GOOD, { start: ticket }), post(GOOD, { start: ticket })]);
    expect(results.filter((r) => where(r) === "/g?started=1")).toHaveLength(1);
    expect(results.filter((r) => where(r) === "/g?login=used")).toHaveLength(2);
    expect(await testDb.select().from(t.families).where(eq(t.families.paypalSub, "S-race"))).toHaveLength(1);
  });

  it("no PayPal given name ⇒ 'Parent'", async () => {
    const res = await post(GOOD, { start: sealStart({ sub: "S-noname" }, new Date()) });
    const f = (await repo.getFamily(testDb, verifyGuardianCookie(valueOf(res, GUARDIAN_COOKIE)!, new Date())!))!;
    expect(f.guardianName).toBe("Parent");
    expect(f.parentGivenName).toBeNull();
  });

  it("invalid form ⇒ back to the form with the reason; nothing created", async () => {
    const before = (await testDb.select().from(t.families)).length;
    expect(where(await post({ ...GOOD, age: "12" }))).toBe("/g/start/teen?e=age");
    expect(where(await post({ ...GOOD, age: "18" }))).toBe("/g/start/teen?e=age");
    expect(where(await post({ teenName: "Zoe", age: "15" }))).toBe("/g/start/teen?e=guardian");
    expect((await testDb.select().from(t.families)).length).toBe(before);
  });

  it("the starting cookie is required: missing, forged or expired ⇒ log in again", async () => {
    const old = sealStart(AMARA, new Date(Date.now() - 31 * 60_000));
    for (const start of [null, "forged.123.abc", old]) {
      const res = await post(GOOD, { start });
      expect(where(res)).toBe("/g?login=expired");
      expect(cookieOf(res, GUARDIAN_COOKIE)).toBeUndefined();
    }
  });

  it("one new family per browser per hour", async () => {
    const res = await post(GOOD, { started: sealStarted(new Date()) });
    expect(where(res)).toBe("/g/start/teen?e=browser");
    expect(cookieOf(res, GUARDIAN_COOKIE)).toBeUndefined();
    // an hour later the cookie has expired
    expect(where(await post(GOOD, { started: sealStarted(new Date(Date.now() - 61 * 60_000)) }))).toBe("/g?started=1");
  });

  it(`the ${NEW_FAMILIES_PER_DAY + 1}st new family of the day is refused, site-wide`, async () => {
    expect(NEW_FAMILIES_PER_DAY).toBe(30);
    await setPool("family_start", 29);
    expect(where(await post(GOOD))).toBe("/g?started=1"); // the 30th
    const before = (await testDb.select().from(t.families)).length;
    expect(where(await post(GOOD))).toBe("/g/start/teen?e=full");
    expect((await testDb.select().from(t.families)).length).toBe(before);
  });
});

describe("shared daily pot for self-started families", () => {
  it("a self-started family's paid lookups also draw from one pot; when it's empty they're refused (the existing cap message)", async () => {
    const mine = await repo.insertFamily(testDb, { name: "x", teenToken: "pot-mine", guardianName: "A", teenName: "Z" });
    await testDb.update(t.families).set({ paypalSub: "S-pot" }).where(eq(t.families.id, mine.id));
    const seeded = await repo.insertFamily(testDb, { name: "y", teenToken: "pot-seeded", guardianName: "A", teenName: "Z" });
    expect(await takeDaily(testDb, mine.id, "shop_agent")).toBe(true);
    const [pot] = await testDb.select().from(t.usagePool).where(and(eq(t.usagePool.kind, "shop_agent"), eq(t.usagePool.day, today())));
    expect(pot.count).toBe(1);
    await setPool("shop_agent", DAILY_CAPS.shop_agent);
    expect(await takeDaily(testDb, mine.id, "shop_agent")).toBe(false);
    expect(await takeDaily(testDb, seeded.id, "shop_agent")).toBe(true); // the demo and seeded families never touch the pot
    expect(await takeDaily(testDb, mine.id, "push")).toBe(true); // push isn't a paid lookup
  });
});

describe("retireStaleFamilies", () => {
  it("retires self-started families older than 7 days: both links dead, PayPal identity gone, wallet deleted at PayPal; never the demo or seeded families", async () => {
    const old = new Date(Date.now() - RETIRE_AFTER_MS - DAY_MS);
    const mk = async (teenToken: string, v: Partial<repo.Family>) => {
      const f = await repo.insertFamily(testDb, { name: "f", teenToken, guardianName: "A", teenName: "Z" });
      await testDb.update(t.families).set(v).where(eq(t.families.id, f.id));
      return f;
    };
    const stale = await mk("ret-stale", { paypalSub: "S-ret", paypalEmail: "a@b.co", paypalPayerId: "P", parentGivenName: "A", createdAt: old });
    await repo.saveVault(testDb, stale.id, "PT-STALE");
    const fresh = await mk("ret-fresh", { paypalSub: "S-ret", createdAt: new Date(Date.now() - RETIRE_AFTER_MS + DAY_MS) });
    const demo = await mk("ret-demo", { createdAt: old, demo: { now: "", grant: {} as never, commitmentCents: 0, goal: { title: "", targetCents: 0, channel3ProductId: null }, ask: null, shop: { domain: "", reason: "" } } });
    const seeded = await mk("ret-seeded", { createdAt: old });

    const deleted: string[] = [];
    const paypal: PaypalHttp = { request: async (method, path) => { deleted.push(`${method} ${path}`); return { status: 204, headers: new Headers(), data: undefined as never }; } };
    expect(await retireStaleFamilies({ db: testDb, paypal })).toBe(1);

    const s = (await repo.getFamily(testDb, stale.id))!;
    expect(s.guardianToken.startsWith(repo.ARCHIVED_PREFIX)).toBe(true);
    expect(s.teenToken.startsWith(repo.ARCHIVED_PREFIX)).toBe(true);
    expect([s.paypalSub, s.paypalEmail, s.paypalPayerId, s.parentGivenName]).toEqual([null, null, null, null]);
    expect(await repo.getVault(testDb, stale.id)).toBeNull();
    expect(deleted).toEqual(["DELETE /v3/vault/payment-tokens/PT-STALE"]);
    expect(await repo.getFamilyByTeenToken(testDb, "ret-stale")).toBeNull();
    for (const f of [fresh, demo, seeded]) expect((await repo.getFamily(testDb, f.id))!.teenToken).toBe(f.teenToken);
    expect(await retireStaleFamilies({ db: testDb, paypal })).toBe(0); // done once
  });

  it("PayPal refusing the wallet delete doesn't stop the retirement (best effort, logged)", async () => {
    const f = await repo.insertFamily(testDb, { name: "f", teenToken: "ret-refused", guardianName: "A", teenName: "Z" });
    await testDb.update(t.families).set({ paypalSub: "S-x", createdAt: new Date(Date.now() - RETIRE_AFTER_MS - DAY_MS) }).where(eq(t.families.id, f.id));
    await repo.saveVault(testDb, f.id, "PT-REFUSED");
    const paypal: PaypalHttp = { request: async () => { throw new Error("404 RESOURCE_NOT_FOUND"); } };
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await retireStaleFamilies({ db: testDb, paypal })).toBe(1);
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("PT-REFUSED"); // never logs the token
    log.mockRestore();
  });
});

describe(`Alpaca accounts: at most ${ALPACA_ACCOUNTS_PER_DAY} new ones a day for self-started families`, () => {
  const broker = () => {
    const made: string[] = [];
    return { made, alpaca: { createCustodialAccount: async () => { made.push("x"); return { accountId: `ACC-${made.length}` }; } } as unknown as AlpacaBroker };
  };

  it("past the cap: refused before Alpaca is called; seeded families and existing accounts are untouched", async () => {
    const mine = await repo.insertFamily(testDb, { name: "x", teenToken: "alp-mine", guardianName: "A", teenName: "Z" });
    await testDb.update(t.families).set({ paypalSub: "S-alp" }).where(eq(t.families.id, mine.id));
    const seeded = await repo.insertFamily(testDb, { name: "y", teenToken: "alp-seeded", guardianName: "A", teenName: "Z" });
    await setPool("alpaca_account", ALPACA_ACCOUNTS_PER_DAY);
    const b = broker();
    await expect(ensureAccount({ db: testDb, alpaca: b.alpaca }, mine.id)).rejects.toBeInstanceOf(AccountCapError);
    expect(b.made).toEqual([]);
    expect(await ensureAccount({ db: testDb, alpaca: b.alpaca }, seeded.id)).toBe("ACC-1");
    await setPool("alpaca_account", ALPACA_ACCOUNTS_PER_DAY - 1);
    expect(await ensureAccount({ db: testDb, alpaca: b.alpaca }, mine.id)).toBe("ACC-2");
    await setPool("alpaca_account", ALPACA_ACCOUNTS_PER_DAY);
    expect(await ensureAccount({ db: testDb, alpaca: b.alpaca }, mine.id)).toBe("ACC-2"); // already has one: no new account
  });
});

describe("first-run checklist", () => {
  it("open until PayPal is saved, rules have been signed and the link was sent; steps in that order", () => {
    const s = firstRunSteps({ paypalSaved: false, rulesSigned: false, linkSent: false });
    expect(s.map((x) => [x.key, x.done])).toEqual([["paypal", false], ["rules", false], ["link", false]]);
    expect(firstRunSteps({ paypalSaved: true, rulesSigned: false, linkSent: false }).filter((x) => x.done)).toHaveLength(1);
    expect(firstRunSteps({ paypalSaved: true, rulesSigned: true, linkSent: true }).every((x) => x.done)).toBe(true);
  });

  it("Home: self-started families get the checklist and a removal date; the demo and seeded families don't", async () => {
    const res = await post(GOOD, { start: sealStart({ sub: "S-home", givenName: "Ana" }, new Date()) });
    const id = verifyGuardianCookie(valueOf(res, GUARDIAN_COOKIE)!, new Date())!;
    const h = await guardianHome(testDb, id, new Date());
    expect(h.firstRun?.map((x) => x.done)).toEqual([false, false, false]);
    const f = (await repo.getFamily(testDb, id))!;
    expect(h.removesAt?.getTime()).toBe(f.createdAt.getTime() + RETIRE_AFTER_MS);
    await repo.saveVault(testDb, id, "PT-H");
    await repo.markTeenLinkSent(testDb, id, new Date());
    expect((await guardianHome(testDb, id, new Date())).firstRun?.map((x) => x.done)).toEqual([true, false, true]);

    const seeded = await repo.insertFamily(testDb, { name: "y", teenToken: "home-seeded", guardianName: "A", teenName: "Z" });
    const hs = await guardianHome(testDb, seeded.id, new Date());
    expect(hs.firstRun).toBeNull();
    expect(hs.removesAt).toBeNull();
  });
});
