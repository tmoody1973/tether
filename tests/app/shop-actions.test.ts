import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { clockFor } from "@/clock/clock";
import { signGrant } from "@/flows/grant";
import { DAILY_CAP_MESSAGE } from "@/flows/usage";

// The guardian session, the database and Channel3 are swapped for test ones; everything else is the real action.
let testDb: Db;
let session: string | null = null;
const websites = vi.fn(async (q: string) => [{ domain: `${q}.com`, name: q }]);
const channel3 = { search: async () => [], lookup: async () => ({ kind: "not_a_product" as const }), retrieve: async () => null, websites };
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: async () => testDb }));
vi.mock("@/auth/guardianSession", () => ({ guardianFamilyId: async () => session }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/app/g/flowDeps", () => ({
  paymentDeps: (db: Db) => ({ db, now: clockFor(db), channel3 }),
  paypalOrUnavailable: () => ({ configured: false, request: async () => { throw new Error("no"); } }),
}));
vi.mock("@/app/t/teenDeps", () => ({ teenDeps: (db: Db) => ({ db, now: clockFor(db), channel3 }) }));

import { addShopAction, removeShopAction, searchShopsAction } from "@/app/g/actions";
import { searchSitesAction } from "@/app/t/[token]/map/actions";

process.env.TETHER_SIGNING_KEY = "test-key";
let fam: repo.Family;
beforeAll(async () => {
  testDb = createDb("pglite:memory"); await migrateDb(testDb);
  fam = await repo.insertFamily(testDb, { name: "F", teenToken: "shop-teen-token", guardianName: "Amara", teenName: "Zoe" });
  await testDb.insert(t.merchants).values({ id: "m1", name: "Target", domain: "target.com", class: "general", opensAtLevel: 1, channel3WebsiteId: "target.com" });
  await signGrant({ db: testDb, now: clockFor(testDb) }, fam.id, { level: 1 });
});
beforeEach(() => { session = null; websites.mockClear(); });

const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
const payees = async () => ((await repo.getActiveGrant(testDb, fam.id))!.body.constraints
  .find((c) => c.type === "payment.allowed_payees") as { merchantIds: string[] }).merchantIds;

describe("Amara's shop actions", () => {
  it("do nothing without her session", async () => {
    const version = (await repo.getActiveGrant(testDb, fam.id))!.version;
    expect((await searchShopsAction({}, form({ q: "lego" }))).error).toBe("Open your Tether link to continue.");
    expect((await addShopAction({}, form({ domain: "lego.com", name: "Lego" }))).error).toBe("Open your Tether link to continue.");
    expect((await removeShopAction({}, form({ merchantId: "m1" }))).error).toBe("Open your Tether link to continue.");
    expect(websites).not.toHaveBeenCalled();
    expect((await repo.getActiveGrant(testDb, fam.id))!.version).toBe(version);
    expect(await testDb.select().from(t.shopChoices).where(eq(t.shopChoices.familyId, fam.id))).toHaveLength(0);
  });

  it("search, add and remove with her session", async () => {
    session = fam.id;
    const found = await searchShopsAction({}, form({ q: "lego" }));
    expect(found).toMatchObject({ query: "lego", sites: [{ domain: "lego.com", name: "lego", onList: false }] });
    expect((await searchShopsAction({}, form({ q: "nothing" }))).sites).toEqual([{ domain: "nothing.com", name: "nothing", onList: false, opensAt: null }]);
    websites.mockResolvedValueOnce([]);
    expect(await searchShopsAction({}, form({ q: "zzz" }))).toEqual({ query: "zzz", sites: [], note: `No shops found for "zzz". Try the shop's name.` });

    const added = await addShopAction({}, form({ domain: "lego.com", name: "Lego" }));
    expect(added.done).toMatch(/^Lego added\. Zoe's rules are now version \d+\.$/);
    const removed = await removeShopAction({}, form({ merchantId: "m1" }));
    expect(removed.done).toMatch(/^Target removed\. Zoe's rules are now version \d+\.$/);
    expect(await payees()).not.toContain("m1");
  });

  it("a search query must be 1–60 characters", async () => {
    session = fam.id;
    expect((await searchShopsAction({}, form({ q: "  " }))).error).toBe("Type a shop's name to search.");
    expect((await searchShopsAction({}, form({ q: "x".repeat(61) }))).error).toBe("Type a shop's name to search.");
    expect(websites).not.toHaveBeenCalled();
  });
});

describe("the daily cap on shop search", () => {
  const fill = (kind: "shop_sites" | "teen_shop_sites") => testDb.insert(t.usage)
    .values({ familyId: fam.id, kind, day: new Date().toISOString().slice(0, 10), count: 200 })
    .onConflictDoUpdate({ target: [t.usage.familyId, t.usage.kind, t.usage.day], set: { count: 200 } });

  it("Zoe using up her searches does not block Amara's, and each shows the cap message without calling Channel3", async () => {
    session = fam.id;
    await fill("teen_shop_sites");
    expect((await searchSitesAction({}, form({ token: "shop-teen-token", q: "lego" }))).error).toBe(DAILY_CAP_MESSAGE);
    expect(websites).not.toHaveBeenCalled();
    expect((await searchShopsAction({}, form({ q: "lego" }))).sites).toHaveLength(1); // Amara's own counter
    websites.mockClear();
    await fill("shop_sites");
    expect((await searchShopsAction({}, form({ q: "lego" }))).error).toBe(DAILY_CAP_MESSAGE);
    expect(websites).not.toHaveBeenCalled();
  });
});
