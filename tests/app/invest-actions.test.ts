import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { clockFor } from "@/clock/clock";
import { LEVERAGED_TEXT } from "@/engine/invest";
import { signGrant } from "@/flows/grant";

// The database, Alpaca's asset list and the teen deps are test ones; everything else is the real action.
let testDb: Db;
const ASSETS = [
  { symbol: "TQQQ", name: "ProShares UltraPro QQQ", exchange: "NASDAQ", fractionable: true },
  { symbol: "AAPL", name: "Apple Inc. Common Stock", exchange: "NASDAQ", fractionable: true },
];
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: async () => testDb }));
vi.mock("@/adapters/alpaca/data", async (orig) => ({
  ...(await orig<typeof import("@/adapters/alpaca/data")>()),
  marketFromEnv: () => ({ searchAssets: async (q: string) => ASSETS.filter((a) => a.symbol === q.toUpperCase()) }),
}));
vi.mock("@/app/t/teenDeps", () => ({ teenDeps: (db: Db) => ({ db, now: clockFor(db), notify: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));

import { proposeAction } from "@/app/t/[token]/invest/actions";

const TOKEN = "invest-action-teen-token";
let familyId: string;
beforeAll(async () => {
  testDb = createDb("pglite:memory"); await migrateDb(testDb);
  const fam = await repo.insertFamily(testDb, { name: "F", teenToken: TOKEN, guardianName: "Amara", teenName: "Zoe" });
  familyId = fam.id;
  await signGrant({ db: testDb, now: clockFor(testDb) }, fam.id, { level: 2, fundAllowlist: ["TQQQ"] });
  await repo.appendJournal(testDb, { familyId: fam.id, kind: "week_close", amountCents: 2000, at: new Date(), ref: "2026-W44", note: null });
});

const form = (symbol: string) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ token: TOKEN, symbol, why: "It moves fast", sell: "If it dropped a lot", drop: "Upset, honestly", amount: "5" })) f.set(k, v);
  return f;
};

describe("proposeAction", () => {
  it("refuses a leveraged symbol posted straight to the server, keeping her words, and stores nothing", async () => {
    const r = await proposeAction({}, form("TQQQ")); // on her signed list, so only the leveraged rule stops it
    expect(r.error).toBe(LEVERAGED_TEXT);
    expect(r.values?.why).toBe("It moves fast");
    expect(await testDb.select().from(t.investments).where(eq(t.investments.familyId, familyId))).toEqual([]);
    expect(await testDb.select().from(t.approvals).where(eq(t.approvals.familyId, familyId))).toEqual([]);
  });

  it("a stock goes through to Amara as an add-to-list request", async () => {
    await expect(proposeAction({}, form("AAPL"))).rejects.toThrow(`REDIRECT /t/${TOKEN}/invest/AAPL?sent=fund`);
  });
});
