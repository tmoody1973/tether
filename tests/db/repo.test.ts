import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import type { Cart, Decision, Grant } from "@/engine/types";

let db: Db;
beforeEach(async () => {
  db = createDb("pglite:memory");
  await migrateDb(db);
});

const cart: Cart = { merchantId: "m1", items: [], totalCents: 500 };
const decision: Decision = { outcome: "ALLOW", reasons: [], semanticRules: [] };
const grantBody = (familyId: string, version: number): Grant => ({
  id: `g${version}`, familyId, version, level: 1, weeklyCents: 2000, commitmentFloorPct: 10,
  matchPct: 50, constraints: [], fundAllowlist: [], signedAt: "2026-01-01T00:00:00Z", expiresAt: "2027-01-01T00:00:00Z",
});

async function seed() {
  const family = await repo.insertFamily(db, { name: "Fam", teenToken: "tok", guardianName: "G", teenName: "T" });
  const grant = await repo.insertGrant(db, {
    familyId: family.id, version: 1, level: 1, body: grantBody(family.id, 1),
    signedAt: new Date("2026-01-01"), expiresAt: new Date("2027-01-01"), status: "active",
  });
  return { family, grant };
}

describe("repo", () => {
  it("consumeToken returns true then false for the same id", async () => {
    expect(await repo.consumeToken(db, "t1")).toBe(true);
    expect(await repo.consumeToken(db, "t1")).toBe(false);
  });

  it("finds a family by teen token", async () => {
    const { family } = await seed();
    expect((await repo.getFamilyByTeenToken(db, "tok"))?.id).toBe(family.id);
    expect(await repo.getFamilyByTeenToken(db, "nope")).toBeNull();
  });

  it("getActiveGrant returns latest active version", async () => {
    const { family } = await seed();
    await repo.insertGrant(db, {
      familyId: family.id, version: 2, level: 2, body: grantBody(family.id, 2),
      signedAt: new Date(), expiresAt: new Date("2027-01-01"), status: "active",
    });
    await repo.insertGrant(db, {
      familyId: family.id, version: 3, level: 2, body: grantBody(family.id, 3),
      signedAt: new Date(), expiresAt: new Date("2027-01-01"), status: "revoked",
    });
    const g = await repo.getActiveGrant(db, family.id);
    expect(g?.version).toBe(2);
    expect(g?.body.version).toBe(2);
  });

  it("inserts a purchase, updates its status, and inserts a receipt", async () => {
    const { family, grant } = await seed();
    const p = await repo.insertPurchase(db, {
      familyId: family.id, cart, cartHash: "h", decision, status: "proposed",
    });
    const updated = await repo.updatePurchaseStatus(db, p.id, "paid");
    expect(updated?.status).toBe("paid");
    const r = await repo.insertReceipt(db, {
      purchaseId: p.id, captureId: "cap", grantId: grant.id, grantVersion: 1, cartHash: "h", decision, approvalId: null,
    });
    expect(r.captureId).toBe("cap");
    expect(r.decision).toEqual(decision);
  });

  it("journal rows cannot be updated or deleted", async () => {
    const { family } = await seed();
    const row = await repo.appendJournal(db, { familyId: family.id, kind: "spend", amountCents: 500, ref: "p1", note: null });
    expect(Object.keys(repo)).not.toContain("updateJournal");
    await expect(db.execute(sql`UPDATE journal SET amount_cents = 1 WHERE id = ${row.id}`)).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM journal WHERE id = ${row.id}`)).rejects.toThrow();
  });
});
