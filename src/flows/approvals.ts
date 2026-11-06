import { and, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { getActiveGrant, getPurchase } from "@/db/repo";
import { now as demoNow } from "@/clock/clock";
import type { Cart, Constraint } from "@/engine/types";
import { budgetOverage } from "@/engine/decide";
import type { StoredDecision } from "@/flows/purchase";
import type { Deps } from "@/flows/purchase";

const DAY_MS = 86_400_000;
type Subject = (typeof t.approvals.$inferSelect)["subject"];

export class ApprovalError extends Error {
  constructor(message: string) { super(message); this.name = "ApprovalError"; }
}

export const teenMessage = (guardianName: string) => `${guardianName} said not this time.`;

/** Sunday 23:59:59.999 UTC of the ISO week containing d. */
function weekEnd(d: Date): Date {
  const daysToSunday = (7 - d.getUTCDay()) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysToSunday, 23, 59, 59, 999));
}

const SHOP_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** "HTTPS://WWW.Nike.com/x?y" -> "nike.com"; throws if it is not a bare domain. */
export function normaliseDomain(input: string): string {
  const d = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/^www\./, "");
  if (!SHOP_DOMAIN.test(d)) throw new ApprovalError(`"${input}" is not a shop domain`);
  return d;
}

export async function requestApproval(
  deps: Pick<Deps, "db" | "now">, familyId: string, subject: Subject, subjectId: string, cartHash: string | null, note: string | null = null,
): Promise<{ approvalId: string }> {
  const { db } = deps;
  await expireStale(deps, familyId);
  const now = await deps.now(familyId);
  let lift: { liftsBudget: boolean; overCents: number | null } = { liftsBudget: false, overCents: null };
  if (subject === "purchase") {
    const p = await getPurchase(db, subjectId);
    if (!p || p.familyId !== familyId) throw new ApprovalError(`unknown purchase ${subjectId}`);
    const over = p.status === "refused" ? liftableOverage(p.decision) : null;
    if (p.status !== "needs_approval" && over === null) throw new ApprovalError(`purchase is ${p.status}, not awaiting approval`);
    if (p.cartHash !== cartHash) throw new ApprovalError("cart hash does not match the purchase");
    if (over !== null) lift = { liftsBudget: true, overCents: over };
  }
  const find = () => db.select().from(t.approvals).where(and(
    eq(t.approvals.familyId, familyId), eq(t.approvals.subject, subject), eq(t.approvals.subjectId, subjectId),
    isNull(t.approvals.result), isNull(t.approvals.expiredAt), gt(t.approvals.expiresAt, now))).limit(1);
  const [existing] = await find();
  if (existing) return { approvalId: existing.id };
  const expiresAt = new Date(Math.min(now.getTime() + DAY_MS, weekEnd(now).getTime()));
  const approvalId = crypto.randomUUID();
  const ins = await db.insert(t.approvals).values({ id: approvalId, familyId, subject, subjectId, cartHash, expiresAt, note, ...lift })
    .onConflictDoNothing().returning({ id: t.approvals.id });
  if (ins.length) return { approvalId };
  const [raced] = await find(); // lost a race to the one-open-approval index
  if (!raced) throw new ApprovalError("could not open approval");
  return { approvalId: raced.id };
}

/** `familyId`, when given (every guardian surface gives it), must own the approval: another family's id is "unknown". */
export async function decideApproval(
  deps: Pick<Deps, "db" | "now">, approvalId: string, result: "approved" | "declined", familyId?: string,
): Promise<{ subject: Subject; subjectId: string }> {
  const [a] = await deps.db.select().from(t.approvals).where(eq(t.approvals.id, approvalId));
  if (!a || (familyId !== undefined && a.familyId !== familyId)) throw new ApprovalError(`unknown approval ${approvalId}`);
  // One transaction under the family-row lock (same lock as settlePurchase); any throw rolls everything back.
  await deps.db.transaction(async (tx) => {
    await tx.select({ id: t.families.id }).from(t.families).where(eq(t.families.id, a.familyId)).for("update");
    const now = await deps.now(a.familyId, tx);
    const [won] = await tx.update(t.approvals).set({ result, decidedAt: now })
      .where(and(eq(t.approvals.id, approvalId), isNull(t.approvals.result), isNull(t.approvals.expiredAt), gt(t.approvals.expiresAt, now)))
      .returning();
    if (!won) throw new ApprovalError("approval is not open (already decided or expired)");
    if (a.subject === "purchase") await decidePurchase(tx, a.subjectId, result, a.liftsBudget);
    else if (a.subject === "shop" && result === "approved") await applyShop(tx, a.familyId, a.subjectId, now);
    else if (a.subject === "investment") await decideInvestmentRow(tx, a.subjectId, result);
    else if (a.subject === "fund") await decideFund(tx, a.familyId, a.subjectId, result);
  });
  return { subject: a.subject, subjectId: a.subjectId };
}

