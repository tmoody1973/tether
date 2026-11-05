import { beforeAll, describe, expect, it } from "vitest";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { now as clockNow } from "@/clock/clock";
import { advanceDemoClock, advanceTarget } from "@/flows/demo";
import { signGrant } from "@/flows/grant";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

const REAL = new Date("2026-11-04T12:00:00Z").getTime(); // a Wednesday
const deps = () => ({ db, now: (familyId: string, conn?: Db) => clockNow(conn ?? db, familyId, REAL) });
let n = 0;

describe("demo clock (D10)", () => {
  it("advanceTarget lands one minute into the next week / month", () => {
    const wed = new Date("2026-11-04T12:00:00Z");
    expect(advanceTarget(wed, "endOfWeek").toISOString()).toBe("2026-11-09T00:01:00.000Z");
    expect(advanceTarget(new Date("2026-11-09T00:01:00Z"), "endOfWeek").toISOString()).toBe("2026-11-16T00:01:00.000Z");
    expect(advanceTarget(new Date("2026-11-08T23:59:00Z"), "endOfWeek").toISOString()).toBe("2026-11-09T00:01:00.000Z");
    expect(advanceTarget(wed, "endOfMonth").toISOString()).toBe("2026-12-01T00:01:00.000Z");
    expect(advanceTarget(new Date("2026-12-15T00:00:00Z"), "endOfMonth").toISOString()).toBe("2027-01-01T00:01:00.000Z");
    expect(advanceTarget(wed, "day").toISOString()).toBe("2026-11-05T12:00:00.000Z");
  });

  it("end of week closes the week; end of month closes every skipped week and reviews the month", async () => {
    n++;
    const fam = await repo.insertFamily(db, { name: "F", teenToken: `demo-${n}`, guardianName: "Amara", teenName: "Zoe" });
    await db.insert(t.merchants).values({ id: `dm${n}`, name: "Gen", domain: `dm${n}.example`, class: "general", opensAtLevel: 1 });
    await signGrant(deps(), fam.id, { level: 1 });

    expect(await advanceDemoClock(deps(), fam.id, "endOfWeek")).toEqual({ weekKeys: ["2026-W45"] });
    expect((await deps().now(fam.id)).toISOString()).toBe("2026-11-09T00:01:00.000Z");

    const r = await advanceDemoClock(deps(), fam.id, "endOfMonth");
    expect(r.weekKeys).toEqual(["2026-W46", "2026-W47", "2026-W48"]);
    // Four unspent weeks ≥ the signed floor: kept four running, so she moves up (and a release is opened).
    expect(r.review).toMatchObject({ action: "PROMOTE", streak: 4, release: { savedCents: 8000, matchCents: 8000 } });
    expect((await repo.getActiveGrant(db, fam.id))?.level).toBe(2);
  });

  it("with no grant yet the clock still moves", async () => {
    n++;
    const fam = await repo.insertFamily(db, { name: "F", teenToken: `demo-${n}`, guardianName: "Amara", teenName: "Zoe" });
    expect(await advanceDemoClock(deps(), fam.id, "endOfMonth")).toEqual({ weekKeys: [], review: undefined });
    expect((await deps().now(fam.id)).toISOString()).toBe("2026-12-01T00:01:00.000Z");
  });
});
