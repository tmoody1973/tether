import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { alpacaBroker } from "@/adapters/alpaca/broker";
import type { Grant } from "@/engine/types";
import { savingsCents } from "@/ledger/ledger";
import { decideApproval } from "@/flows/approvals";
import { proposeFund, proposeInvestment, settleInvestment, type InvestDeps } from "@/flows/invest";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });
afterEach(() => { delete process.env.ALPACA_CUSTODIAL_ENABLED; });

const NOW = new Date("2026-11-04T12:00:00Z");
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
type Handler = (path: string, init: RequestInit) => Response | Promise<Response>;

/** Fake Alpaca: happy path by default; `over` can answer any path first. */
function fakeFetch(over: Handler = () => undefined as unknown as Response, orderStatus = "accepted") {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const i = init ?? {};
    if (u.includes("authx")) return json({ access_token: "AT", expires_in: 900 });
    const path = new URL(u).pathname;
    return (await over(path, i)) ?? (
      path === "/v1/accounts" ? json({ id: "acct-1", status: "SUBMITTED" })
      : path.endsWith("/ach_relationships") && i.method === "GET" ? json([{ id: "rel-1" }])
      : path.endsWith("/transfers") ? json({ id: "tr-1" })
      : path.endsWith("/orders") ? json({ id: "ord-1", status: orderStatus })
      : json({ message: "unexpected" }, 404));
  });
}
const bodyOf = (f: ReturnType<typeof fakeFetch>, suffix: string) => {
  const c = f.mock.calls.find(([u]) => String(u).endsWith(suffix));
  return c ? JSON.parse(String((c[1] as RequestInit).body)) : undefined;
};

let n = 0;
async function seed(opts: { level?: 1 | 2 | 3; savings?: number; allow?: string[] } = {}) {
  n++;
  const familyId = (await repo.insertFamily(db, { name: "F", teenToken: `inv${n}`, guardianName: "Amara", teenName: "Zoe" })).id;
  const body: Grant = {
    id: `ig${n}`, familyId, version: 1, level: opts.level ?? 3, weeklyCents: 800, commitmentFloorPct: 10, matchPct: 50,
    constraints: [], fundAllowlist: opts.allow ?? [], signedAt: "2026-11-02T00:00:00Z", expiresAt: "2026-12-09T00:00:00Z",
  };
  await repo.insertGrant(db, { id: body.id, familyId, version: 1, level: body.level, body, signedAt: NOW, expiresAt: new Date("2026-12-09"), status: "active" });
  if (opts.savings !== 0) await repo.appendJournal(db, { familyId, kind: "week_close", amountCents: opts.savings ?? 10_000, at: new Date("2026-11-01T00:00:00Z") });
  return familyId;
}
const mk = (f = fakeFetch()): { d: InvestDeps; f: typeof f } => ({
  f, d: { db, secret: "s", now: async () => NOW, alpaca: alpacaBroker({ baseUrl: "https://broker.test", key: "k", secret: "sec" }, f as unknown as typeof fetch) },
});
async function approvedInvestment(d: InvestDeps, familyId: string, amountCents = 2500) {
  await db.insert(t.fundAllowlist).values({ familyId, symbol: "VTI" }).onConflictDoNothing();
  const r = await proposeInvestment(d, familyId, { symbol: "VTI", amountCents }, { why: "I want to own part of the whole market" });
  await decideApproval(d, r.approvalId!, "approved");
  return r.investmentId;
}
const row = async (id: string) => (await db.select().from(t.investments).where(eq(t.investments.id, id)))[0];

