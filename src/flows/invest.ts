import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { appendJournal, consumeToken, getActiveGrant } from "@/db/repo";
import { savingsCents } from "@/ledger/ledger";
import { decideInvestment, type InvestProposal } from "@/engine/invest";
import { cartHash } from "@/engine/hash";
import { mintToken } from "@/engine/token";
import type { Cart, Decision, Grant } from "@/engine/types";
import { AlpacaError, type AlpacaBroker, type GuardianKyc, type MinorIdentity } from "@/adapters/alpaca/broker";
import type { Deps } from "@/flows/purchase";
import { requestApproval } from "@/flows/approvals";

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
  deps: InvestDeps, familyId: string, p: InvestProposal, answers: Record<string, string>,
): Promise<{ investmentId: string; decision: Decision; approvalId?: string }> {
  const { db } = deps;
  const symbol = normSymbol(p.symbol);
  const grant = await getActiveGrant(db, familyId);
  const decision = grant
    ? decideInvestment(await withAllowlist(db, grant.body), { symbol, amountCents: p.amountCents }, await savingsCents(db, familyId))
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
async function ensureAccount(deps: InvestDeps, familyId: string): Promise<string> {
  const { db } = deps;
  const [f] = await db.select().from(t.families).where(eq(t.families.id, familyId));
  if (!f) throw new Error(`unknown family ${familyId}`);
  if (f.alpacaAccountId) return f.alpacaAccountId;
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

/**
 * After Amara approves: debit savings, fund the account, place the order. Idempotent: only an `approved`
 * investment moves, and it leaves `approved` inside the family-row lock, so a second call returns the stored status.
 */
export async function settleInvestment(deps: InvestDeps, investmentId: string): Promise<SettleInvestmentResult> {
  const { db } = deps;
  const inv = await getInv(db, investmentId);
  if (!inv) throw new Error(`unknown investment ${investmentId}`);
  if (inv.status !== "approved") return { status: inv.status };
  const now = await deps.now(inv.familyId);
  const [ok] = await db.select({ id: t.approvals.id }).from(t.approvals).where(and(
    eq(t.approvals.subject, "investment"), eq(t.approvals.subjectId, investmentId),
    eq(t.approvals.result, "approved"), gt(t.approvals.expiresAt, now))).limit(1);
  if (!ok) return closeUnfunded(db, inv, "APPROVAL_EXPIRED");

  let accountId: string;
  try { accountId = await ensureAccount(deps, inv.familyId); } catch (e) {
    await patch(db, inv.id, { error: errText(e) }); // nothing debited yet; still `approved`, safe to retry
    return { status: "approved", reason: "ACCOUNT_UNAVAILABLE" };
  }

  const locked = await debit(deps, inv, accountId, now);
  if (locked !== "ok") return locked;

  let transferId = inv.transferId ?? "";
  try {
    transferId = (await deps.alpaca.deposit(accountId, inv.amountCents)).transferId;
    await patch(db, inv.id, { transferId });
    const order = await deps.alpaca.placeNotionalOrder(accountId, inv.symbol, inv.amountCents, inv.id);
    return await applyOrder(deps, inv, order.orderId, order.status, now);
  } catch (e) {
    return failAfterDebit(deps, inv, e, now);
  }
}

/** Under the family-row lock: re-check, mint + consume the token, append the `invest` debit, mark `depositing`. */
async function debit(deps: InvestDeps, inv: Inv, accountId: string, now: Date): Promise<"ok" | SettleInvestmentResult> {
  return deps.db.transaction(async (tx) => {
    await tx.select({ id: t.families.id }).from(t.families).where(eq(t.families.id, inv.familyId)).for("update");
    const cur = await getInv(tx, inv.id);
    if (cur?.status !== "approved") return { status: cur?.status ?? "rejected" };
    const grant = await getActiveGrant(tx, inv.familyId);
    const d = grant
      ? decideInvestment(await withAllowlist(tx, grant.body), { symbol: inv.symbol, amountCents: inv.amountCents }, await savingsCents(tx, inv.familyId))
      : NO_GRANT;
    if (!grant || d.outcome === "REFUSE") {
      await patch(tx, inv.id, { status: "rejected", error: d.reasons[0]?.constraint ?? "REFUSED" });
      return { status: "rejected" as const, reason: d.reasons[0]?.constraint };
    }
    // The approval was verified above; it lifts NEEDS_APPROVAL (never REFUSE), as with purchases.
    const token = mintToken({ ...d, outcome: "ALLOW" }, grant.body, investCart(inv.symbol, inv.amountCents), now, deps.secret);
    if (!(await consumeToken(tx, token.tokenId))) return { status: cur.status, reason: "REPLAY" };
    await appendJournal(tx, { familyId: inv.familyId, kind: "invest", amountCents: token.amountCents, at: now, ref: inv.id, note: `alpaca:${inv.symbol}` });
    await patch(tx, inv.id, { status: "depositing", alpacaAccountId: accountId });
    return "ok" as const;
  });
}

const FILLED = "filled";
const DEAD = new Set(["rejected", "canceled", "expired"]);

async function applyOrder(deps: InvestDeps, inv: Inv, orderId: string, alpacaStatus: string, now: Date): Promise<SettleInvestmentResult> {
  if (DEAD.has(alpacaStatus)) return reverse(deps, inv, `order ${alpacaStatus}`, now, { orderId });
  const status = alpacaStatus === FILLED ? "filled" : "queued"; // new, accepted, pending_new, partially_filled... => queued
  await patch(deps.db, inv.id, { status, orderId, error: null });
  return { status };
}

/** Definite failure: return the money. Unknown outcome (network, 5xx): keep the debit, a later getOrder reconciles. */
async function failAfterDebit(deps: InvestDeps, inv: Inv, e: unknown, now: Date): Promise<SettleInvestmentResult> {
  if (e instanceof AlpacaError && !e.outcomeUnknown) return reverse(deps, inv, errText(e), now);
  await patch(deps.db, inv.id, { status: "queued", error: errText(e) });
  return { status: "queued", reason: "OUTCOME_UNKNOWN" };
}

async function reverse(deps: InvestDeps, inv: Inv, why: string, now: Date, extra: Partial<Inv> = {}): Promise<SettleInvestmentResult> {
  await deps.db.transaction(async (tx) => {
    await appendJournal(tx, { familyId: inv.familyId, kind: "invest_reversal", amountCents: inv.amountCents, at: now, ref: inv.id, note: why.slice(0, 200) });
    await patch(tx, inv.id, { ...extra, status: "rejected", error: why.slice(0, 200) });
  });
  return { status: "rejected", reason: why };
}

async function closeUnfunded(db: Db, inv: Inv, reason: string): Promise<SettleInvestmentResult> {
  await db.update(t.investments).set({ status: "rejected", error: reason })
    .where(and(eq(t.investments.id, inv.id), eq(t.investments.status, "approved")));
  return { status: "rejected", reason };
}

const errText = (e: unknown) => (e instanceof Error ? e.message : "unknown error").slice(0, 200);