/**
 * R40: a refused purchase can be asked about only when the weekly budget is its ONLY hard reason and no
 * meaning check (gate 2) refused it. Returns how far past the week it goes (the most Amara's yes can cover).
 */
export function liftableOverage(d: StoredDecision | PurchaseDecision): number | null {
  const gate2 = (d as Partial<StoredDecision>).gate2 ?? [];
  if (gate2.some((f) => f.band === "REFUSE")) return null;
  if (d.semanticRules.length > 0 && gate2.length === 0) return null; // a meaning rule nobody checked: never liftable
  return budgetOverage(d.reasons);
}
type PurchaseDecision = (typeof t.purchases.$inferSelect)["decision"];

async function decidePurchase(db: Db, purchaseId: string, result: "approved" | "declined", liftsBudget: boolean) {
  const p = await getPurchase(db, purchaseId);
  if (!p) throw new ApprovalError(`unknown purchase ${purchaseId}`);
  const open = liftsBudget ? ["needs_approval", "refused"] : ["needs_approval"];
  const allowed = result === "approved" ? open : [...open, "approved"];
  if (!allowed.includes(p.status)) throw new ApprovalError(`cannot ${result === "approved" ? "approve" : "decline"} a ${p.status} purchase`);
  if (result === "approved") {
    await db.update(t.purchases).set({ status: "approved" }).where(eq(t.purchases.id, purchaseId));
    return;
  }
  const decision = { ...p.decision, outcome: "REFUSE" as const, reasons: [{ constraint: "DECLINED", detail: "Guardian declined" }] };
  await db.update(t.purchases).set({ status: "refused", decision }).where(eq(t.purchases.id, purchaseId));
}

async function decideInvestmentRow(db: Db, investmentId: string, result: "approved" | "declined") {
  const moved = await db.update(t.investments).set({ status: result === "approved" ? "approved" : "rejected" })
    .where(and(eq(t.investments.id, investmentId), eq(t.investments.status, "proposed"))).returning({ id: t.investments.id });
  if (moved.length === 0) throw new ApprovalError(`investment ${investmentId} is not awaiting approval`);
}

/** Approving a fund proposal is the only way a symbol reaches fund_allowlist. */
async function decideFund(db: Db, familyId: string, proposalId: string, result: "approved" | "declined") {
  const [prop] = await db.update(t.fundProposals).set({ status: result })
    .where(and(eq(t.fundProposals.id, proposalId), eq(t.fundProposals.status, "proposed"))).returning();
  if (!prop) throw new ApprovalError(`fund proposal ${proposalId} is not awaiting approval`);
  if (result === "approved") await db.insert(t.fundAllowlist).values({ familyId, symbol: prop.symbol }).onConflictDoNothing();
}

