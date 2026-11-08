import { beforeAll, describe, expect, it, vi } from "vitest";

// Decision 028, review HIGH-1: switching teens in one tab changes the session; a form still open in another tab, drawn
// for the old teen, must change nothing on the new one. The guardian session, the database and PayPal are test ones;
// the actions and the check are real.
let testDb: import("@/db/client").Db;
let session: string | null = null;
const paypalDeletes: string[] = [];
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: async () => testDb }));
vi.mock("@/auth/guardianSession", async (orig) => ({ ...(await orig<typeof import("@/auth/guardianSession")>()), guardianFamilyId: async () => session }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/adapters/paypal/vault", async (orig) => ({
  ...(await orig<typeof import("@/adapters/paypal/vault")>()),
  deletePaymentToken: async (_p: unknown, token: string) => { paypalDeletes.push(token); },
}));
import { createDb, migrateDb } from "@/db/client";
import * as repo from "@/db/repo";
import { clockFor } from "@/clock/clock";
import { signGrant } from "@/flows/grant";
import { revokeAction, setLevelAction, signGrantAction } from "@/app/g/actions";
import { linkSentAction } from "@/app/g/send-link/actions";

process.env.TETHER_SIGNING_KEY = "test-key";
let liam: repo.Family, maya: repo.Family;
beforeAll(async () => {
  testDb = createDb("pglite:memory"); await migrateDb(testDb);
  liam = await repo.insertFamily(testDb, { name: "A & Liam", teenToken: "stale-liam", guardianName: "Amara", teenName: "Liam" });
  maya = await repo.insertFamily(testDb, { name: "A & Maya", teenToken: "stale-maya", guardianName: "Amara", teenName: "Maya" });
  for (const f of [liam, maya]) await signGrant({ db: testDb, now: clockFor(testDb) }, f.id, { level: 1 });
  await repo.saveVault(testDb, maya.id, "PT-MAYA");
});

const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
const grantOf = (id: string) => repo.getActiveGrant(testDb, id);

describe("a form left open on another teen changes nothing", () => {
  it("Stop: Liam's tab, but she switched to Maya in another tab ⇒ refused; Maya's rules and saved PayPal untouched", async () => {
    session = maya.id;
    const before = await grantOf(maya.id);
    await expect(revokeAction(form({ familyId: liam.id }))).rejects.toThrow("REDIRECT /g?stale=1");
    await expect(revokeAction(form({}))).rejects.toThrow("REDIRECT /g?stale=1"); // a form with no teen at all
    expect((await grantOf(maya.id))?.status).toBe("active");
    expect((await grantOf(maya.id))?.version).toBe(before?.version);
    expect((await repo.getVault(testDb, maya.id))?.deletedAt ?? null).toBeNull();
    expect(paypalDeletes).toEqual([]);
    expect((await grantOf(liam.id))?.status).toBe("active"); // and Liam, whose tab it was, is untouched too
  });

  it("signing rules, changing the level and the link step are refused the same way", async () => {
    session = maya.id;
    const before = (await grantOf(maya.id))?.version;
    const sign = form({ familyId: liam.id, level: "1", floorPct: "20", matchPct: "100" });
    await expect(signGrantAction({}, sign)).rejects.toThrow("REDIRECT /g?stale=1");
    await expect(setLevelAction({}, form({ familyId: liam.id, level: "2", reason: "earned it" }))).rejects.toThrow("REDIRECT /g?stale=1");
    await expect(linkSentAction(form({ familyId: liam.id }))).rejects.toThrow("REDIRECT /g?stale=1");
    expect((await grantOf(maya.id))?.version).toBe(before);
    expect((await repo.getFamily(testDb, maya.id))?.teenLinkSentAt).toBeNull();
  });

  it("the same Stop, from Maya's own page, goes through", async () => {
    session = maya.id;
    await expect(revokeAction(form({ familyId: maya.id }))).rejects.toThrow("REDIRECT /g/rules?stopped=wallet-removed");
    expect((await repo.getLatestGrant(testDb, maya.id))?.status).toBe("revoked");
    expect(paypalDeletes).toEqual(["PT-MAYA"]);
  });
});
