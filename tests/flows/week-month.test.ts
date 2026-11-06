import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { PaypalError, type PaypalHttp } from "@/adapters/paypal/http";
import type { Channel3Adapter } from "@/adapters/channel3/client";
import type { Cart } from "@/engine/types";
import { commitmentKept, grantForLevel } from "@/engine/ladder";
import { proposePurchase, type Deps } from "@/flows/purchase";
import { savingsCents, weekRecords } from "@/ledger/ledger";
import { now as clockNow } from "@/clock/clock";
import { proposeShop, decideApproval } from "@/flows/approvals";
import { closeWeek } from "@/flows/week";
import { confirmRelease, runMonthReview } from "@/flows/month";
import { GrantError, guardianSetLevel, renewGrant, resetTeenLink, revoke, setCommitment, signGrant } from "@/flows/grant";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

let n = 0;
let nowMs = 0;
let deleted: string[] = [];
let failDelete = false;
const paypal: PaypalHttp = {
  async request<T>(method: string, path: string) {
    if (method === "DELETE") {
      if (failDelete) throw new PaypalError(500, "INTERNAL", "boom");
      deleted.push(path);
    }
    return { status: 204, headers: new Headers(), data: {} as T };
  },
};
const nope = async () => { throw new Error("unused"); };
const channel3: Channel3Adapter = { retrieve: nope, search: nope, lookup: nope, websites: nope } as unknown as Channel3Adapter;
const deps = (): Deps => ({
  db, paypal, channel3, classifier: { ask: async () => ({ probability: 0.99, model: "m", modelVersion: "1" }) },
  secret: "s", now: async () => new Date(nowMs),
});

async function seed(start = "2026-11-04T12:00:00Z") {
  n++;
  nowMs = new Date(start).getTime();
  const familyId = (await repo.insertFamily(db, { name: "F", teenToken: `wm-token-${n}`, guardianName: "Amara", teenName: "Z" })).id;
  await db.insert(t.merchants).values([
    { id: `gen${n}`, name: "Gen", domain: `gen${n}.example`, class: "general", opensAtLevel: 1 },
    { id: `book${n}`, name: "Books", domain: `book${n}.example`, class: "books", opensAtLevel: 2 },
    { id: `shoe${n}`, name: "Shoes", domain: `shoe${n}.example`, class: "sneakers", opensAtLevel: 3 },
  ]);
  await db.insert(t.vault).values({ familyId, paymentTokenId: `V${n}` });
  const g = grantForLevel(1, { id: `g${n}`, familyId, version: 1, commitmentFloorPct: 10, matchPct: 100, fundAllowlist: [] },
    { general: [`gen${n}`], books: [`book${n}`] }, [], new Date("2026-11-02T00:00:00Z"));
  await repo.insertGrant(db, { id: g.id, familyId, version: 1, level: 1, body: g, signedAt: new Date(g.signedAt), expiresAt: new Date(g.expiresAt), status: "active" });
  return { familyId, n };
}

const seedWeeks = (familyId: string, kept: boolean[]) =>
  db.insert(t.weeks).values(kept.map((k, i) => ({
    familyId, weekKey: `2026-W${41 + i}`, allowanceCents: 2000, commitmentCents: k ? 200 : 2500,
  })));
const saveJournal = (familyId: string, cents: number) =>
  repo.appendJournal(db, { familyId, kind: "week_close", amountCents: cents, at: new Date(nowMs) });
const active = async (familyId: string) => (await repo.getActiveGrant(db, familyId))!;

