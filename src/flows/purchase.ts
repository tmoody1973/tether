import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import {
  appendJournal, consumeToken, getActiveGrant, getMerchant, getPurchase, getReceiptByCaptureId, getValidApproval, getVault,
  insertPurchase, insertReceipt, transitionPurchase, updatePurchaseStatus,
  type PurchaseRow, type PurchaseStatus,
} from "@/db/repo";
import { ledgerView } from "@/ledger/ledger";
import { decide } from "@/engine/decide";
import { cartHash } from "@/engine/hash";
import { mintToken, type AuthToken } from "@/engine/token";
import { BOOKS_ONLY, bandOf, compose } from "@/engine/gate2";
import type { ApprovalGrant, Cart, Decision, Grant, Outcome } from "@/engine/types";
import type { PaypalHttp } from "@/adapters/paypal/http";
import { chargeVaulted, type ChargeResult } from "@/adapters/paypal/orders";
import type { Channel3Adapter } from "@/adapters/channel3/client";
import type { Classifier } from "@/ai/classifier";
import { expireStale } from "@/flows/approvals";

export type Deps = {
  db: Db; paypal: PaypalHttp; channel3: Channel3Adapter; classifier: Classifier;
  secret: string; now: (familyId: string) => Promise<Date>;
};

export interface Gate2Finding { rule: string; probability: number | null; model: string; modelVersion: string; band: Outcome }
/** What purchases.decision / receipts.decision hold: gate 1 plus the gate-2 evidence, outcome = composed. */
export type StoredDecision = Decision & { gate2: Gate2Finding[] };
export type SettleResult = { status: PurchaseStatus; reason?: string; message?: string };

export const CHARGE_FAILED_MESSAGE = "We couldn't charge — nothing was spent.";

const STATUS: Record<Outcome, PurchaseStatus> = { ALLOW: "proposed", NEEDS_APPROVAL: "needs_approval", REFUSE: "refused" };
const NO_GRANT: Decision = {
  outcome: "REFUSE", semanticRules: [],
  reasons: [{ constraint: "no_active_grant", detail: "No active grant - failing closed" }],
};

// ---- propose ----------------------------------------------------------------

export async function proposePurchase(
  deps: Deps, familyId: string, cart: Cart,
): Promise<{ purchaseId: string; decision: StoredDecision }> {
  const now = await deps.now(familyId);
  const hash = cartHash(cart);
  const grant = await getActiveGrant(deps.db, familyId);
  const gate1 = grant ? decide(grant.body, cart, await ledgerView(deps.db, familyId, now), now, undefined, hash) : NO_GRANT;
  // Gate 2 is only consulted when gate 1 has not already refused.
  const gate2 = gate1.outcome === "REFUSE" || gate1.semanticRules.length === 0 ? [] : [await askGate2(deps, cart)];
  const decision: StoredDecision = { ...gate1, outcome: compose(gate1.outcome, gate2.map((f) => f.band)), gate2 };
  const row = await insertPurchase(deps.db, { familyId, cart, cartHash: hash, decision, status: STATUS[decision.outcome] });
  return { purchaseId: row.id, decision };
}

// ponytail: BOOKS_ONLY is the only semantic rule; map semanticRules -> SemanticRule when a second one exists.
async function askGate2(deps: Deps, cart: Cart): Promise<Gate2Finding> {
  const merchant = await getMerchant(deps.db, cart.merchantId);
  const context = { titles: cart.items.map((i) => i.title), merchant: merchant?.name ?? cart.merchantId };
  const p = await deps.classifier.ask(BOOKS_ONLY.question, context)
    .catch(() => ({ probability: null, model: "unknown", modelVersion: "unknown" })); // fail closed
  return { rule: BOOKS_ONLY.type, ...p, band: bandOf(p.probability, BOOKS_ONLY) };
}

// ---- settle -----------------------------------------------------------------

type Approval = Awaited<ReturnType<typeof getValidApproval>>;
type Ctx = { deps: Deps; p: PurchaseRow; now: Date; approval: Approval };

export async function settlePurchase(deps: Deps, purchaseId: string): Promise<SettleResult> {
  const { db } = deps;
  const found = await getPurchase(db, purchaseId);
  if (!found) throw new Error(`unknown purchase ${purchaseId}`);
  await expireStale(deps, found.familyId);
  const p = (await getPurchase(db, purchaseId)) ?? found; // status may have just become `expired`
  const now = await deps.now(p.familyId);
  const approval = await getValidApproval(db, purchaseId, p.cartHash, now);
  const approvable = p.status === "needs_approval" || p.status === "approved";
  if (!(p.status === "proposed" || (approvable && approval))) return { status: p.status };
  const ctx: Ctx = { deps, p, now, approval };

  // R12: price re-check against Channel3 before anything is minted or debited.
  const merchant = await getMerchant(db, p.cart.merchantId);
  const fresh = merchant?.channel3WebsiteId ? await reprice(deps.channel3, p.cart, merchant.channel3WebsiteId) : null;
  if (!merchant || !fresh) return refuse(ctx, "UNAVAILABLE");
  if (cartHash(fresh) !== p.cartHash) return refuse(ctx, "CART_MISMATCH");
  const vault = await getVault(db, p.familyId);
  if (!vault) return refuse(ctx, "NO_PAYMENT_METHOD");

  const grant = await getActiveGrant(db, p.familyId);
  if (!grant) return refuse(ctx, "no_active_grant");
  const d = await gates(db, ctx, grant.body, fresh);
  if (d.outcome !== "ALLOW") return refuse(ctx, firstReason(d), STATUS[d.outcome]);

  const token = mintToken(d, grant.body, fresh, now, deps.secret);
  if (!(await consumeToken(db, token.tokenId))) return refuse(ctx, "REPLAY");

  const debited = await debit(ctx, grant.body, fresh);
  if ("status" in debited) return debited;

  const charge = await chargeVaulted(token, fresh, deps.secret, now, deps.paypal, {
    vaultId: vault.paymentTokenId,
    payeeEmail: merchant.paypalPayeeEmail ?? undefined,
    description: `Tether: ${fresh.items.map((i) => i.title).join(", ")}`.slice(0, 127),
  }).catch((e: unknown): ChargeResult => ({ ok: false, error: e instanceof Error ? e.message : "CHARGE_THREW" }));
  return settleCharge(ctx, token, debited.decision, charge);
}

