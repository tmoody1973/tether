import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { alpacaBroker } from "@/adapters/alpaca/broker";
import type { Grant } from "@/engine/types";
import { savingsCents } from "@/ledger/ledger";
import { decideApproval } from "@/flows/approvals";
import { confirmRelease } from "@/flows/month";
import { proposeFund, proposeInvestment, resumeInvestment, retryInvestment, settleInvestment, type InvestDeps } from "@/flows/invest";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

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
const mk = (f = fakeFetch(), custodialEnabled = false): { d: InvestDeps; f: typeof f } => ({
  f, d: { db, secret: "s", now: async () => NOW, alpaca: alpacaBroker({ baseUrl: "https://broker.test", key: "k", secret: "sec", custodialEnabled }, f as unknown as typeof fetch) },
});
const NONE = () => undefined as unknown as Response;
const kindsOf = async (fam: string) => (await db.select().from(t.journal).where(eq(t.journal.familyId, fam))).map((j) => j.kind).sort();
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
    const fam = await seed({ level: 1, allow: ["VTI"] });
    const r = await proposeInvestment(mk().d, fam, { symbol: "VTI", amountCents: 1000 }, {});
    expect(r.decision.outcome).toBe("REFUSE");
    expect(r.approvalId).toBeUndefined();
    expect((await row(r.investmentId)).status).toBe("rejected");
  });

  it("approved before a promotion, settled after: the open release leaves nothing to invest; nothing moves (I1)", async () => {
    const fam = await seed();
    const { d, f } = mk();
    const id = await approvedInvestment(d, fam);
    await db.insert(t.releases).values({ id: `rel-${fam}`, familyId: fam, savedCents: 10_000, matchCents: 5_000 });
    expect(await settleInvestment(d, id)).toMatchObject({ status: "rejected", reason: "invest.savings" });
    expect(f.mock.calls.some(([u]) => String(u).endsWith("/transfers"))).toBe(false);
    await confirmRelease(d, `rel-${fam}`, fam);
    expect(await savingsCents(db, fam)).toBe(0);
  });

  it("confirmRelease never takes savings below 0 and records what it took (I1)", async () => {
    const fam = await seed();
    await db.insert(t.releases).values({ id: `rel2-${fam}`, familyId: fam, savedCents: 10_000, matchCents: 5_000 });
    await repo.appendJournal(db, { familyId: fam, kind: "invest", amountCents: 2_500, at: NOW, ref: "x", note: "older invest" });
    await confirmRelease(mk().d, `rel2-${fam}`, fam);
    expect(await savingsCents(db, fam)).toBe(0);
    const [rel] = await db.select().from(t.releases).where(eq(t.releases.id, `rel2-${fam}`));
    expect(rel.savedCents).toBe(7_500);
    const j = (await db.select().from(t.journal).where(eq(t.journal.familyId, fam))).find((x) => x.kind === "release");
    expect(j?.amountCents).toBe(7_500);
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

  it("order rejected -> cash_held, no reversal, retry places a new order", async () => {
    const fam = await seed();
    const { d } = mk(fakeFetch(() => NONE(), "rejected"));
    const id = await approvedInvestment(d, fam);
    expect((await settleInvestment(d, id)).status).toBe("cash_held");
    expect(await savingsCents(db, fam)).toBe(7_500);
    expect(await kindsOf(fam)).toEqual(["invest", "week_close"]);
    const ok = mk(fakeFetch(() => NONE(), "accepted"));
    expect((await retryInvestment(ok.d, id)).status).toBe("queued");
    expect((await row(id)).receiptNote).toBe("This money now belongs to Zoe and can't be taken back.");
  });

  it("retry whose POST response is lost is adopted on the next retry, one order POST per n", async () => {
    const fam = await seed();
    const dead = mk(fakeFetch(() => NONE(), "rejected"));
    const id = await approvedInvestment(dead.d, fam);
    expect((await settleInvestment(dead.d, id)).status).toBe("cash_held");
    let accepted = false;
    const lossy = fakeFetch((p, i) => {
      if (p.includes("by_client_order_id")) return accepted ? json({ id: "ord-lost", status: "accepted" }) : json({ message: "nf" }, 404);
      if (p.endsWith("/orders") && i.method === "POST") { accepted = true; throw new TypeError("response lost"); }
      return NONE();
    });
    const m = mk(lossy);
    expect((await retryInvestment(m.d, id)).status).toBe("cash_held");
    expect((await retryInvestment(m.d, id)).status).toBe("queued");
    expect((await row(id)).orderId).toBe("ord-lost");
    expect(lossy.mock.calls.filter(([u, i]) => String(u).endsWith("/orders") && (i as RequestInit).method === "POST")).toHaveLength(1);
    expect(bodyOf(lossy, "/orders").client_order_id).toBe(`${id}:retry:1`);
  });

  it("a same-amount CANCELED transfer is ignored => needs_review", async () => {
    const fam = await seed();
    const down = mk(fakeFetch((p) => { if (p.endsWith("/transfers")) throw new TypeError("fetch failed"); return NONE(); }));
    const id = await approvedInvestment(down.d, fam);
    await settleInvestment(down.d, id);
    const up = mk(fakeFetch((p, i) => (p.endsWith("/transfers") && i.method === "GET"
      ? json([{ id: "tr-x", amount: "25", created_at: new Date().toISOString(), direction: "INCOMING", status: "CANCELED" }]) : NONE())));
    expect((await resumeInvestment(up.d, id)).status).toBe("needs_review");
  });

  it("deposit 4xx => reversal, savings restored", async () => {
    const fam = await seed();
    const { d } = mk(fakeFetch((p) => (p.endsWith("/transfers") ? json({ message: "bad relationship" }, 422) : NONE())));
    const id = await approvedInvestment(d, fam);
    expect((await settleInvestment(d, id)).status).toBe("rejected");
    expect(await savingsCents(db, fam)).toBe(10_000);
    expect(await kindsOf(fam)).toEqual(["invest", "invest_reversal", "week_close"]);
  });

  it("order 403 after deposit => no reversal, savings still debited, status queued, error stored", async () => {
    const fam = await seed();
    const { d } = mk(fakeFetch((p) => (p.endsWith("/orders") ? json({ message: "insufficient buying power" }, 403) : NONE())));
    const id = await approvedInvestment(d, fam);
    expect((await settleInvestment(d, id)).status).toBe("queued");
    expect(await savingsCents(db, fam)).toBe(7_500);
    expect(await kindsOf(fam)).toEqual(["invest", "week_close"]);
    const r = await row(id);
    expect(r.error).toContain("403");
    expect(r.transferId).toBe("tr-1");
  });

  it("5xx on order keeps invest and returns queued", async () => {
    const fam = await seed();
    const { d } = mk(fakeFetch((p) => (p.endsWith("/orders") ? json({ message: "boom" }, 503) : NONE())));
    const id = await approvedInvestment(d, fam);
    expect((await settleInvestment(d, id)).status).toBe("queued");
    expect(await savingsCents(db, fam)).toBe(7_500);
    expect((await row(id)).error).toContain("503");
  });

  it("network error on deposit keeps the debit and stays depositing", async () => {
    const fam = await seed();
    const { d } = mk(fakeFetch((p) => { if (p.endsWith("/transfers")) throw new TypeError("fetch failed"); return NONE(); }));
    expect((await settleInvestment(d, await approvedInvestment(d, fam))).status).toBe("depositing");
    expect(await savingsCents(db, fam)).toBe(7_500);
  });

  it("resume places the missing order", async () => {
    const fam = await seed();
    const down = mk(fakeFetch((p) => (p.endsWith("/orders") ? json({ message: "boom" }, 503) : NONE())));
    const id = await approvedInvestment(down.d, fam);
    await settleInvestment(down.d, id);
    const up = mk(fakeFetch((p) => (p.includes("by_client_order_id") ? json({ message: "not found" }, 404) : NONE()), "accepted"));
    expect((await resumeInvestment(up.d, id)).status).toBe("queued");
    expect((await row(id)).orderId).toBe("ord-1");
    expect(up.f.mock.calls.filter(([u]) => String(u).endsWith("/orders"))).toHaveLength(1);
  });

  it("resume does not double-place when by_client_order_id finds one", async () => {
    const fam = await seed();
    const down = mk(fakeFetch((p) => (p.endsWith("/orders") ? json({ message: "boom" }, 503) : NONE())));
    const id = await approvedInvestment(down.d, fam);
    await settleInvestment(down.d, id);
    const up = mk(fakeFetch((p) => (p.includes("by_client_order_id") ? json({ id: "ord-9", status: "filled" }) : NONE())));
    expect((await resumeInvestment(up.d, id)).status).toBe("filled");
    expect(up.f.mock.calls.some(([u, i]) => String(u).endsWith("/orders") && (i as RequestInit).method === "POST")).toBe(false);
    expect((await row(id)).orderId).toBe("ord-9");
  });

  it("resume refreshes a queued order that later got rejected -> cash_held", async () => {
    const fam = await seed();
    const { d } = mk();
    const id = await approvedInvestment(d, fam);
    await settleInvestment(d, id);
    const later = mk(fakeFetch((p) => (p.includes("/orders/") ? json({ status: "canceled" }) : NONE())));
    expect((await resumeInvestment(later.d, id)).status).toBe("cash_held");
    expect(await savingsCents(db, fam)).toBe(7_500);
  });

  it("depositing-without-transfer with no match => needs_review and no deposit call", async () => {
    const fam = await seed();
    const down = mk(fakeFetch((p) => { if (p.endsWith("/transfers")) throw new TypeError("fetch failed"); return NONE(); }));
    const id = await approvedInvestment(down.d, fam);
    await settleInvestment(down.d, id);
    const up = mk(fakeFetch((p, i) => (p.endsWith("/transfers") && i.method === "GET" ? json([]) : NONE())));
    expect((await resumeInvestment(up.d, id)).status).toBe("needs_review");
    expect(up.f.mock.calls.some(([u, i]) => String(u).endsWith("/transfers") && (i as RequestInit).method === "POST")).toBe(false);
    expect(await savingsCents(db, fam)).toBe(7_500);
  });

  it("depositing-without-transfer finds the matching transfer and continues", async () => {
    const fam = await seed();
    const down = mk(fakeFetch((p) => { if (p.endsWith("/transfers")) throw new TypeError("fetch failed"); return NONE(); }));
    const id = await approvedInvestment(down.d, fam);
    await settleInvestment(down.d, id);
    const created = new Date().toISOString();
    const up = mk(fakeFetch((p, i) => (p.endsWith("/transfers") && i.method === "GET"
      ? json([{ id: "tr-found", amount: "25", created_at: created, direction: "INCOMING", status: "COMPLETE" }]) : NONE())));
    expect((await resumeInvestment(up.d, id)).status).toBe("queued");
    expect((await row(id)).transferId).toBe("tr-found");
  });

  it("settleInvestment twice is a no-op", async () => {
    const fam = await seed();
    const { d, f } = mk();
    const id = await approvedInvestment(d, fam);
    expect((await settleInvestment(d, id)).status).toBe("queued");
    const posts = () => f.mock.calls.filter(([, i]) => (i as RequestInit).method === "POST" && !String((i as RequestInit).body).includes("grant_type")).length;
    const before = posts();
    expect((await settleInvestment(d, id)).status).toBe("queued"); // may refresh the order (GET), never moves money again
    expect(posts()).toBe(before);
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

  it("custodial payload sent when ALPACA_CUSTODIAL_ENABLED=true (custodialEnabled)", async () => {
    const { d, f } = mk(fakeFetch(), true);
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
