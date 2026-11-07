import { and, eq, gt, inArray, isNull, isNotNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { appendJournal, consumeToken, getActiveGrant } from "@/db/repo";
import { availableSavingsCents } from "@/ledger/ledger";
import { decideInvestment, investReceiptNote, type InvestProposal } from "@/engine/invest";
import { cartHash } from "@/engine/hash";
import { mintToken } from "@/engine/token";
import type { Cart, Decision, Grant } from "@/engine/types";
import { AlpacaError, dollars, type AlpacaBroker, type GuardianKyc, type MinorIdentity } from "@/adapters/alpaca/broker";
import type { Deps } from "@/flows/purchase";
import { requestApproval } from "@/flows/approvals";
import { ALPACA_ACCOUNTS_PER_DAY, AccountCapError } from "@/flows/start";
import { takePool } from "@/flows/usage";

export type InvestDeps = Pick<Deps, "db" | "secret" | "now"> & { alpaca: AlpacaBroker };
type InvestmentStatus = (typeof t.investments.$inferSelect)["status"];
export type SettleInvestmentResult = { status: InvestmentStatus; reason?: string };

const NO_GRANT: Decision = {
  outcome: "REFUSE", semanticRules: [],
  reasons: [{ constraint: "no_active_grant", detail: "No active grant - failing closed" }],
};
const SYMBOL = /^[A-Z][A-Z.]{0,5}$/;
const normSymbol = (s: string) => {
  const u = s.trim().toUpperCase();
  if (!SYMBOL.test(u)) throw new Error(`"${s}" is not a fund symbol`);
  return u;
};
const investCart = (symbol: string, amountCents: number): Cart => ({
  merchantId: `alpaca:${symbol}`, items: [{ sku: symbol, title: `Invest in ${symbol}`, qty: 1, unitCents: amountCents }], totalCents: amountCents,
});

/** Grant allowlist plus funds Amara approved via proposeFund. */
async function withAllowlist(db: Db, grant: Grant): Promise<Grant> {
  const rows = await db.select({ s: t.fundAllowlist.symbol }).from(t.fundAllowlist).where(eq(t.fundAllowlist.familyId, grant.familyId));
  return { ...grant, fundAllowlist: [...new Set([...grant.fundAllowlist, ...rows.map((r) => r.s)])] };
}

// ---- propose ----------------------------------------------------------------

export async function proposeInvestment(
  deps: Pick<InvestDeps, "db" | "now">, familyId: string, p: InvestProposal, answers: Record<string, string>,
): Promise<{ investmentId: string; decision: Decision; approvalId?: string }> {
  const { db } = deps;
  const symbol = normSymbol(p.symbol);
  const grant = await getActiveGrant(db, familyId);
  const decision = grant
    ? decideInvestment(await withAllowlist(db, grant.body), { symbol, amountCents: p.amountCents, name: p.name }, await availableSavingsCents(db, familyId))
    : NO_GRANT;
  const investmentId = crypto.randomUUID();
  await db.insert(t.investments).values({
    id: investmentId, familyId, symbol, amountCents: p.amountCents, answers,
    status: decision.outcome === "REFUSE" ? "rejected" : "proposed",
  });
  if (decision.outcome === "REFUSE") return { investmentId, decision };
  const { approvalId } = await requestApproval(deps, familyId, "investment", investmentId, cartHash(investCart(symbol, p.amountCents)));
  return { investmentId, decision, approvalId };
}

export async function proposeFund(
  deps: Pick<InvestDeps, "db" | "now">, familyId: string, symbol: string, answers: Record<string, string>,
): Promise<{ proposalId: string; approvalId: string }> {
  const proposalId = crypto.randomUUID();
  await deps.db.insert(t.fundProposals).values({ id: proposalId, familyId, symbol: normSymbol(symbol), answers, status: "proposed" });
  const { approvalId } = await requestApproval(deps, familyId, "fund", proposalId, null);
  return { proposalId, approvalId };
}

// ---- settle -----------------------------------------------------------------

/** Fake demo identities: this is a sandbox, there is no real KYC data anywhere. */
function demoIdentities(f: typeof t.families.$inferSelect): { guardian: GuardianKyc; minor: MinorIdentity } {
  const tag = f.id.replace(/[^a-z0-9]/gi, "").slice(0, 12);
  return {
    guardian: { givenName: f.guardianName, familyName: "Demo", email: `tether-${tag}-${Date.now()}@example.com`, phone: "555-676-7788",
      dateOfBirth: "1980-01-01", taxId: "661-55-4321", street: "20 N San Mateo Dr", city: "San Mateo", state: "CA", postalCode: "94401" },
    minor: { givenName: f.teenName, familyName: "Demo", email: `teen-${tag}@example.com`, dateOfBirth: "2010-01-01", taxId: "666-54-4321", state: "CA" },
  };
}

/** One account per family, created once. Losing the compare-and-set race just means one orphan sandbox account. */
export async function ensureAccount(deps: Pick<InvestDeps, "db" | "alpaca">, familyId: string): Promise<string> {
  const { db } = deps;
  const [f] = await db.select().from(t.families).where(eq(t.families.id, familyId));
  if (!f) throw new Error(`unknown family ${familyId}`);
  if (f.alpacaAccountId) return f.alpacaAccountId;
  // Public demo (decision 026): self-started families share a daily allowance of new Alpaca accounts.
  if (f.paypalSub && !(await takePool(db, "alpaca_account", ALPACA_ACCOUNTS_PER_DAY))) throw new AccountCapError();
  const { guardian, minor } = demoIdentities(f);
  const { accountId } = await deps.alpaca.createCustodialAccount(guardian, minor);
  const [won] = await db.update(t.families).set({ alpacaAccountId: accountId })
    .where(and(eq(t.families.id, familyId), isNull(t.families.alpacaAccountId))).returning({ id: t.families.alpacaAccountId });
  if (won) return accountId;
  const [again] = await db.select({ a: t.families.alpacaAccountId }).from(t.families).where(eq(t.families.id, familyId));
  return again!.a ?? accountId;
}

type Inv = typeof t.investments.$inferSelect;
const getInv = async (db: Db, id: string): Promise<Inv | null> =>
  (await db.select().from(t.investments).where(eq(t.investments.id, id)))[0] ?? null;
const patch = (db: Db, id: string, v: Partial<Inv>) => db.update(t.investments).set(v).where(eq(t.investments.id, id));
const lockFamily = (db: Db, familyId: string) =>
  db.select({ id: t.families.id }).from(t.families).where(eq(t.families.id, familyId)).for("update");

/**
 * R23: once deposit() has returned, the money is in Zoe's investing account and Tether NEVER appends invest_reversal.
 * Only a definite (4xx) failure of the deposit itself reverses.
 *
 * After Amara approves: debit savings, fund the account, place the order. Idempotent: only an `approved`
 * investment moves, and it leaves `approved` inside the family-row lock, so a second call returns the stored status.
 */
export async function settleInvestment(deps: InvestDeps, investmentId: string): Promise<SettleInvestmentResult> {
  const { db } = deps;
  const first = await getInv(db, investmentId);
  if (!first) throw new Error(`unknown investment ${investmentId}`);
  await resumeInvestments(deps, first.familyId);
  const inv = (await getInv(db, investmentId))!;
  if (inv.status !== "approved") return { status: inv.status };
  const now = await deps.now(inv.familyId);
  const [ok] = await db.select({ id: t.approvals.id }).from(t.approvals).where(and(
    eq(t.approvals.subject, "investment"), eq(t.approvals.subjectId, investmentId),
    eq(t.approvals.result, "approved"), gt(t.approvals.expiresAt, now))).limit(1);
  if (!ok) return closeUnfunded(db, inv, "APPROVAL_EXPIRED");

  let accountId: string;
  try { accountId = await ensureAccount(deps, inv.familyId); } catch (e) {
    if (e instanceof AccountCapError) return closeUnfunded(db, inv, "ACCOUNTS_USED_UP"); // calm refusal: nothing debited
    await patch(db, inv.id, { error: errText(e) }); // nothing debited yet; still `approved`, safe to retry
    return { status: "approved", reason: "ACCOUNT_UNAVAILABLE" };
  }

  const locked = await debit(deps, inv, accountId, now);
  if (locked !== "ok") return locked;

  let transferId: string;
  try {
    transferId = (await deps.alpaca.deposit(accountId, inv.amountCents)).transferId;
  } catch (e) {
    if (e instanceof AlpacaError && !e.outcomeUnknown) return reverse(deps, inv, errText(e), now); // nothing moved
    await patch(db, inv.id, { error: errText(e) }); // maybe moved: stays `depositing`, resume reconciles by listing transfers
    return { status: "depositing", reason: "OUTCOME_UNKNOWN" };
  }
  await patch(db, inv.id, { transferId }); // deposited: no reversal from here on
  return placeOrder(deps, { ...inv, alpacaAccountId: accountId, transferId }, inv.id);
}

/** Under the family-row lock: re-check, mint + consume the token, append the `invest` debit, mark `depositing`. */
async function debit(deps: InvestDeps, inv: Inv, accountId: string, now: Date): Promise<"ok" | SettleInvestmentResult> {
  return deps.db.transaction(async (tx) => {
    await lockFamily(tx, inv.familyId);
    const cur = await getInv(tx, inv.id);
    if (cur?.status !== "approved") return { status: cur?.status ?? "rejected" };
    const grant = await getActiveGrant(tx, inv.familyId);
    const d = grant
      ? decideInvestment(await withAllowlist(tx, grant.body), { symbol: inv.symbol, amountCents: inv.amountCents }, await availableSavingsCents(tx, inv.familyId))
      : NO_GRANT;
    if (!grant || d.outcome === "REFUSE") {
      await patch(tx, inv.id, { status: "rejected", error: d.reasons[0]?.constraint ?? "REFUSED" });
      return { status: "rejected" as const, reason: d.reasons[0]?.constraint };
    }
    // The approval was verified above; it lifts NEEDS_APPROVAL (never REFUSE), as with purchases.
    // tokenId derives from the investment id, so a second mint for it is a REPLAY.
    const token = mintToken({ ...d, outcome: "ALLOW" }, grant.body, investCart(inv.symbol, inv.amountCents), now, deps.secret, `invest:${inv.id}`);
    if (!(await consumeToken(tx, token.tokenId))) return { status: cur.status, reason: "REPLAY" };
    await appendJournal(tx, { familyId: inv.familyId, kind: "invest", amountCents: token.amountCents, at: now, ref: inv.id, note: `alpaca:${inv.symbol}` });
    await patch(tx, inv.id, { status: "depositing", alpacaAccountId: accountId, debitedAt: new Date() });
    return "ok" as const;
  });
}

const DEAD = new Set(["rejected", "canceled", "expired"]);

/** Money is already in the account, so every outcome keeps the debit: filled, queued, or cash_held. */
async function applyOrder(deps: InvestDeps, inv: Inv, orderId: string, alpacaStatus: string): Promise<SettleInvestmentResult> {
  if (DEAD.has(alpacaStatus)) {
    await patch(deps.db, inv.id, { status: "cash_held", orderId, error: `order ${alpacaStatus}` });
    return { status: "cash_held" };
  }
  const status = alpacaStatus === "filled" ? "filled" : "queued"; // new, accepted, pending_new, partially_filled... => queued
  await patch(deps.db, inv.id, { status, orderId, error: null, receiptNote: investReceiptNote(await teenName(deps.db, inv.familyId)) });
  return { status };
}

/** Find (by client_order_id) or place the order. Any failure keeps the debit and leaves `queued` with the error. */
async function placeOrder(deps: InvestDeps, inv: Inv, clientOrderId: string): Promise<SettleInvestmentResult> {
  try {
    const accountId = inv.alpacaAccountId!;
    const existing = await deps.alpaca.findOrderByClientId(accountId, clientOrderId);
    const o = existing ?? await deps.alpaca.placeNotionalOrder(accountId, inv.symbol, inv.amountCents, clientOrderId);
    return await applyOrder(deps, inv, o.orderId, o.status);
  } catch (e) {
    await patch(deps.db, inv.id, { status: "queued", error: errText(e) });
    return { status: "queued", reason: "ORDER_PENDING" };
  }
}

async function teenName(db: Db, familyId: string): Promise<string> {
  const [f] = await db.select({ n: t.families.teenName }).from(t.families).where(eq(t.families.id, familyId));
  return f?.n ?? "your teen";
}

async function reverse(deps: InvestDeps, inv: Inv, why: string, now: Date): Promise<SettleInvestmentResult> {
  await deps.db.transaction(async (tx) => {
    await appendJournal(tx, { familyId: inv.familyId, kind: "invest_reversal", amountCents: inv.amountCents, at: now, ref: inv.id, note: why.slice(0, 200) });
    await patch(tx, inv.id, { status: "rejected", error: why.slice(0, 200) });
  });
  return { status: "rejected", reason: why };
}

async function closeUnfunded(db: Db, inv: Inv, reason: string): Promise<SettleInvestmentResult> {
  await db.update(t.investments).set({ status: "rejected", error: reason })
    .where(and(eq(t.investments.id, inv.id), eq(t.investments.status, "approved")));
  return { status: "rejected", reason };
}

const errText = (e: unknown) => (e instanceof Error ? e.message : "unknown error").slice(0, 200);

// ---- resume -----------------------------------------------------------------

/** Moves one stuck investment forward under the family lock. Never deposits and never reverses. */
export async function resumeInvestment(deps: InvestDeps, investmentId: string): Promise<SettleInvestmentResult> {
  const inv0 = await getInv(deps.db, investmentId);
  if (!inv0) throw new Error(`unknown investment ${investmentId}`);
  return deps.db.transaction(async (tx) => {
    await lockFamily(tx, inv0.familyId);
    const inv = (await getInv(tx, investmentId))!;
    const d = { ...deps, db: tx };
    if (inv.status === "queued" && inv.orderId) return refreshOrder(d, inv);
    if (inv.status === "queued" && inv.transferId) return placeOrder(d, inv, inv.id);
    if (inv.status === "depositing" && !inv.transferId) return reconcileDeposit(d, inv);
    if (inv.status === "depositing" && inv.transferId) return placeOrder(d, inv, inv.id);
    return { status: inv.status };
  });
}

export async function resumeInvestments(deps: InvestDeps, familyId: string): Promise<void> {
  const rows = await deps.db.select({ id: t.investments.id }).from(t.investments).where(and(
    eq(t.investments.familyId, familyId), inArray(t.investments.status, ["depositing", "queued"]), isNotNull(t.investments.alpacaAccountId)));
  for (const r of rows) await resumeInvestment(deps, r.id).catch(() => undefined); // a broker outage must not block the page
}

async function refreshOrder(deps: InvestDeps, inv: Inv): Promise<SettleInvestmentResult> {
  try {
    const o = await deps.alpaca.getOrder(inv.alpacaAccountId!, inv.orderId!);
    return await applyOrder(deps, inv, inv.orderId!, o.status);
  } catch (e) {
    await patch(deps.db, inv.id, { error: errText(e) });
    return { status: inv.status };
  }
}

/** Cancelled, rejected or returned transfers never moved money, so they can't be our deposit. */
const LIVE_TRANSFER = new Set(["QUEUED", "APPROVAL_PENDING", "PENDING", "SENT_TO_CLEARING", "APPROVED", "COMPLETE"]);

/** `depositing` with no transferId is ambiguous: find our transfer by amount + time, or flag it. Never re-deposits. */
async function reconcileDeposit(deps: InvestDeps, inv: Inv): Promise<SettleInvestmentResult> {
  let found: { transferId: string } | undefined;
  try {
    const used = new Set((await deps.db.select({ x: t.investments.transferId }).from(t.investments)
      .where(and(eq(t.investments.familyId, inv.familyId), isNotNull(t.investments.transferId)))).map((r) => r.x));
    const since = (inv.debitedAt?.getTime() ?? 0) - 60_000;
    found = (await deps.alpaca.listTransfers(inv.alpacaAccountId!))
      .find((x) => x.incoming && LIVE_TRANSFER.has(x.status) && !used.has(x.transferId) && x.createdAt >= since && x.amount === Number(dollars(inv.amountCents)));
  } catch (e) {
    await patch(deps.db, inv.id, { error: errText(e) });
    return { status: inv.status };
  }
  if (!found) {
    await patch(deps.db, inv.id, { status: "needs_review", error: "deposit outcome unknown: no matching transfer found" });
    return { status: "needs_review" };
  }
  await patch(deps.db, inv.id, { transferId: found.transferId });
  return placeOrder(deps, { ...inv, transferId: found.transferId }, inv.id);
}

/** Amara asks for another try after an order died: the cash is still in the account. New client id (the old order is dead). */
export async function retryInvestment(deps: InvestDeps, investmentId: string): Promise<SettleInvestmentResult> {
  const inv0 = await getInv(deps.db, investmentId);
  if (!inv0) throw new Error(`unknown investment ${investmentId}`);
  return deps.db.transaction(async (tx) => {
    await lockFamily(tx, inv0.familyId);
    const inv = (await getInv(tx, investmentId))!;
    if (inv.status !== "cash_held") return { status: inv.status };
    const d = { ...deps, db: tx };
    try {
      const acct = inv.alpacaAccountId!;
      // A previous retry whose response was lost may already have an order under the current client id: adopt it.
      const prior = inv.retryCount > 0 ? await d.alpaca.findOrderByClientId(acct, `${inv.id}:retry:${inv.retryCount}`) : null;
      if (prior && prior.orderId !== inv.orderId) return await applyOrder(d, inv, prior.orderId, prior.status);
      const n = inv.retryCount + 1;
      await patch(tx, inv.id, { retryCount: n }); // commits with the transaction, i.e. after the POST, not before it.
      // A lost response is caught below, so the count still commits and the next retry adopts the order under this id.
      const o = await d.alpaca.placeNotionalOrder(acct, inv.symbol, inv.amountCents, `${inv.id}:retry:${n}`);
      return await applyOrder(d, inv, o.orderId, o.status);
    } catch (e) {
      await patch(tx, inv.id, { error: errText(e) }); // stays cash_held
      return { status: "cash_held" as const };
    }
  });
}