/** Fresh unit prices from Channel3 for every item; null if any item is no longer sold by the shop. */
async function reprice(c3: Channel3Adapter, cart: Cart, domain: string): Promise<Cart | null> {
  const products = await Promise.all(cart.items.map((i) => c3.retrieve(i.sku, [domain])));
  if (products.some((x) => x === null)) return null;
  const items = cart.items.map((i, k) => ({ ...i, unitCents: products[k]!.priceCents }));
  return { ...cart, items, totalCents: items.reduce((s, i) => s + i.qty * i.unitCents, 0) };
}

/** Gate 1 recomputed now; gate 2 reuses the stored bands (R13). Approval lifts NEEDS_APPROVAL, never REFUSE. */
async function gates(db: Db, ctx: Ctx, grant: Grant, cart: Cart): Promise<StoredDecision> {
  const { p, now, approval } = ctx;
  const grantApproval: ApprovalGrant | undefined = approval?.cartHash
    ? { cartHash: approval.cartHash, expiresAt: approval.expiresAt.toISOString() } : undefined;
  const gate1 = decide(grant, cart, await ledgerView(db, p.familyId, now), now, grantApproval, p.cartHash);
  const stored = (p.decision as Partial<StoredDecision>).gate2 ?? [];
  // A semantic rule with no stored finding (rule added after propose) fails closed.
  const bands: Outcome[] = gate1.semanticRules.length > 0 && stored.length === 0 ? ["REFUSE"]
    : stored.map((f) => (f.band === "NEEDS_APPROVAL" && grantApproval ? "ALLOW" : f.band));
  return { ...gate1, outcome: compose(gate1.outcome, bands), gate2: stored };
}

/**
 * R14: one transaction, serialised per family by the row lock. Budget is re-read under the lock,
 * so two settles can never both spend the same remaining dollars.
 */
async function debit(ctx: Ctx, grant: Grant, cart: Cart): Promise<SettleResult | { decision: StoredDecision }> {
  const { deps, p, now } = ctx;
  return deps.db.transaction(async (tx) => {
    await tx.select({ id: t.families.id }).from(t.families).where(eq(t.families.id, p.familyId)).for("update");
    const cur = await getPurchase(tx, p.id);
    if (cur?.status !== p.status) return { status: cur?.status ?? "refused" }; // another settle got here first
    const live = await getActiveGrant(tx, p.familyId);
    if (live?.id !== grant.id || live.version !== grant.version) {
      await updatePurchaseStatus(tx, p.id, "refused");
      return { status: "refused" as const, reason: "GRANT_CHANGED" };
    }
    const d = await gates(tx, ctx, grant, cart);
    if (d.outcome !== "ALLOW") {
      await updatePurchaseStatus(tx, p.id, STATUS[d.outcome]);
      return { status: STATUS[d.outcome], reason: firstReason(d) };
    }
    await appendJournal(tx, { familyId: p.familyId, kind: "spend", amountCents: cart.totalCents, at: now, ref: p.id, note: null });
    await updatePurchaseStatus(tx, p.id, "paying");
    return { decision: d };
  });
}

async function settleCharge(ctx: Ctx, token: AuthToken, decision: StoredDecision, charge: ChargeResult): Promise<SettleResult> {
  const { deps: { db }, p, now, approval } = ctx;
  if (!charge.ok) {
    await db.transaction(async (tx) => {
      await appendJournal(tx, { familyId: p.familyId, kind: "spend_reversal", amountCents: token.amountCents, at: now, ref: p.id, note: charge.error.slice(0, 200) });
      await updatePurchaseStatus(tx, p.id, "failed");
    });
    return { status: "failed", message: CHARGE_FAILED_MESSAGE };
  }
  await insertReceipt(db, {
    purchaseId: p.id, captureId: charge.captureId, grantId: token.grantId, grantVersion: token.grantVersion,
    cartHash: token.cartHash, decision, approvalId: approval?.id ?? null,
  });
  if (charge.status !== "COMPLETED") return { status: "paying" };
  await transitionPurchase(db, p.id, "paying", "paid");
  return { status: "paid" };
}

async function refuse(ctx: Ctx, reason: string, status: PurchaseStatus = "refused"): Promise<SettleResult> {
  const moved = await transitionPurchase(ctx.deps.db, ctx.p.id, ctx.p.status, status);
  if (moved) return { status, reason };
  return { status: (await getPurchase(ctx.deps.db, ctx.p.id))?.status ?? status };
}

const firstReason = (d: Decision) => d.reasons[0]?.constraint ?? "checkout.semantic_category";

// ---- webhook ----------------------------------------------------------------

/** PAYMENT.CAPTURE.COMPLETED: paying -> paid. Idempotent; unknown capture ids are ignored. */
export async function onCaptureCompleted(deps: Pick<Deps, "db">, captureId: string): Promise<void> {
  const receipt = await getReceiptByCaptureId(deps.db, captureId);
  if (receipt) await transitionPurchase(deps.db, receipt.purchaseId, "paying", "paid");
}
