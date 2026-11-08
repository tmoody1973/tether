import { beforeAll, describe, expect, it, vi } from "vitest";

// Decision 030: Amara's consent controls are parent forms like every other (decision 028): a form drawn for another teen
// changes nothing. The session and database are test ones; the actions and the check are real.
let testDb: import("@/db/client").Db;
let session: string | null = null;
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: async () => testDb }));
vi.mock("@/auth/guardianSession", async (orig) => ({ ...(await orig<typeof import("@/auth/guardianSession")>()), guardianFamilyId: async () => session }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
import { createDb, migrateDb } from "@/db/client";
import * as repo from "@/db/repo";
import { clockFor } from "@/clock/clock";
import { signGrant } from "@/flows/grant";
import { signGrantAction } from "@/app/g/actions";
import * as t from "@/db/schema";
import { eq } from "drizzle-orm";
import { costsAction, investingAction, pauseAction, spendingAction } from "@/app/g/rules/consentActions";

let liam: repo.Family, maya: repo.Family;
beforeAll(async () => {
  testDb = createDb("pglite:memory"); await migrateDb(testDb);
  liam = await repo.insertFamily(testDb, { name: "A & Liam", teenToken: "c-liam", guardianName: "Amara", teenName: "Liam" });
  maya = await repo.insertFamily(testDb, { name: "A & Maya", teenToken: "c-maya", guardianName: "Amara", teenName: "Maya" });
  for (const f of [liam, maya]) await signGrant({ db: testDb, now: clockFor(testDb) }, f.id, { level: 2 });
});

const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
const grantOf = (id: string) => repo.getActiveGrant(testDb, id);

describe("consent controls refuse a form left open on another teen (028 + 030)", () => {
  it("pause, spending mode, investing and costs from Liam's tab change nothing on Maya", async () => {
    session = maya.id;
    const before = (await grantOf(maya.id))!.version;
    await expect(pauseAction(form({ familyId: liam.id, paused: "1" }))).rejects.toThrow("REDIRECT /g?stale=1");
    await expect(spendingAction({}, form({ familyId: liam.id, spendingMode: "every" }))).rejects.toThrow("REDIRECT /g?stale=1");
    await expect(investingAction({}, form({ familyId: liam.id, investing: "off" }))).rejects.toThrow("REDIRECT /g?stale=1");
    await expect(costsAction({}, form({ familyId: liam.id, salesTax: "8", shipping: "5.99" }))).rejects.toThrow("REDIRECT /g?stale=1");
    expect((await repo.getFamily(testDb, maya.id))!.pausedAt).toBeNull();
    expect((await repo.getFamily(testDb, liam.id))!.pausedAt).toBeNull();
    expect((await grantOf(maya.id))!.version).toBe(before);
  });

  it("from Maya's own page they apply", async () => {
    session = maya.id;
    await pauseAction(form({ familyId: maya.id, paused: "1" }));
    expect((await repo.getFamily(testDb, maya.id))!.pausedAt).not.toBeNull();
    await pauseAction(form({ familyId: maya.id, paused: "0" }));
    expect((await repo.getFamily(testDb, maya.id))!.pausedAt).toBeNull();
    expect(await spendingAction({}, form({ familyId: maya.id, spendingMode: "upTo", upTo: "15" }))).toMatchObject({ done: expect.stringMatching(/^Saved\./) });
    expect((await grantOf(maya.id))!.body.spending).toEqual({ mode: "upTo", upToCents: 1500 });
    expect(await spendingAction({}, form({ familyId: maya.id, spendingMode: "upTo", upTo: "31" })))
      .toEqual({ error: "The amount must be between $1.00 and $30.00. Nothing changed." });
    expect(await investingAction({}, form({ familyId: maya.id, investing: "off" }))).toMatchObject({ done: expect.stringContaining("Investing is off") });
    expect((await grantOf(maya.id))!.body.investing).toBe(false);
    expect(await costsAction({}, form({ familyId: maya.id, salesTax: "8.25", shipping: "" }))).toMatchObject({ done: expect.any(String) });
    expect((await grantOf(maya.id))!.body.costs).toEqual({ salesTaxBps: 825, shippingCents: 599 });
    expect(await costsAction({}, form({ familyId: maya.id, salesTax: "16", shipping: "1" }))).toMatchObject({ error: expect.any(String) });
  });

  it("signing rules that aren't in force needs the sales tax when the rules don't have one yet", async () => {
    session = liam.id;
    // A savings-only re-sign of rules in force (with no estimates yet) still goes through: nothing forces a tax entry there.
    await expect(signGrantAction({}, form({ familyId: liam.id, level: "2", floorPct: "20", matchPct: "100" }))).rejects.toThrow(/^REDIRECT \/g\?signed=/);
    await testDb.update(t.grants).set({ status: "revoked" }).where(eq(t.grants.familyId, liam.id)); // now nothing is in force
    const sign = (extra: Record<string, string>) => signGrantAction({}, form({ familyId: liam.id, level: "2", floorPct: "10", matchPct: "100", ...extra }));
    expect(await sign({})).toEqual({ error: "Set the sales tax where you live first, under Estimated costs. Nothing changed." });
    expect(await sign({ salesTax: "abc" })).toMatchObject({ error: expect.stringContaining("sales tax") });
    await expect(sign({ salesTax: "7", shipping: "4.50" })).rejects.toThrow(/^REDIRECT \/g\?signed=/);
    expect((await grantOf(liam.id))!.body.costs).toEqual({ salesTaxBps: 700, shippingCents: 450 });
    await expect(sign({})).rejects.toThrow(/^REDIRECT \/g\?signed=/); // a savings-only re-sign keeps them
    expect((await grantOf(liam.id))!.body.costs).toEqual({ salesTaxBps: 700, shippingCents: 450 });
  });
});
