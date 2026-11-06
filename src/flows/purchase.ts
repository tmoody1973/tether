import { and, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import {
  appendJournal, consumeToken, getActiveGrant, getMerchant, getPurchase, getReceiptByCaptureId, getValidApproval, getVault,
  insertPurchase, insertReceiptOnce, transitionPurchase, updatePurchaseStatus,
  type PurchaseRow, type PurchaseStatus,
} from "@/db/repo";
import { ledgerView } from "@/ledger/ledger";
import { decide } from "@/engine/decide";
import { cartHash } from "@/engine/hash";
import { mintToken, verifyToken, type AuthToken } from "@/engine/token";
import { BOOKS_ONLY, bandOf, compose } from "@/engine/gate2";
import type { ApprovalGrant, Cart, Decision, Grant, Outcome } from "@/engine/types";
import type { PaypalHttp } from "@/adapters/paypal/http";
import { chargeVaulted, resumeOrder, sendOrder, type ChargeArgs, type ChargeResult } from "@/adapters/paypal/orders";
import { listTransactions } from "@/adapters/paypal/transactions";
import type { ChargeIntent } from "@/db/schema";
import type { Channel3Adapter } from "@/adapters/channel3/client";
import type { Classifier } from "@/ai/classifier";
import { expireStale } from "@/flows/approvals";
import { withFamilyLock } from "@/flows/grant";

export type Deps = {
  db: Db; paypal: PaypalHttp; channel3: Channel3Adapter; classifier: Classifier;
  secret: string;
  /** Demo-clock time for the family. Inside a transaction, pass `conn` (the tx): PGlite has one connection. */
  now: (familyId: string, conn?: Db) => Promise<Date>;
  /** REAL wall-clock ms (default Date.now). PayPal's 6-hour request-id window runs on real time, never the demo clock. */
  realNow?: () => number;
};

const realNow = (deps: Pick<Deps, "realNow">): number => (deps.realNow ?? Date.now)();
const MINUTE_MS = 60_000;
/** R38: re-send create-order only while PayPal still remembers the request id (6h by default; 1h margin). */
export const RESEND_WINDOW_MS = 5 * 60 * MINUTE_MS;
/** R38: a charge sent (or retried) less than this long ago, in real time, is left alone. */
export const IN_FLIGHT_MS = MINUTE_MS;

export interface Gate2Finding { rule: string; probability: number | null; model: string; modelVersion: string; band: Outcome }
/** What purchases.decision / receipts.decision hold: gate 1 plus the gate-2 evidence, outcome = composed. */
export type StoredDecision = Decision & { gate2: Gate2Finding[] };
export type SettleResult = { status: PurchaseStatus; reason?: string; message?: string };

export const CHARGE_FAILED_MESSAGE = "We couldn't charge — nothing was spent.";
export const CHARGE_UNKNOWN_MESSAGE = "PayPal hasn't confirmed this payment yet.";

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
  await resumePayingPurchases(deps, found.familyId); // R37: finish earlier unknown outcomes before anything new
  await expireStale(deps, found.familyId);
  const p = (await getPurchase(db, purchaseId)) ?? found; // status may have just become `expired` or `paid`
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
  if (deps.paypal.configured === false) return refuse(ctx, "PAYPAL_UNAVAILABLE"); // nothing debited, nothing sent

  const grant = await getActiveGrant(db, p.familyId);
  if (!grant) return refuse(ctx, "no_active_grant");
  const d = await gates(db, ctx, grant.body, fresh);
  if (d.outcome !== "ALLOW") return refuse(ctx, firstReason(d), STATUS[d.outcome]);

  const token = mintToken(d, grant.body, fresh, now, deps.secret);
  if (!(await consumeToken(db, token.tokenId, p.id))) return refuse(ctx, "REPLAY");

  const args: ChargeArgs = {
    vaultId: vault.paymentTokenId,
    payeeEmail: merchant.paypalPayeeEmail ?? undefined,
    description: `Tether: ${fresh.items.map((i) => i.title).join(", ")}`.slice(0, 127),
  };
  const debited = await debit(ctx, grant.body, fresh, token, args);
  if ("status" in debited) return debited;

  const keepOrderId = (orderId: string) => db.update(t.purchases).set({ paypalOrderId: orderId }).where(eq(t.purchases.id, p.id)).then(() => undefined);
  const charge = await chargeVaulted(token, fresh, deps.secret, now, deps.paypal, args, keepOrderId)
    .catch((e: unknown): ChargeResult => ({ ok: false, outcome: "unknown", error: e instanceof Error ? e.message : "CHARGE_THREW" }));
  return settleCharge(db, p.id, debited.intent, charge, now);
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
    ? {
      cartHash: approval.cartHash, expiresAt: approval.expiresAt.toISOString(),
      ...(approval.liftsBudget ? { liftsBudget: true, overCents: approval.overCents ?? 0 } : {}), // R40; capped again under the lock
    } : undefined;
  const gate1 = decide(grant, cart, await ledgerView(db, p.familyId, now), now, grantApproval, p.cartHash);
  const stored = (p.decision as Partial<StoredDecision>).gate2 ?? [];
  // A semantic rule with no stored finding (rule added after propose) fails closed.
  const bands: Outcome[] = gate1.semanticRules.length > 0 && stored.length === 0 ? ["REFUSE"]
    : stored.map((f) => (f.band === "NEEDS_APPROVAL" && grantApproval ? "ALLOW" : f.band));
  return { ...gate1, outcome: compose(gate1.outcome, bands), gate2: stored };
}

