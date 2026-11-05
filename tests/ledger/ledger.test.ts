import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { ledgerView, savingsCents, weekKey, weekRecords } from "@/ledger/ledger";
import type { Cart, Decision } from "@/engine/types";

let db: Db;
let familyId: string;
const now = new Date("2026-11-04T12:00:00Z"); // 2026-W45
beforeAll(async () => {
  db = createDb("pglite:memory");
  await migrateDb(db);
});
let n = 0; // one DB per file; a fresh family per test
beforeEach(async () => {
  familyId = (await repo.insertFamily(db, { name: "F", teenToken: `tok${++n}`, guardianName: "G", teenName: "Z" })).id;
});

const j = (kind: (typeof t.journalKinds)[number], amountCents: number, at = now) =>
  repo.appendJournal(db, { familyId, kind, amountCents, ref: null, note: null, at });

describe("weekKey", () => {
  it("formats ISO weeks and handles year boundaries", () => {
    expect(weekKey(now)).toBe("2026-W45");
    expect(weekKey(new Date("2026-12-31T12:00:00Z"))).toBe("2026-W53");
    expect(weekKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    expect(weekKey(new Date("2027-01-04T00:00:00Z"))).toBe("2027-W01");
    expect(weekKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    expect(weekKey(new Date("2025-12-29T00:00:00Z"))).toBe("2026-W01");
    expect(weekKey(new Date("2024-01-07T23:59:59Z"))).toBe("2024-W01");
  });
});

describe("ledger", () => {
  it("spend_reversal restores weekly budget", async () => {
    await j("spend", 1500);
    await j("spend_reversal", 500);
    expect((await ledgerView(db, familyId, now)).spentThisWeekCents).toBe(1000);
  });

  it("a spend from the previous ISO week does not count this week", async () => {
    await j("spend", 900, new Date("2026-11-01T12:00:00Z")); // Sunday, W44
    await j("spend", 300);
    expect((await ledgerView(db, familyId, now)).spentThisWeekCents).toBe(300);
  });

  it("savings sums unspent of closed weeks", async () => {
    await j("week_close", 700, new Date("2026-10-26T00:00:00Z"));
    await j("week_close", 400, new Date("2026-11-02T00:00:00Z"));
    expect(await savingsCents(db, familyId)).toBe(1100);
    expect((await ledgerView(db, familyId, now)).savingsCents).toBe(1100);
  });

  it("release and invest reduce savings; invest_reversal restores", async () => {
    await j("week_close", 2000);
    await j("release", 500);
    await j("invest", 600);
    await j("invest_reversal", 100);
    expect(await savingsCents(db, familyId)).toBe(1000);
  });

  it("merchantsUsed lists merchants with a paid purchase", async () => {
    const decision: Decision = { outcome: "ALLOW", reasons: [], semanticRules: [] };
    const mk = (merchantId: string, status: repo.PurchaseStatus) => {
      const cart: Cart = { merchantId, items: [], totalCents: 100 };
      return repo.insertPurchase(db, { familyId, cart, cartHash: "h", decision, status });
    };
    await mk("m1", "paid");
    await mk("m1", "paid");
    await mk("m2", "refused");
    await mk("m3", "failed");
    expect([...(await ledgerView(db, familyId, now)).merchantsUsed]).toEqual(["m1"]);
  });

  it("weekRecords returns one ordered record per weeks row with journal spend", async () => {
    await db.insert(t.weeks).values([
      { familyId, weekKey: "2026-W45", allowanceCents: 2000, commitmentCents: 200 },
      { familyId, weekKey: "2026-W44", allowanceCents: 2000, commitmentCents: 200 },
    ]);
    await j("spend", 800, new Date("2026-10-28T00:00:00Z")); // W44
    await j("spend_reversal", 100, new Date("2026-10-29T00:00:00Z"));
    await j("spend", 300);
    expect(await weekRecords(db, familyId)).toEqual([
      { weekKey: "2026-W44", allowanceCents: 2000, spentCents: 700, commitmentCents: 200 },
      { weekKey: "2026-W45", allowanceCents: 2000, spentCents: 300, commitmentCents: 200 },
    ]);
  });
});