describe("month review and release", () => {
  it("four kept weeks -> level 2 grant with bookshop and $30", async () => {
    const { familyId, n } = await seed();
    await seedWeeks(familyId, [true, true, true, true]);
    const r = await runMonthReview(deps(), familyId);
    expect(r.action).toBe("PROMOTE");
    const g = await active(familyId);
    expect(g.level).toBe(2);
    expect(g.version).toBe(2);
    expect(g.body.weeklyCents).toBe(3000);
    const payees = (g.body.constraints.find((c) => c.type === "payment.allowed_payees") as { merchantIds: string[] }).merchantIds;
    expect(payees).toContain(`book${n}`);
    expect(payees).not.toContain(`shoe${n}`);
    expect(g.body.constraints).toContainEqual({ type: "checkout.semantic_category", merchantIds: [`book${n}`], rule: "BOOKS_ONLY" });
    const lc = await db.select().from(t.levelChanges).where(eq(t.levelChanges.familyId, familyId));
    expect(lc).toMatchObject([{ fromLevel: 1, toLevel: 2, by: "engine" }]);
    const all = await db.select().from(t.grants).where(eq(t.grants.familyId, familyId));
    expect(all.filter((x) => x.status === "active")).toHaveLength(1);
  });

  it("release amounts = savings and 100% match", async () => {
    const { familyId } = await seed();
    await seedWeeks(familyId, [true, true, true, true]);
    await saveJournal(familyId, 1200);
    const r = await runMonthReview(deps(), familyId);
    expect(r.release).toMatchObject({ savedCents: 1200, matchCents: 1200 });
    const [row] = await db.select().from(t.releases).where(eq(t.releases.id, r.release!.releaseId));
    expect(row).toMatchObject({ savedCents: 1200, matchCents: 1200, confirmedAt: null });
  });

  it("HOLD creates no release", async () => {
    const { familyId } = await seed();
    await seedWeeks(familyId, [true, true, false, true]);
    const r = await runMonthReview(deps(), familyId);
    expect(r.action).toBe("HOLD");
    expect(r.release).toBeUndefined();
    expect((await active(familyId)).level).toBe(1);
    expect(await db.select().from(t.releases).where(eq(t.releases.familyId, familyId))).toHaveLength(0);
  });

  it("confirmRelease journals release", async () => {
    const { familyId } = await seed();
    await seedWeeks(familyId, [true, true, true, true]);
    await saveJournal(familyId, 1200);
    const { release } = await runMonthReview(deps(), familyId);
    expect(await savingsCents(db, familyId)).toBe(1200);
    await confirmRelease(deps(), release!.releaseId);
    await confirmRelease(deps(), release!.releaseId); // idempotent
    expect(await savingsCents(db, familyId)).toBe(0);
    const rel = (await db.select().from(t.journal).where(eq(t.journal.familyId, familyId))).filter((j) => j.kind === "release");
    expect(rel).toHaveLength(1);
    expect(rel[0].amountCents).toBe(1200);
  });
});

const addClosedWeeks = (familyId: string, from: number, count: number) =>
  db.insert(t.weeks).values(Array.from({ length: count }, (_, i) => ({
    familyId, weekKey: `2026-W${from + i}`, allowanceCents: 2000, commitmentCents: 200, closedAt: new Date(nowMs + 1000),
  })));

describe("month review idempotency", () => {
  it("running the review twice promotes once with one release", async () => {
    const { familyId } = await seed();
    await seedWeeks(familyId, [true, true, true, true]);
    await saveJournal(familyId, 1200);
    const a = await runMonthReview(deps(), familyId);
    const b = await runMonthReview(deps(), familyId);
    expect(a.action).toBe("PROMOTE");
    expect(b.action).toBe("HOLD");
    expect(b.release).toBeUndefined();
    expect(await db.select().from(t.levelChanges).where(eq(t.levelChanges.familyId, familyId))).toHaveLength(1);
    expect(await db.select().from(t.releases).where(eq(t.releases.familyId, familyId))).toHaveLength(1);
    expect((await active(familyId)).level).toBe(2);
  });

  it("a second promotion reuses the unconfirmed release instead of double-counting", async () => {
    const { familyId } = await seed();
    await seedWeeks(familyId, [true, true, true, true]);
    await saveJournal(familyId, 1200);
    const a = await runMonthReview(deps(), familyId);
    nowMs += 60_000;
    await addClosedWeeks(familyId, 45, 4); // closed after the level change
    const b = await runMonthReview(deps(), familyId);
    expect(b.action).toBe("PROMOTE");
    expect((await active(familyId)).level).toBe(3);
    expect(b.release).toEqual(a.release);
    expect(await db.select().from(t.releases).where(eq(t.releases.familyId, familyId))).toHaveLength(1);
  });
});

describe("family-scoped shops", () => {
  it("A's approved shop stays out of B's promotion but survives A's", async () => {
    const A = await seed();
    const B = await seed();
    const domain = `shop-a-${A.n}.example`;
    const { approvalId } = await proposeShop(deps(), A.familyId, domain, "wants it");
    await decideApproval(deps(), approvalId, "approved");
    const [shop] = await db.select().from(t.merchants).where(eq(t.merchants.channel3WebsiteId, domain));
    expect(shop.addedByFamilyId).toBe(A.familyId);
    for (const f of [A, B]) { await seedWeeks(f.familyId, [true, true, true, true]); await runMonthReview(deps(), f.familyId); }
    const ids = async (fid: string) => ((await active(fid)).body.constraints
      .find((c) => c.type === "payment.allowed_payees") as { merchantIds: string[] }).merchantIds;
    expect(await ids(A.familyId)).toContain(shop.id);
    expect(await ids(B.familyId)).not.toContain(shop.id);
  });
});

