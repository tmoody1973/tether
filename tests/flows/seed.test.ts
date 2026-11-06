import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { getActiveGrant, getFamily, insertFamily } from "@/db/repo";
import { clockFor, now as clockNow } from "@/clock/clock";
import type { PaypalHttp } from "@/adapters/paypal/http";
import type { Channel3Adapter, Product } from "@/adapters/channel3/client";
import type { AlpacaBroker } from "@/adapters/alpaca/broker";
import { approveAndSettle, type ApproveDeps } from "@/flows/approve";
import { advanceDemoClock } from "@/flows/demo";
import { resetTeenLink, revoke } from "@/flows/grant";
import { guardianHome } from "@/flows/home";
import { DemoResetError, resetDemo } from "@/flows/reset";
import { DEMO_COMMITMENT_CENTS, DEMO_NOW, seedDemo, type SeedResult } from "@/flows/seed";
import { ledgerView } from "@/ledger/ledger";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

// Fake Channel3: cheap things at Target / Best Buy, a few over-budget ones, and a goal. Prices never change.
const catalog: Product[] = [
  ...["Spiral notebook", "Gel pens", "Sticky notes", "Charger cable", "Hair ties", "Highlighters"].map((title, i) =>
    ({ id: `small-${i}`, title, priceCents: 350 + i * 100, domain: i % 2 ? "bestbuy.com" : "target.com", available: true })),
  { id: "over-1", title: "Bluetooth speaker", priceCents: 2499, domain: "target.com", available: true },
  { id: "goal-1", title: "Sony WH-CH720N Wireless Noise Canceling Headphones", priceCents: 8999, domain: "bestbuy.com", available: true },
];
const channel3: Channel3Adapter = {
  search: async (q) => catalog.filter((p) =>
    q === "wireless headphones" ? p.id.startsWith("goal") : q === "bluetooth speaker" ? p.id.startsWith("over") : p.id.startsWith("small")),
  retrieve: async (id) => catalog.find((p) => p.id === id) ?? null,
  lookup: async () => { throw new Error("unused"); },
  websites: async () => [],
};

let cap = 0;
const paypal: PaypalHttp = {
  async request<T>(method: string) {
    if (method === "DELETE") return { status: 204, headers: new Headers(), data: {} as T };
    const id = `SEED-CAP-${++cap}`;
    const data = { id: `O-${cap}`, status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id, status: "COMPLETED" }] } }] };
    return { status: 201, headers: new Headers(), data: data as T };
  },
};

const transfers: Array<{ transferId: string; amount: number; createdAt: number; incoming: boolean; status: string }> = [];
const alpaca = {
  createCustodialAccount: async () => ({ accountId: `acct-${transfers.length}`, custodial: false }),
  deposit: async (_a: string, cents: number) => {
    const transferId = `tr-${transfers.length}`;
    transfers.push({ transferId, amount: cents / 100, createdAt: Date.now(), incoming: true, status: "QUEUED" });
    return { transferId };
  },
  listTransfers: async () => transfers,
} as unknown as AlpacaBroker;

const deps: ApproveDeps = {
  db: undefined as unknown as Db, paypal, channel3, secret: "seed-secret",
  classifier: { ask: async () => ({ probability: null, model: "none", modelVersion: "none" }) },
  now: async (familyId, conn) => clockFor(db)(familyId, conn),
  alpaca: () => alpaca,
};
const d = (): ApproveDeps => ({ ...deps, db });

let n = 0;
async function seeded(): Promise<{ r: SeedResult; keys: { guardianKey: string; teenToken: string } }> {
  n++;
  const keys = { guardianKey: `demo-key-${n}`, teenToken: `demo-teen-${n}` };
  const r = await seedDemo({ ...d(), alpaca, wait: async () => undefined }, { ...keys, vaultId: "VAULT-DEMO" });
  return { r, keys };
}

const openApprovals = (familyId: string) => db.select().from(t.approvals)
  .where(and(eq(t.approvals.familyId, familyId), isNull(t.approvals.result), isNull(t.approvals.expiredAt)));