describe("proposeInvestment / settleInvestment", () => {
  it("answers stored with investment", async () => {
    const fam = await seed({ allow: ["VTI"] });
    const { d } = mk();
    const r = await proposeInvestment(d, fam, { symbol: "vti", amountCents: 1000 }, { why: "long term", risk: "it can go down" });
    expect(r.decision.outcome).toBe("NEEDS_APPROVAL");
    expect((await row(r.investmentId)).answers).toEqual({ why: "long term", risk: "it can go down" });
  });

  it("refused proposal opens no approval", async () => {
    const fam = await seed({ level: 2, allow: ["VTI"] });
    const r = await proposeInvestment(mk().d, fam, { symbol: "VTI", amountCents: 1000 }, {});
    expect(r.decision.outcome).toBe("REFUSE");
    expect(r.approvalId).toBeUndefined();
    expect((await row(r.investmentId)).status).toBe("rejected");
  });

  it("order accepted (market closed) -> status queued", async () => {
    const fam = await seed();
    const { d, f } = mk(fakeFetch(() => undefined as unknown as Response, "accepted"));
    const id = await approvedInvestment(d, fam);
    expect(await savingsCents(db, fam)).toBe(10_000);
    expect(await settleInvestment(d, id)).toEqual({ status: "queued" });
    expect(await savingsCents(db, fam)).toBe(7_500);
    expect(bodyOf(f, "/orders")).toMatchObject({ symbol: "VTI", notional: "25.00", side: "buy", client_order_id: id });
    expect(bodyOf(f, "/transfers").amount).toBe("25.00");
  });

  it("filled order -> filled", async () => {
    const fam = await seed();
    const { d } = mk(fakeFetch(() => undefined as unknown as Response, "filled"));
    expect((await settleInvestment(d, await approvedInvestment(d, fam))).status).toBe("filled");
  });

  it("order rejected -> invest_reversal restores savings", async () => {
    const fam = await seed();
    const { d } = mk(fakeFetch(() => undefined as unknown as Response, "rejected"));
    const id = await approvedInvestment(d, fam);
    expect((await settleInvestment(d, id)).status).toBe("rejected");
    expect(await savingsCents(db, fam)).toBe(10_000);
    const kinds = (await db.select().from(t.journal).where(eq(t.journal.familyId, fam))).map((j) => j.kind).sort();
    expect(kinds).toEqual(["invest", "invest_reversal", "week_close"]);
  });

  it("4xx on order reverses; 5xx on order keeps invest and returns queued", async () => {
    const f4 = await seed();
    const m4 = mk(fakeFetch((p) => (p.endsWith("/orders") ? json({ message: "insufficient buying power" }, 403) : (undefined as unknown as Response))));
    expect((await settleInvestment(m4.d, await approvedInvestment(m4.d, f4))).status).toBe("rejected");
    expect(await savingsCents(db, f4)).toBe(10_000);

    const f5 = await seed();
    const m5 = mk(fakeFetch((p) => (p.endsWith("/orders") ? json({ message: "boom" }, 503) : (undefined as unknown as Response))));
    const id = await approvedInvestment(m5.d, f5);
    expect((await settleInvestment(m5.d, id)).status).toBe("queued");
    expect(await savingsCents(db, f5)).toBe(7_500); // never shown as returned
    expect((await row(id)).error).toContain("503");
  });

  it("network error keeps invest and returns queued", async () => {
    const fam = await seed();
    const { d } = mk(fakeFetch((p) => { if (p.endsWith("/transfers")) throw new TypeError("fetch failed"); return undefined as unknown as Response; }));
    expect((await settleInvestment(d, await approvedInvestment(d, fam))).status).toBe("queued");
    expect(await savingsCents(db, fam)).toBe(7_500);
  });

  it("settleInvestment twice is a no-op", async () => {
    const fam = await seed();
    const { d, f } = mk();
    const id = await approvedInvestment(d, fam);
    expect((await settleInvestment(d, id)).status).toBe("queued");
    const calls = f.mock.calls.length;
    expect((await settleInvestment(d, id)).status).toBe("queued");
    expect(f.mock.calls.length).toBe(calls);
    expect(await savingsCents(db, fam)).toBe(7_500);
  });

  it("unapproved investment does not move money", async () => {
    const fam = await seed({ allow: ["VTI"] });
    const { d, f } = mk();
    const r = await proposeInvestment(d, fam, { symbol: "VTI", amountCents: 1000 }, {});
    expect((await settleInvestment(d, r.investmentId)).status).toBe("proposed");
    expect(f).not.toHaveBeenCalled();
  });

  it("account is created once per family and reused", async () => {
    const fam = await seed();
    const { d, f } = mk();
    await settleInvestment(d, await approvedInvestment(d, fam, 1000));
    await settleInvestment(d, await approvedInvestment(d, fam, 1000));
    expect(f.mock.calls.filter(([u, i]) => String(u).endsWith("/v1/accounts") && (i as RequestInit).method === "POST")).toHaveLength(1);
    const [fr] = await db.select().from(t.families).where(eq(t.families.id, fam));
    expect(fr.alpacaAccountId).toBe("acct-1");
  });
});

