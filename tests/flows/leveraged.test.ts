// Leveraged, inverse and daily-target products can't be proposed (brief E, part 3): Zoe's propose flow and the
// engine refuse them, and Amara's yes refuses a proposal for one that already exists (defence in depth).
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { signGrant } from "@/flows/grant";
import { ApprovalError } from "@/flows/approvals";
import { approveAndSettle, type ApproveDeps } from "@/flows/approve";
import { proposeFund, proposeInvestment } from "@/flows/invest";
import { proposeFromTeen, type Answers } from "@/flows/teenInvest";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

const NOW = new Date("2026-11-04T12:00:00Z");
const ANSWERS: Answers = { why: "It moves fast", sell: "If it went down a lot", drop: "Upset, honestly" };
const TQQQ = "ProShares UltraPro QQQ";
const NAMES: Record<string, string> = { TQQQ, VTI: "Vanguard Total Stock Market ETF", AAPL: "Apple Inc. Common Stock" };
const no = async (): Promise<never> => { throw new Error("unused in this test"); };

const deps = (assetName: ApproveDeps["assetName"] = async (s) => NAMES[s] ?? null): ApproveDeps => ({
  db, now: async () => NOW, secret: "s",
  paypal: { configured: false, request: no },
  channel3: { search: no, lookup: no, retrieve: no, websites: no, shopsSelling: no },
  classifier: { ask: async () => ({ probability: null, model: "none", modelVersion: "none" }) },
  alpaca: () => { throw new Error("alpaca not configured"); },
  assetName,
});

let n = 0;
async function seed(fundAllowlist: string[] = []) {
  n++;
  const fam = await repo.insertFamily(db, { name: "F", teenToken: `lev-${n}`, guardianName: "Amara", teenName: "Zoe" });
  await signGrant({ db, now: async () => NOW }, fam.id, { level: 2, fundAllowlist });
  await repo.appendJournal(db, { familyId: fam.id, kind: "week_close", amountCents: 2000, at: NOW, ref: "2026-W44", note: null });
  return fam.id;
}
const rows = async (familyId: string) => ({
  inv: await db.select().from(t.investments).where(eq(t.investments.familyId, familyId)),
  props: await db.select().from(t.fundProposals).where(eq(t.fundProposals.familyId, familyId)),
});

describe("Zoe can't propose a leveraged product", () => {
  it("off Amara's list: refused, and nothing is sent to Amara", async () => {
    const fam = await seed();
    expect(await proposeFromTeen(deps(), fam, "TQQQ", 500, ANSWERS, TQQQ)).toEqual({ ok: false, error: "leveraged" });
    expect(await rows(fam)).toEqual({ inv: [], props: [] });
    expect(await db.select().from(t.approvals).where(eq(t.approvals.familyId, fam))).toEqual([]);
  });

  it("even already on her signed list: the engine refuses it (invest.leveraged) and nothing reaches Amara", async () => {
    const fam = await seed(["TQQQ"]);
    expect(await proposeFromTeen(deps(), fam, "TQQQ", 500, ANSWERS, TQQQ)).toEqual({ ok: false, error: "leveraged" });
    const { decision, approvalId } = await proposeInvestment(deps(), fam, { symbol: "TQQQ", amountCents: 500, name: TQQQ }, {});
    expect(decision.reasons.map((r) => r.constraint)).toContain("invest.leveraged");
    expect(approvalId).toBeUndefined();
    expect((await rows(fam)).inv.every((r) => r.status === "rejected")).toBe(true);
  });

  it("a stock with a plain name goes through as before", async () => {
    const fam = await seed();
    expect(await proposeFromTeen(deps(), fam, "AAPL", 500, ANSWERS, NAMES.AAPL)).toEqual({ ok: true, sent: "fund" });
  });
});

describe("Amara's yes refuses a proposal for one that already exists", () => {
  it("an add-to-list proposal: refused, nothing added, the request stays answerable", async () => {
    const fam = await seed();
    const { approvalId } = await proposeFund(deps(), fam, "TQQQ", {}); // made before this rule existed
    await expect(approveAndSettle(deps(), fam, approvalId)).rejects.toThrow(ApprovalError);
    expect(await db.select().from(t.fundAllowlist).where(eq(t.fundAllowlist.familyId, fam))).toEqual([]);
    const [a] = await db.select().from(t.approvals).where(eq(t.approvals.id, approvalId));
    expect(a.result).toBeNull();
  });

  it("an investment proposal: refused before anything moves", async () => {
    const fam = await seed(["TQQQ"]);
    const { approvalId } = await proposeInvestment(deps(), fam, { symbol: "TQQQ", amountCents: 500 }, {}); // no name then
    await expect(approveAndSettle(deps(), fam, approvalId!)).rejects.toThrow(ApprovalError);
    expect((await rows(fam)).inv[0].status).toBe("proposed");
  });

  it("a plain fund is approved as before; a name lookup that fails doesn't block her yes (the propose check is the gate)", async () => {
    const fam = await seed();
    const { approvalId } = await proposeFund(deps(), fam, "VTI", {});
    expect(await approveAndSettle(deps(), fam, approvalId)).toBe("fund");
    const other = await seed();
    const { approvalId: a2 } = await proposeFund(deps(), other, "AAPL", {});
    expect(await approveAndSettle(deps(async () => { throw new Error("Alpaca down"); }), other, a2)).toBe("fund");
  });
});