/**
 * R14: one transaction, serialised per family by the row lock. Budget is re-read under the lock,
 * so two settles can never both spend the same remaining dollars. The charge intent is stored with the
 * debit (R37) so an unknown PayPal outcome can be re-sent later with the same PayPal-Request-Id.
 */
async function debit(
  ctx: Ctx, grant: Grant, cart: Cart, token: AuthToken, args: ChargeArgs,
): Promise<SettleResult | { intent: ChargeIntent }> {
  const { deps, p, now, approval } = ctx;
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
    const intent: ChargeIntent = { token, args, decision: d, approvalId: approval?.id ?? null };
    await appendJournal(tx, { familyId: p.familyId, kind: "spend", amountCents: cart.totalCents, at: now, ref: p.id, note: null });
    const sentAt = new Date(realNow(deps)); // real time: the start of PayPal's request-id window
    await tx.update(t.purchases).set({ status: "paying", charge: intent, chargeError: null, chargeSentAt: sentAt, chargeAttemptedAt: sentAt })
      .where(eq(t.purchases.id, p.id));
    return { intent };
  });
}

/**
 * R37. completed ⇒ receipt (idempotent) + paid; declined ⇒ reversal + failed (once: only from `paying`);
 * unknown ⇒ the money may have moved, so the spend stays, the purchase stays `paying` and the error is kept.
 */
async function settleCharge(db: Db, purchaseId: string, intent: ChargeIntent, charge: ChargeResult, now: Date): Promise<SettleResult> {
  if (charge.ok) {
    await insertReceiptOnce(db, {
      purchaseId, captureId: charge.captureId, grantId: intent.token.grantId, grantVersion: intent.token.grantVersion,
      cartHash: intent.token.cartHash, decision: intent.decision, approvalId: intent.approvalId,
    });
    if (charge.status !== "COMPLETED") return { status: "paying" };
    await transitionPurchase(db, purchaseId, "paying", "paid");
    return { status: (await getPurchase(db, purchaseId))?.status ?? "paid" };
  }
  if (charge.outcome === "unknown") {
    await db.update(t.purchases).set({ chargeError: charge.error.slice(0, 200), ...(charge.orderId ? { paypalOrderId: charge.orderId } : {}) })
      .where(and(eq(t.purchases.id, purchaseId), eq(t.purchases.status, "paying")));
    return { status: "paying", message: CHARGE_UNKNOWN_MESSAGE };
  }
  const reversed = await db.transaction(async (tx) => {
    const moved = await transitionPurchase(tx, purchaseId, "paying", "failed");
    if (!moved) return false;
    await appendJournal(tx, {
      familyId: moved.familyId, kind: "spend_reversal", amountCents: intent.token.amountCents, at: now, ref: purchaseId, note: charge.error.slice(0, 200),
    });
    return true;
  });
  if (!reversed) return { status: (await getPurchase(db, purchaseId))?.status ?? "failed" };
  return { status: "failed", message: CHARGE_FAILED_MESSAGE };
}

