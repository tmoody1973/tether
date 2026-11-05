import { beforeAll, describe, expect, it } from "vitest";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { shopsForLevel, signGrant } from "@/flows/grant";
import { guardianHome } from "@/flows/home";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

let n = 0;
const NOW = new Date("2026-11-05T12:00:00Z");
const now = async () => NOW;

async function seed({ vault = true, grant = true } = {}) {
  n++;
  const fam = await repo.insertFamily(db, { name: "F", teenToken: `home-${n}`, guardianName: "Amara", teenName: "Zoe" });
  await db.insert(t.merchants).values([
    { id: `bb${n}`, name: "Best Buy", domain: `bb${n}.com`, class: "general", opensAtLevel: 1 },
    { id: `bn${n}`, name: "Barnes & Noble", domain: `bn${n}.com`, class: "books", opensAtLevel: 2 },
  ]);
  if (vault) await repo.saveVault(db, fam.id, `PT${n}`);
  if (grant) await signGrant({ db, now }, fam.id, { level: 1 });
  return fam.id;
}

describe("guardianHome (what Amara's home screen reads)", () => {
  it("quiet family: level, week, savings, nothing needs her", async () => {
    const familyId = await seed();
    await repo.appendJournal(db, { familyId, kind: "spend", amountCents: 1200, at: NOW, ref: "p1" });
    await repo.appendJournal(db, { familyId, kind: "week_close", amountCents: 3400, at: new Date("2026-11-01T00:00:00Z"), ref: "2026-W44" });
    const h = await guardianHome(db, familyId, NOW);
    expect(h).toMatchObject({
      teenName: "Zoe", guardianName: "Amara", teenToken: `home-${n}`, level: 1, weeklyCents: 2000,
      spentThisWeekCents: 1200, savingsCents: 3400, paypalSaved: true, grantEnded: false, needsYou: [],
    });
    expect(h.grantVersion).toBe(1);
  });

  it("lists open requests with what they are for, newest rules and PayPal gaps first", async () => {
    const familyId = await seed({ vault: false });
    const cart = { merchantId: `bb${n}`, items: [], totalCents: 1500 };
    const purchase = await repo.insertPurchase(db, {
      familyId, cart, cartHash: "h", decision: { outcome: "NEEDS_APPROVAL", reasons: [], semanticRules: [] }, status: "needs_approval",
    });
    const later = new Date(NOW.getTime() + 86_400_000);
    await db.insert(t.approvals).values([
      { id: `a1-${n}`, familyId, subject: "purchase", subjectId: purchase.id, cartHash: "h", expiresAt: later, note: "falling apart" },
      { id: `a2-${n}`, familyId, subject: "shop", subjectId: "etsy.com", expiresAt: later, note: "for gifts" },
    ]);
    const h = await guardianHome(db, familyId, NOW);
    expect(h.needsYou).toEqual([
      { kind: "paypal" },
      expect.objectContaining({ kind: "approval", id: `a1-${n}`, subject: "purchase", amountCents: 1500, shop: "Best Buy", note: "falling apart" }),
      expect.objectContaining({ kind: "approval", id: `a2-${n}`, subject: "shop", shop: "etsy.com" }),
    ]);
  });

  it("ended or missing rules ask her to sign", async () => {
    const familyId = await seed();
    const h = await guardianHome(db, familyId, new Date(NOW.getTime() + 8 * 86_400_000));
    expect(h.grantEnded).toBe(true);
    expect(h.needsYou).toContainEqual({ kind: "rules" });
    const none = await guardianHome(db, await seed({ grant: false }), NOW);
    expect(none).toMatchObject({ level: null, weeklyCents: 0, grantEnded: true });
    expect(none.needsYou).toContainEqual({ kind: "rules" });
  });

  it("shopsForLevel names the shops a level opens", async () => {
    const familyId = await seed();
    expect(await shopsForLevel(db, familyId, 1, NOW)).toContain("Best Buy");
    expect(await shopsForLevel(db, familyId, 1, NOW)).not.toContain("Barnes & Noble");
    expect(await shopsForLevel(db, familyId, 2, NOW)).toEqual(expect.arrayContaining(["Best Buy", "Barnes & Noble"]));
  });
});
