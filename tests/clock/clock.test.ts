import { beforeEach, describe, expect, it } from "vitest";
import { createDb, migrateDb, type Db } from "@/db/client";
import { insertFamily } from "@/db/repo";
import { advance, now } from "@/clock/clock";

const DAY = 86_400_000;
const REAL = Date.UTC(2026, 10, 5);
let db: Db;
let familyId: string;
beforeEach(async () => {
  db = createDb("pglite:memory");
  await migrateDb(db);
  familyId = (await insertFamily(db, { name: "F", teenToken: "t", guardianName: "G", teenName: "T" })).id;
});

describe("clock", () => {
  it("now equals real time before any advance", async () => {
    expect((await now(db, familyId, REAL)).getTime()).toBe(REAL);
  });
  it("now reflects offset after advance(7 days)", async () => {
    await advance(db, familyId, 7 * DAY);
    await advance(db, familyId, 0);
    expect((await now(db, familyId, REAL)).getTime()).toBe(REAL + 7 * DAY);
  });
  it("throws for unknown family", async () => {
    await expect(now(db, "missing", REAL)).rejects.toThrow();
  });
});