async function refuse(ctx: Ctx, reason: string, status: PurchaseStatus = "refused"): Promise<SettleResult> {
  const moved = await transitionPurchase(ctx.deps.db, ctx.p.id, ctx.p.status, status);
  if (moved) return { status, reason };
  return { status: (await getPurchase(ctx.deps.db, ctx.p.id))?.status ?? status };
}

const firstReason = (d: Decision) => d.reasons[0]?.constraint ?? "checkout.semantic_category";

// ---- resume (R37) -----------------------------------------------------------

/**
 * R37/R38: finds out what happened to a `paying` purchase that has no receipt. Under the family lock, at most
 * once a minute per purchase (real time), never while its first send is still in flight. In order:
 *  1. order id stored ⇒ read the order (GET); capture it only if approved-but-uncaptured and still in the window;
 *  2. no order id, sent < 5h ago (real time) ⇒ re-send create-order with the SAME PayPal-Request-Id and body;
 *  3. sent ≥ 5h ago ⇒ NEVER re-send (PayPal may have forgotten the id and would charge again): look the slip id up
 *     in Transaction Search; not found ⇒ stays `paying` with NEEDS_CHECK. Branch 3 never reverses.
 */
export async function resumePayingPurchase(deps: Deps, purchaseId: string): Promise<SettleResult> {
  const found = await getPurchase(deps.db, purchaseId);
  if (!found) throw new Error(`unknown purchase ${purchaseId}`);
  if (found.status !== "paying" || !found.charge) return { status: found.status };
  return withFamilyLock(deps, found.familyId, async (tx, now) => {
    const p = await getPurchase(tx, purchaseId);
    const intent = p?.charge;
    if (!p || p.status !== "paying" || !intent) return { status: p?.status ?? found.status };
    const [receipt] = await tx.select({ id: t.receipts.id }).from(t.receipts).where(eq(t.receipts.purchaseId, p.id)).limit(1);
    if (receipt) return { status: "paying" }; // PayPal said PENDING; its webhook finishes it
    const real = realNow(deps);
    const last = Math.max(p.chargeSentAt?.getTime() ?? 0, p.chargeAttemptedAt?.getTime() ?? 0);
    if (real - last < IN_FLIGHT_MS) return { status: "paying" }; // in flight, or just tried (throttle)
    // The slip was verified and debited when first sent; check it is still ours and untampered before using it.
    if (!verifyToken(intent.token, p.cart, new Date(intent.token.issuedAt), deps.secret, () => false).ok) {
      await tx.update(t.purchases).set({ chargeError: "SLIP_CHECK_FAILED", chargeAttemptedAt: new Date(real) }).where(eq(t.purchases.id, p.id));
      return { status: "paying" };
    }
    await tx.update(t.purchases).set({ chargeAttemptedAt: new Date(real) }).where(eq(t.purchases.id, p.id));
    const inWindow = p.chargeSentAt !== null && real - p.chargeSentAt.getTime() < RESEND_WINDOW_MS;
    let charge: ChargeResult;
    if (p.paypalOrderId) {
      charge = await resumeOrder(intent.token, deps.paypal, p.paypalOrderId, inWindow);
    } else if (inWindow) {
      const keep = (orderId: string) => tx.update(t.purchases).set({ paypalOrderId: orderId }).where(eq(t.purchases.id, p.id)).then(() => undefined);
      charge = await sendOrder(intent.token, deps.paypal, intent.args, keep);
    } else {
      charge = await searchBySlip(deps.paypal, intent.token.tokenId, p.chargeSentAt, real);
    }
    return settleCharge(tx, p.id, intent, charge, now);
  });
}

