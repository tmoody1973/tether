import { beforeAll, describe, expect, it, vi } from "vitest";

// Decision 028, review LOW-1: a batch of teens is made in one transaction. Here the second insert fails (a database
// blip, stood in for by a teen called "Boom"): nothing is made and the day's count doesn't move.
vi.mock("@/db/repo", async (orig) => {
  const real = await orig<typeof import("@/db/repo")>();
  return {
    ...real,
    insertFamily: async (...a: Parameters<typeof real.insertFamily>) => {
      if (a[1].teenName === "Boom") throw new Error("connection reset");
      return real.insertFamily(...a);
    },
  };
});
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { startFamilies } from "@/flows/start";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

describe("startFamilies is all or none", () => {
  it("an insert failing mid-batch makes none and leaves the site count as it was", async () => {
    const who = { sub: "S-boom", email: "boom@example.com" };
    await expect(startFamilies(db, who, [{ teenName: "Zoe", age: 15 }, { teenName: "Boom", age: 14 }, { teenName: "Kofi", age: 13 }]))
      .rejects.toThrow("connection reset");
    expect(await db.select().from(t.families).where(eq(t.families.paypalSub, "S-boom"))).toHaveLength(0);
    expect(await db.select().from(t.usagePool)).toHaveLength(0);
    const made = await startFamilies(db, who, [{ teenName: "Zoe", age: 15 }, { teenName: "Kofi", age: 13 }]);
    expect(made?.map((f) => f.teenName)).toEqual(["Zoe", "Kofi"]);
    expect((await db.select().from(t.usagePool))[0]?.count).toBe(2);
  });
});
