import { beforeAll, describe, expect, it } from "vitest";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { now as clockNow } from "@/clock/clock";
import { signGrant } from "@/flows/grant";
import { allowedFunds } from "@/flows/teenInvest";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

let n = 0;
/** A Level 3 family whose signed rules allow `onRules`, and whose fund_allowlist table holds `added`. */
async function family(onRules: string[], added: string[]) {
  n++;
  const fam = await repo.insertFamily(db, { name: "F", teenToken: `fl-${n}`, guardianName: "Amara", teenName: "Zoe" });
  await signGrant({ db, now: (id, conn) => clockNow(conn ?? db, id) }, fam.id, { level: 3, fundAllowlist: onRules });
  for (const symbol of added) await db.insert(t.fundAllowlist).values({ familyId: fam.id, symbol });
  return fam.id;
}

describe("allowedFunds (Amara's fund list)", () => {
  it("lists a fund her signed rules allow even when the fund_allowlist table is empty", async () => {
    expect(await allowedFunds(db, await family(["VTI"], []))).toEqual(["VTI"]);
  });

  it("lists a fund once when both places have it, rules first, then the ones she added", async () => {
    expect(await allowedFunds(db, await family(["VTI"], ["VOO", "VTI"]))).toEqual(["VTI", "VOO"]);
  });

  it("is empty with no rules and no added funds, and ignores another family's funds", async () => {
    await family(["QQQ"], ["SPY"]);
    expect(await allowedFunds(db, await family([], []))).toEqual([]);
  });
});
