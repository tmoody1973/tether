import { beforeAll, describe, expect, it } from "vitest";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { now as clockNow } from "@/clock/clock";
import { decideApproval, requestApproval } from "@/flows/approvals";
import { advanceDemoClock } from "@/flows/demo";
import { renewGrant, revoke, signGrant } from "@/flows/grant";
import type { Deps } from "@/flows/purchase";
import { monthReviewView } from "@/flows/month";
import { guardianRecord } from "@/flows/record";
import { requestView } from "@/flows/request";
import type { PaypalHttp } from "@/adapters/paypal/http";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

const REAL = new Date("2026-11-04T12:00:00Z").getTime(); // Wednesday
const deps = () => ({ db, now: (familyId: string, conn?: Db) => clockNow(conn ?? db, familyId, REAL) });
const decision = { outcome: "ALLOW" as const, reasons: [], semanticRules: [] };
let n = 0;

async function family() {
  n++;
  const fam = await repo.insertFamily(db, { name: "F", teenToken: `gv-${n}`, guardianName: "Amara", teenName: "Zoe" });
  const mid = `gv-m${n}`;
  await db.insert(t.merchants).values({ id: mid, name: "Target", domain: `gv${n}.example`, class: "general", opensAtLevel: 1 });
  const grant = await signGrant(deps(), fam.id, { level: 1 });
  const now = await deps().now(fam.id);
  const cart = (cents: number) => ({ merchantId: mid, items: [{ sku: "s", title: "Sneakers", qty: 1, unitCents: cents }], totalCents: cents });
  /** A paid purchase with its receipt, as settlePurchase leaves it. */
  const paid = async (cents: number, captureId: string, at: Date = now) => {
    const p = await repo.insertPurchase(db, { familyId: fam.id, cart: cart(cents), cartHash: `h-${captureId}`, status: "paid", decision });
    await repo.appendJournal(db, { familyId: fam.id, kind: "spend", amountCents: cents, at, ref: p.id, note: null });
    await repo.insertReceipt(db, { purchaseId: p.id, captureId, grantId: grant.id, grantVersion: grant.version, cartHash: `h-${captureId}`, decision, approvalId: null });
  };
  /** A purchase waiting for Amara, with its open approval. */
  const asking = async (cents: number, note: string) => {
    const p = await repo.insertPurchase(db, { familyId: fam.id, cart: cart(cents), cartHash: `ask-${n}-${cents}`, status: "needs_approval", decision });
    return (await requestApproval(deps(), fam.id, "purchase", p.id, p.cartHash, note)).approvalId;
  };
  return { familyId: fam.id, now, paid, asking };
}

describe("requestView", () => {
  it("shows the budget consequence and her reason; another family's id or a decided request reads as closed", async () => {
    const a = await family();
    await a.paid(1050, `GV-CAP-${n}`);
    const id = await a.asking(1500, "the ones I have are falling apart");
    const v = await requestView(db, a.familyId, id, a.now);
    expect(v).toMatchObject({
      subject: "purchase", reason: "the ones I have are falling apart",
      purchase: { amountCents: 1500, shop: "Target", leftCents: 950, overCents: 550 },
      lastWeeks: { count: 0 },
    });
    const b = await family();
    expect(await requestView(db, b.familyId, id, b.now)).toBeNull(); // never reveals that it exists
    await expect(decideApproval(deps(), id, "approved", b.familyId)).rejects.toThrow(/unknown approval/);
    await decideApproval(deps(), id, "approved", a.familyId);
    expect(await requestView(db, a.familyId, id, a.now)).toBeNull();
    expect(await requestView(db, a.familyId, "no-such-id", a.now)).toBeNull();
  });
});

describe("recentReceipts (Home's Recent)", () => {
  it("returns the latest payments across months, newest first", async () => {
    const f = await family();
    const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
    await f.paid(100, "rr-sep", day("2026-09-30"));
    await f.paid(200, "rr-oct1", day("2026-10-02"));
    await f.paid(300, "rr-oct2", day("2026-10-20"));
    await f.paid(400, "rr-nov", day("2026-11-03"));
    const r = await repo.recentReceipts(db, f.familyId, 3);
    expect(r.map((x) => x.captureId)).toEqual(["rr-nov", "rr-oct2", "rr-oct1"]);
  });
});

describe("guardianRecord", () => {
  it("lists receipts with capture id, rules version and the permission slip; grants with their status", async () => {
    const a = await family();
    await a.paid(600, `GV-REC-${n}`);
    const r = await guardianRecord(db, a.familyId, "2026-11", a.now);
    expect(r.receipts).toHaveLength(1);
    expect(r.receipts[0]).toMatchObject({ captureId: `GV-REC-${n}`, ruleVersion: 1, amaraApproved: false, shop: "Target", amountCents: 600 });
    expect(r.receipts[0].slip.clause).toMatch(/^Zoe can spend up to \$20\.00 a week at .*Target/); // merchants are shared across this file's families
    expect(r.receipts[0].slip.expiresAt.getTime() - r.receipts[0].slip.issuedAt.getTime()).toBe(120_000);
    expect(JSON.stringify(r.receipts[0].slip)).not.toMatch(/signature|secret/i);
    expect(r.grants).toEqual([expect.objectContaining({ version: 1, level: 1, status: "active", shops: expect.arrayContaining(["Target"]) })]);
    expect((await guardianRecord(db, a.familyId, "2026-10", a.now)).receipts).toEqual([]);
  });
});

describe("monthReviewView", () => {
  it("shows the evidence behind a promotion and the open release; a stop shows as stopped", async () => {
    const a = await family();
    // I2: a month only reviews on rules in force, so Amara renews them each week, as a real family would.
    const renew = () => renewGrant(deps() as unknown as Deps, a.familyId);
    for (let i = 0; i < 3; i++) { await advanceDemoClock(deps(), a.familyId, "endOfWeek"); await renew(); }
    await advanceDemoClock(deps(), a.familyId, "day");
    await advanceDemoClock(deps(), a.familyId, "day");
    await renew();
    await advanceDemoClock(deps(), a.familyId, "endOfMonth");
    const v = await monthReviewView(db, a.familyId);
    expect(v).toMatchObject({
      level: 2, stopped: false, latestChange: { fromLevel: 1, toLevel: 2, by: "engine" },
      evidence: { weeks: 4, kept: 4, insideBudget: 4, savedCents: 8000, allowanceCents: 8000 },
      release: { savedCents: 8000, matchCents: 8000 },
    });
    const paypal: PaypalHttp = { request: async () => { throw new Error("unused"); } };
    await revoke({ ...deps(), paypal }, a.familyId);
    expect(await monthReviewView(db, a.familyId)).toMatchObject({ level: 2, stopped: true });
  });
});