describe("stand-in account", () => {
  const guardian = { givenName: "A", familyName: "B", email: "a@example.com", phone: "1", dateOfBirth: "1980-01-01", taxId: "1", street: "s", city: "c", state: "CA", postalCode: "1" };
  const minor = { givenName: "Z", familyName: "B", email: "z@example.com", dateOfBirth: "2010-01-01", taxId: "2", state: "CA" };

  it("stand-in account when custodial disabled returns custodial:false", async () => {
    const { d, f } = mk();
    const r = await d.alpaca.createCustodialAccount(guardian, minor);
    expect(r).toEqual({ accountId: "acct-1", custodial: false });
    const body = bodyOf(f, "/v1/accounts");
    expect(body.account_type).toBe("trading");
    expect(body.minor_identity).toBeUndefined();
  });

  it("custodial payload sent when ALPACA_CUSTODIAL_ENABLED=true", async () => {
    process.env.ALPACA_CUSTODIAL_ENABLED = "true";
    const { d, f } = mk();
    expect((await d.alpaca.createCustodialAccount(guardian, minor)).custodial).toBe(true);
    const body = bodyOf(f, "/v1/accounts");
    expect(body.account_type).toBe("custodial");
    expect(body.minor_identity.given_name).toBe("Z");
  });

  it("bearer token is cached across calls", async () => {
    const { d, f } = mk();
    await d.alpaca.getOrder("a", "o").catch(() => undefined);
    await d.alpaca.getOrder("a", "o").catch(() => undefined);
    expect(f.mock.calls.filter(([u]) => String(u).includes("authx"))).toHaveLength(1);
  });
});

describe("proposeFund", () => {
  it("fund not on allowlist until Amara approves proposeFund", async () => {
    const fam = await seed();
    const { d } = mk();
    const { proposalId, approvalId } = await proposeFund(d, fam, "vti", { why: "broad market" });
    const list = () => db.select().from(t.fundAllowlist).where(eq(t.fundAllowlist.familyId, fam));
    expect(await list()).toHaveLength(0);
    expect((await proposeInvestment(d, fam, { symbol: "VTI", amountCents: 500 }, {})).decision.outcome).toBe("REFUSE");
    await decideApproval(d, approvalId, "approved");
    expect((await list()).map((r) => r.symbol)).toEqual(["VTI"]);
    expect((await db.select().from(t.fundProposals).where(eq(t.fundProposals.id, proposalId)))[0].status).toBe("approved");
    expect((await proposeInvestment(d, fam, { symbol: "VTI", amountCents: 500 }, {})).decision.outcome).toBe("NEEDS_APPROVAL");
  });

  it("declined fund never reaches the allowlist", async () => {
    const fam = await seed();
    const { d } = mk();
    const { approvalId } = await proposeFund(d, fam, "QQQ", {});
    await decideApproval(d, approvalId, "declined");
    expect(await db.select().from(t.fundAllowlist).where(eq(t.fundAllowlist.familyId, fam))).toHaveLength(0);
  });
});