describe("week close and commitment", () => {
  it("closeWeek closes every skipped week in order", async () => {
    const { familyId } = await seed("2026-11-04T12:00:00Z"); // grant signed W45
    await setCommitment(deps(), familyId, 500);
    nowMs = new Date("2026-11-25T09:00:00Z").getTime(); // W48 -> W45, W46, W47 ended
    const r = await closeWeek(deps(), familyId);
    expect(r.weekKeys).toEqual(["2026-W45", "2026-W46", "2026-W47"]);
    const ws = (await db.select().from(t.weeks).where(eq(t.weeks.familyId, familyId))).sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    expect(ws.map((w) => w.commitmentCents)).toEqual([200, 500, 500]); // unset counts as the 10% floor; pending applies after the first closed week
    expect((await closeWeek(deps(), familyId)).closed).toBe(false);
  });

  it("weeks after the rules ended save nothing, keep nothing and promote nothing (I2)", async () => {
    const { familyId } = await seed("2026-11-04T12:00:00Z"); // rules signed W45, end Mon 9 Nov
    nowMs = new Date("2026-11-10T09:00:00Z").getTime();
    await closeWeek(deps(), familyId); // W45: in force, $20 saved
    expect(await savingsCents(db, familyId)).toBe(2000);
    nowMs = new Date("2026-11-30T09:00:00Z").getTime(); // three weeks past the end
    expect((await closeWeek(deps(), familyId)).weekKeys).toEqual(["2026-W46", "2026-W47", "2026-W48"]);
    expect(await savingsCents(db, familyId)).toBe(2000);
    const ws = await weekRecords(db, familyId);
    expect(ws.slice(1).map((w) => w.allowanceCents)).toEqual([0, 0, 0]);
    expect(ws.slice(1).some(commitmentKept)).toBe(false); // streak 0
    await expect(runMonthReview(deps(), familyId)).rejects.toBeInstanceOf(GrantError);
    expect(await db.select().from(t.levelChanges).where(eq(t.levelChanges.familyId, familyId))).toHaveLength(0);
  });

  it("a week under stopped rules saves nothing (I2)", async () => {
    const { familyId } = await seed("2026-11-04T12:00:00Z");
    await revoke(deps(), familyId);
    nowMs = new Date("2026-11-10T09:00:00Z").getTime();
    await closeWeek(deps(), familyId);
    expect(await savingsCents(db, familyId)).toBe(0);
    expect((await weekRecords(db, familyId))[0]).toMatchObject({ allowanceCents: 0 });
  });

  it("closeWeek is idempotent", async () => {
    const { familyId } = await seed("2026-11-10T09:00:00Z"); // Tue of W46 -> closes W45
    await repo.appendJournal(db, { familyId, kind: "spend", amountCents: 500, at: new Date("2026-11-05T10:00:00Z") });
    await closeWeek(deps(), familyId);
    await closeWeek(deps(), familyId);
    const ws = await db.select().from(t.weeks).where(eq(t.weeks.familyId, familyId));
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({ weekKey: "2026-W45", allowanceCents: 2000 });
    const wc = (await db.select().from(t.journal).where(eq(t.journal.familyId, familyId))).filter((j) => j.kind === "week_close");
    expect(wc).toHaveLength(1);
    expect(wc[0].amountCents).toBe(1500);
  });

  it("commitment change mid-week applies next week", async () => {
    const { familyId } = await seed("2026-11-10T09:00:00Z");
    await db.update(t.families).set({ commitmentCents: 300 }).where(eq(t.families.id, familyId));
    await setCommitment(deps(), familyId, 500);
    let [f] = await db.select().from(t.families).where(eq(t.families.id, familyId));
    expect(f).toMatchObject({ commitmentCents: 300, pendingCommitmentCents: 500 });
    await closeWeek(deps(), familyId);
    const [w] = await db.select().from(t.weeks).where(eq(t.weeks.familyId, familyId));
    expect(w.commitmentCents).toBe(300); // the closed week was judged on the old commitment
    [f] = await db.select().from(t.families).where(eq(t.families.id, familyId));
    expect(f).toMatchObject({ commitmentCents: 500, pendingCommitmentCents: null });
  });

  it("closeWeek applies pending commitment", async () => {
    const { familyId } = await seed("2026-11-10T09:00:00Z");
    await setCommitment(deps(), familyId, 400);
    await closeWeek(deps(), familyId);
    const [f] = await db.select().from(t.families).where(eq(t.families.id, familyId));
    expect(f.commitmentCents).toBe(400);
  });

  it("unset commitment counts as the signed floor", async () => {
    const { familyId } = await seed("2026-11-10T09:00:00Z"); // closes W45 of a $20 L1 week, 10% floor
    await repo.appendJournal(db, { familyId, kind: "spend", amountCents: 1900, at: new Date("2026-11-05T10:00:00Z") });
    await closeWeek(deps(), familyId);
    const [w] = await weekRecords(db, familyId);
    expect(w).toMatchObject({ weekKey: "2026-W45", commitmentCents: 200 });
    expect(commitmentKept(w)).toBe(false); // $1 left is not the $2 she was signed up to save
  });

  it("raising the floor takes effect from the next closed week", async () => {
    const { familyId } = await seed("2026-11-10T09:00:00Z");
    await closeWeek(deps(), familyId); // W45 under the 10% floor
    await signGrant(deps(), familyId, { level: 1, commitmentFloorPct: 25 }); // during W46
    nowMs = new Date("2026-11-17T09:00:00Z").getTime();
    await closeWeek(deps(), familyId); // W46 under the 25% floor
    expect((await weekRecords(db, familyId)).map((w) => [w.weekKey, w.commitmentCents]))
      .toEqual([["2026-W45", 200], ["2026-W46", 500]]);
  });

  it("a locked flow reads the demo clock inside its own transaction (no pre-read, no PGlite deadlock)", async () => {
    const { familyId } = await seed("2026-11-10T09:00:00Z");
    await db.update(t.families).set({ clockOffsetMs: 3 * 86_400_000 }).where(eq(t.families.id, familyId));
    const real = { ...deps(), now: (id: string, conn: Db = db) => clockNow(conn, id) };
    const g = await Promise.race([
      signGrant(real, familyId, { level: 1 }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("deadlocked")), 5000)),
    ]);
    expect(new Date(g.signedAt).getTime()).toBeGreaterThan(Date.now() + 2 * 86_400_000); // the family's offset was applied
  });

  it("setCommitment below floor throws with minCents", async () => {
    const { familyId } = await seed();
    const err = await setCommitment(deps(), familyId, 100).catch((e) => e);
    expect(err).toBeInstanceOf(GrantError);
    expect(err.minCents).toBe(200); // 10% of $20
    const [f] = await db.select().from(t.families).where(eq(t.families.id, familyId));
    expect(f.pendingCommitmentCents).toBeNull();
  });
});