/** Past-expiry approvals keep result=null; their unsettled purchases and unanswered investments become `expired`. */
export async function expireStale(deps: Pick<Deps, "db" | "now">, familyId: string): Promise<void> {
  const { db } = deps;
  const now = await deps.now(familyId);
  await db.update(t.approvals).set({ expiredAt: now }).where(and(
    eq(t.approvals.familyId, familyId), isNull(t.approvals.result), isNull(t.approvals.expiredAt), lte(t.approvals.expiresAt, now)));
  const unanswered = await db.select({ subjectId: t.approvals.subjectId }).from(t.approvals).where(and(
    eq(t.approvals.familyId, familyId), eq(t.approvals.subject, "investment"), isNull(t.approvals.result),
    or(lte(t.approvals.expiresAt, now), isNotNull(t.approvals.expiredAt)))); // a reset expires asks early
  if (unanswered.length > 0) { // M3: never left reading "Waiting for you"
    await db.update(t.investments).set({ status: "expired" }).where(and(eq(t.investments.familyId, familyId),
      inArray(t.investments.id, unanswered.map((s) => s.subjectId)), eq(t.investments.status, "proposed")));
  }
  const stale = await db.select({ subjectId: t.approvals.subjectId }).from(t.approvals).where(and(
    eq(t.approvals.familyId, familyId), eq(t.approvals.subject, "purchase"), lte(t.approvals.expiresAt, now),
    or(isNull(t.approvals.result), eq(t.approvals.result, "approved"))));
  if (stale.length === 0) return;
  await db.update(t.purchases).set({ status: "expired" }).where(and(
    inArray(t.purchases.id, stale.map((s) => s.subjectId)), inArray(t.purchases.status, ["needs_approval", "approved"])));
}

export type PendingApproval = {
  id: string; subject: Subject; subjectId: string; expiresAt: Date; cartHash: string | null;
  cart?: Cart; shopDomain?: string; note: string | null; liftsBudget: boolean;
};

export async function pendingApprovals(db: Db, familyId: string, at?: Date): Promise<PendingApproval[]> {
  const now = at ?? await demoNow(db, familyId);
  await expireStale({ db, now: async () => now }, familyId);
  const rows = await db.select().from(t.approvals).where(and(
    eq(t.approvals.familyId, familyId), isNull(t.approvals.result), isNull(t.approvals.expiredAt), gt(t.approvals.expiresAt, now)));
  const out = await Promise.all(rows.map(async (a): Promise<PendingApproval | null> => {
    const base = { id: a.id, subject: a.subject, subjectId: a.subjectId, expiresAt: a.expiresAt, cartHash: a.cartHash, note: a.note, liftsBudget: a.liftsBudget };
    if (a.subject === "shop") return { ...base, shopDomain: a.subjectId };
    if (a.subject === "purchase") {
      const p = await getPurchase(db, a.subjectId);
      const waiting = p?.status === "needs_approval" || (a.liftsBudget && p?.status === "refused");
      return waiting ? { ...base, cart: p.cart } : null; // already settled, or refused for good
    }
    return base;
  }));
  return out.filter((a): a is PendingApproval => a !== null);
}

export async function proposeShop(deps: Deps, familyId: string, domain: string, reason: string) {
  return requestApproval(deps, familyId, "shop", normaliseDomain(domain), null, reason);
}

const addId = (c: Constraint, merchantId: string): Constraint =>
  (c.type === "payment.allowed_payees" || c.type === "checkout.allowed_merchants") && Array.isArray(c.merchantIds)
    ? { ...c, merchantIds: [...new Set([...(c.merchantIds as string[]), merchantId])] } : c;

async function applyShop(db: Db, familyId: string, domain: string, now: Date) {
  const grant = await getActiveGrant(db, familyId);
  if (!grant) throw new ApprovalError("no active grant");
  const hasPayees = grant.body.constraints.some((c) => c.type === "payment.allowed_payees" && Array.isArray(c.merchantIds));
  if (!hasPayees) throw new ApprovalError("active grant has no allowed_payees list to add the shop to");
  const [found] = await db.select().from(t.merchants).where(eq(t.merchants.channel3WebsiteId, domain));
  if (found && found.opensAtLevel > grant.level) throw new ApprovalError("that shop opens at a higher level");
  const merchantId = found?.id ?? crypto.randomUUID();
  if (!found) {
    await db.insert(t.merchants).values({
      id: merchantId, name: domain, domain, class: "general", channel3WebsiteId: domain, opensAtLevel: grant.level,
      addedByFamilyId: familyId,
    });
  }
  const body = {
    ...grant.body, id: crypto.randomUUID(), version: grant.version + 1, signedAt: now.toISOString(),
    constraints: grant.body.constraints.map((c) => addId(c, merchantId)),
  };
  await db.update(t.grants).set({ status: "expired" }).where(eq(t.grants.id, grant.id));
  await db.insert(t.grants).values({
    id: body.id, familyId, version: body.version, level: grant.level, body, signedAt: now, expiresAt: grant.expiresAt, status: "active",
  });
}