describe("seedDemo (Task 19, R43)", () => {
  it("every seeded receipt has a non-empty capture id", async () => {
    const { r } = await seeded();
    const rows = await db.select({ c: t.receipts.captureId }).from(t.receipts)
      .innerJoin(t.purchases, eq(t.purchases.id, t.receipts.purchaseId)).where(eq(t.purchases.familyId, r.familyId));
    const expected = [...r.weeks.flatMap((w) => w.captureIds), ...r.thisWeekCaptureIds];
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows.map((x) => x.c).sort()).toEqual(expected.sort());
    for (const x of rows) expect(x.c).toMatch(/\S/);
    // Every slip is tied to its purchase, so PayPal rows reconcile (R35).
    const slips = await db.select().from(t.consumedTokens).innerJoin(t.purchases, eq(t.purchases.id, t.consumedTokens.purchaseId))
      .where(eq(t.purchases.familyId, r.familyId));
    expect(slips).toHaveLength(rows.length);
    expect(r.investing).toMatchObject({ transferId: expect.any(String) });
  });

  it("seeded weeks are all kept and end-of-month promotes to level 3", async () => {
    const { r } = await seeded();
    expect(r.weeks.map((w) => w.weekKey)).toEqual(["2026-W49", "2026-W50", "2026-W51", "2026-W52"]);
    expect(r.weeks.every((w) => w.kept && w.savedCents >= DEMO_COMMITMENT_CENTS)).toBe(true);
    expect((await getActiveGrant(db, r.familyId))!.level).toBe(2);
    expect((await clockNow(db, r.familyId)).getTime() - DEMO_NOW.getTime()).toBeLessThan(60_000);
    expect((await getFamily(db, r.familyId))!.commitmentCents).toBe(DEMO_COMMITMENT_CENTS);
    expect(r.goal).toEqual({ title: "Sony WH-CH720N Wireless Noise…", targetCents: 8999, channel3ProductId: "goal-1" }); // a real product, cut at a word
    const open = await openApprovals(r.familyId);
    expect(open.map((a) => a.subject).sort()).toEqual(["purchase", "shop"]);
    expect(open.find((a) => a.subject === "purchase")!.liftsBudget).toBe(true); // over budget: Amara may lift it (R40)

    const { review } = await advanceDemoClock(d(), r.familyId, "endOfMonth");
    expect(review?.action).toBe("PROMOTE");
    expect((await getActiveGrant(db, r.familyId))!.level).toBe(3);
  });
});

describe("resetDemo (Task 19, R43)", () => {
  it("reset restores level 2, pending approvals cleared, teen token unchanged", async () => {
    const { r, keys } = await seeded();
    const fam = r.familyId;
    const spentBefore = (await ledgerView(db, fam, await clockNow(db, fam))).spentThisWeekCents;
    const receiptsBefore = (await db.select().from(t.receipts)).length;

    // A judge plays: approves the over-budget ask (a real charge), resets Zoe's link, jumps to month end (Level 3).
    const ask = (await openApprovals(fam)).find((a) => a.subject === "purchase")!;
    expect(await approveAndSettle(d(), fam, ask.id)).toBe("paid");
    await resetTeenLink(d(), fam);
    expect((await advanceDemoClock(d(), fam, "endOfMonth")).review?.action).toBe("PROMOTE");
    await advanceDemoClock(d(), fam, "endOfWeek"); // closes 2026-W53 (not kept: the ask went over)

    await resetDemo(d(), fam, keys);

    const g = (await getActiveGrant(db, fam))!;
    expect(g.level).toBe(2);
    expect(g.version).toBeGreaterThan(r.weeks.length + 1);
    expect((await getFamily(db, fam))!.teenToken).toBe(keys.teenToken);
    const open = await openApprovals(fam);
    expect(open.map((a) => a.subject).sort()).toEqual(["purchase", "shop"]); // only the seeded two, reopened
    expect(open.some((a) => a.id === ask.id)).toBe(false);
    expect((await clockNow(db, fam)).getTime() - DEMO_NOW.getTime()).toBeLessThan(60_000);
    // The judge's PayPal charge stays on the record, but no longer counts toward Zoe's week.
    expect((await db.select().from(t.receipts)).length).toBe(receiptsBefore + 1);
    expect((await ledgerView(db, fam, await clockNow(db, fam))).spentThisWeekCents).toBe(spentBefore);
    // And the on-camera promotion works again.
    expect((await advanceDemoClock(d(), fam, "endOfMonth")).review?.action).toBe("PROMOTE");
  });

  it("reset with a deleted vault shows the save-again message", async () => {
    const { r, keys } = await seeded();
    expect((await revoke(d(), r.familyId)).paypalTokenDeleted).toBe(true);
    expect(await resetDemo(d(), r.familyId, keys)).toEqual({ needsPaypal: true });
    const h = await guardianHome(db, r.familyId, await clockNow(db, r.familyId));
    expect(h.level).toBe(2);
    expect(h.needsYou).toContainEqual({ kind: "paypal", removedByRevoke: true });
  });

  it("reset refuses for a non-demo family", async () => {
    const { r, keys } = await seeded();
    const other = await insertFamily(db, { name: "S", guardianName: "Sam", teenName: "Kai", teenToken: "not-demo-teen", guardianToken: "not-demo" });
    await expect(resetDemo(d(), other.id, { guardianKey: "not-demo", teenToken: "not-demo-teen" })).rejects.toThrow(DemoResetError);
    await expect(resetDemo(d(), r.familyId, { guardianKey: "some-other-key", teenToken: keys.teenToken })).rejects.toThrow(DemoResetError);
    await expect(resetDemo(d(), r.familyId, {})).rejects.toThrow(DemoResetError);
  });
});