describe("grant management", () => {
  it("renewGrant makes a new version, +7 days, old one expired", async () => {
    const { familyId } = await seed();
    await renewGrant(deps(), familyId);
    const g = await active(familyId);
    expect(g).toMatchObject({ version: 2, level: 1 });
    expect(g.expiresAt.getTime()).toBe(nowMs + 7 * 86_400_000);
    const v1 = (await db.select().from(t.grants).where(eq(t.grants.familyId, familyId))).find((x) => x.version === 1)!;
    expect(v1.status).toBe("expired");
  });

  it("guardianSetLevel without reason throws", async () => {
    const { familyId } = await seed();
    await expect(guardianSetLevel(deps(), familyId, 3, "   ")).rejects.toThrow(/reason/);
    expect((await active(familyId)).level).toBe(1);
    await guardianSetLevel(deps(), familyId, 3, " she earned it ");
    expect((await active(familyId)).level).toBe(3);
    const [lc] = await db.select().from(t.levelChanges).where(eq(t.levelChanges.familyId, familyId));
    expect(lc).toMatchObject({ by: "guardian", reason: "she earned it", fromLevel: 1, toLevel: 3 });
  });

  it("signGrant creates the first active grant with defaults", async () => {
    const { familyId } = await seed();
    await signGrant(deps(), familyId, { level: 2, reason: "ready for more" });
    expect(await active(familyId)).toMatchObject({ level: 2, version: 2 });
    expect((await active(familyId)).body).toMatchObject({ commitmentFloorPct: 10, matchPct: 100, fundAllowlist: [] });
  });

  it("signGrant keeps the fund list and records a level change only with a reason", async () => {
    const { familyId } = await seed();
    await db.update(t.grants).set({ body: { ...(await active(familyId)).body, fundAllowlist: ["VTI"] } })
      .where(eq(t.grants.familyId, familyId));
    await signGrant(deps(), familyId, { level: 1, commitmentFloorPct: 20, matchPct: 50 });
    expect((await active(familyId)).body).toMatchObject({ level: 1, commitmentFloorPct: 20, matchPct: 50, fundAllowlist: ["VTI"] });
    await expect(signGrant(deps(), familyId, { level: 2 })).rejects.toBeInstanceOf(GrantError);
    await expect(signGrant(deps(), familyId, { level: 2, reason: "  " })).rejects.toBeInstanceOf(GrantError);
    expect((await active(familyId)).level).toBe(1);
    await signGrant(deps(), familyId, { level: 2, reason: "she earned it early" });
    expect((await active(familyId)).level).toBe(2);
    const lc = await db.select().from(t.levelChanges).where(eq(t.levelChanges.familyId, familyId));
    expect(lc).toEqual([expect.objectContaining({ fromLevel: 1, toLevel: 2, by: "guardian", reason: "she earned it early" })]);
  });

  it("revoke deletes vault token and refuses next purchase", async () => {
    const { familyId, n } = await seed();
    deleted = [];
    const r = await revoke(deps(), familyId);
    expect(r).toEqual({ revoked: true, paypalTokenDeleted: true });
    expect(await revoke(deps(), familyId)).toMatchObject({ paypalTokenDeleted: false, reason: "no_vault" });
    expect(deleted).toEqual([`/v3/vault/payment-tokens/V${n}`]);
    expect(await repo.getActiveGrant(db, familyId)).toBeNull();
    expect(await repo.getVault(db, familyId)).toBeNull();
    const cart: Cart = { merchantId: `gen${n}`, items: [{ sku: "a", title: "x", qty: 1, unitCents: 500 }], totalCents: 500 };
    const { decision } = await proposePurchase(deps(), familyId, cart);
    expect(decision.outcome).toBe("REFUSE");
  });

  it("after a revoke, signing again keeps her level and settings; a level change still needs a reason", async () => {
    const { familyId } = await seed();
    await signGrant(deps(), familyId, { level: 2, reason: "ready", commitmentFloorPct: 25, matchPct: 50 });
    await revoke(deps(), familyId);
    expect(await repo.getActiveGrant(db, familyId)).toBeNull();
    expect((await repo.getLatestGrant(db, familyId))?.level).toBe(2);
    await expect(signGrant(deps(), familyId, { level: 1 })).rejects.toBeInstanceOf(GrantError); // not a silent drop to L1
    await signGrant(deps(), familyId, { level: 2 });
    expect((await active(familyId)).body).toMatchObject({ level: 2, commitmentFloorPct: 25, matchPct: 50 });
    await signGrant(deps(), familyId, { level: 1, reason: "rough month" });
    const lc = await db.select().from(t.levelChanges).where(eq(t.levelChanges.familyId, familyId));
    expect(lc.map((c) => [c.fromLevel, c.toLevel])).toEqual(expect.arrayContaining([[1, 2], [2, 1]]));
  });

  it("demo revoke keeps the shared vault and makes no PayPal delete call; a real family still deletes (C1)", async () => {
    const demo = await seed();
    await db.update(t.families).set({ demo: {} as t.DemoSnapshot }).where(eq(t.families.id, demo.familyId));
    deleted = [];
    expect(await revoke(deps(), demo.familyId)).toEqual({ revoked: true, paypalTokenDeleted: false, reason: "demo_kept" });
    expect(deleted).toEqual([]);
    expect((await repo.getVault(db, demo.familyId))?.deletedAt).toBeNull();
    expect(await repo.getActiveGrant(db, demo.familyId)).toBeNull(); // the rules still stop
    const real = await seed();
    expect(await revoke(deps(), real.familyId)).toEqual({ revoked: true, paypalTokenDeleted: true });
    expect(deleted).toHaveLength(1);
  });

  it("revoke keeps local revoke when PayPal delete fails", async () => {
    const { familyId } = await seed();
    failDelete = true;
    try {
      const r = await revoke(deps(), familyId);
      expect(r).toMatchObject({ revoked: true, paypalTokenDeleted: false });
      expect(r.error).toMatch(/boom/);
      expect(await repo.getActiveGrant(db, familyId)).toBeNull();
    } finally { failDelete = false; }
  });

  it("old teen token no longer resolves after reset", async () => {
    const { familyId, n } = await seed();
    const old = `wm-token-${n}`;
    const { token } = await resetTeenLink(deps(), familyId);
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await repo.getFamilyByTeenToken(db, old)).toBeNull();
    expect((await repo.getFamilyByTeenToken(db, token))?.id).toBe(familyId);
  });
});
