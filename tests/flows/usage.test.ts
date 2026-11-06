import { beforeAll, describe, expect, it } from "vitest";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import { DAILY_CAPS, takeDaily } from "@/flows/usage";

let db: Db;
let familyId: string;
beforeAll(async () => {
  db = createDb("pglite:memory");
  await migrateDb(db);
  familyId = (await repo.insertFamily(db, { name: "F", teenToken: "u1", guardianName: "G", teenName: "T" })).id;
});

describe("takeDaily", () => {
  const day = Date.parse("2026-11-06T10:00:00Z");
  it("allows up to the cap, then refuses without counting", async () => {
    for (let i = 0; i < DAILY_CAPS.month_ask; i++) expect(await takeDaily(db, familyId, "month_ask", day)).toBe(true);
    expect(await takeDaily(db, familyId, "month_ask", day)).toBe(false);
    expect(await takeDaily(db, familyId, "month_ask", day)).toBe(false);
  });
  it("is per kind and resets the next day", async () => {
    expect(await takeDaily(db, familyId, "shop_agent", day)).toBe(true);
    expect(await takeDaily(db, familyId, "month_ask", day + 24 * 3_600_000)).toBe(true);
  });
  it("cannot overshoot under concurrency", async () => {
    const results = await Promise.all(Array.from({ length: DAILY_CAPS.shop_agent + 20 }, () => takeDaily(db, familyId, "shop_agent", day + 2 * 24 * 3_600_000)));
    expect(results.filter(Boolean)).toHaveLength(DAILY_CAPS.shop_agent);
  });
});