/** R38 branch 3: Transaction Search for the row whose custom_field is this slip's id. Read-only; never "declined". */
async function searchBySlip(paypal: PaypalHttp, tokenId: string, sentAt: Date | null, real: number): Promise<ChargeResult> {
  const DAY_MS = 24 * 60 * MINUTE_MS;
  const start = new Date((sentAt?.getTime() ?? real - 30 * DAY_MS) - 60 * MINUTE_MS);
  const end = new Date(Math.min(real, start.getTime() + 31 * DAY_MS));
  try {
    const rows = await listTransactions(paypal, start, end);
    const hit = rows.find((r) => r.customField === tokenId && r.amountCents > 0);
    // Charged (even if later refunded, which the record's PayPal check then shows as "Refunded in PayPal").
    // S = success, V = later reversed (still charged once; the record shows "Refunded in PayPal"), P = pending.
    // Anything else (e.g. D, denied) isn't proof of a charge: keep checking, never mark it paid.
    if (hit?.status === "S" || hit?.status === "V") return { ok: true, orderId: "", captureId: hit.id, status: "COMPLETED" };
    if (hit?.status === "P") return { ok: true, orderId: "", captureId: hit.id, status: "PENDING" };
    return { ok: false, outcome: "unknown", error: "NEEDS_CHECK" };
  } catch (err) {
    return { ok: false, outcome: "unknown", error: `NEEDS_CHECK: ${err instanceof Error ? err.message : "search failed"}` };
  }
}

/** Resumes every receipt-less `paying` purchase of the family; one failure never stops the others. */
export async function resumePayingPurchases(deps: Deps, familyId: string): Promise<void> {
  const rows = await deps.db.select({ id: t.purchases.id }).from(t.purchases)
    .where(and(eq(t.purchases.familyId, familyId), eq(t.purchases.status, "paying"), isNotNull(t.purchases.charge)));
  for (const { id } of rows) {
    await resumePayingPurchase(deps, id).catch((err: unknown) => {
      console.error("resumePayingPurchase failed", id, err instanceof Error ? err.message : err);
    });
  }
}

// ---- webhook ----------------------------------------------------------------

/**
 * PAYMENT.CAPTURE.COMPLETED: paying -> paid. Idempotent; unknown capture ids are ignored. If Tether never got
 * PayPal's answer (no receipt yet), the capture's custom_id (our slip id) finds the purchase and the receipt is
 * written from its stored charge intent; the capture-id unique index keeps webhook + resume to one receipt.
 */
export async function onCaptureCompleted(deps: Pick<Deps, "db">, captureId: string, customId?: string): Promise<void> {
  const { db } = deps;
  const receipt = await getReceiptByCaptureId(db, captureId);
  if (receipt) {
    await transitionPurchase(db, receipt.purchaseId, "paying", "paid");
    return;
  }
  if (!customId) return;
  const [p] = await db.select().from(t.purchases)
    .innerJoin(t.consumedTokens, eq(t.consumedTokens.purchaseId, t.purchases.id))
    .where(and(eq(t.consumedTokens.tokenId, customId), eq(t.purchases.status, "paying")));
  const intent = p?.purchases.charge;
  if (!intent || intent.token.tokenId !== customId) return;
  await settleCharge(db, p.purchases.id, intent, { ok: true, orderId: "", captureId, status: "COMPLETED" }, new Date());
}
