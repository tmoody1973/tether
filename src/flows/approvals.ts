import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { getActiveGrant, getPurchase } from "@/db/repo";
import { now as demoNow } from "@/clock/clock";
import type { Cart, Constraint } from "@/engine/types";
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

const open = (id: string) => and(eq(t.approvals.id, id), isNull(t.approvals.result));

export async function requestApproval(
  deps: Deps, familyId: string, subject: Subject, subjectId: string, cartHash: string,
): Promise<{ approvalId: string }> {
  const { db } = deps;
  const now = await deps.now(familyId);
  const [existing] = await db.select().from(t.approvals).where(and(
    eq(t.approvals.familyId, familyId), eq(t.approvals.subject, subject), eq(t.approvals.subjectId, subjectId),
    isNull(t.approvals.result), gt(t.approvals.expiresAt, now),
  )).limit(1);
  if (existing) return { approvalId: existing.id };
  const expiresAt = new Date(Math.min(now.getTime() + DAY_MS, weekEnd(now).getTime()));
  const approvalId = crypto.randomUUID();
  await db.insert(t.approvals).values({ id: approvalId, familyId, subject, subjectId, cartHash, expiresAt });
  return { approvalId };
}

export async function decideApproval(deps: Deps, approvalId: string, result: "approved" | "declined"): Promise<void> {
  const { db } = deps;
  const [a] = await db.select().from(t.approvals).where(eq(t.approvals.id, approvalId));
  if (!a) throw new ApprovalError(`unknown approval ${approvalId}`);
  const now = await deps.now(a.familyId);
  // compare-and-set: only an open, unexpired approval can be decided, once
  const [won] = await db.update(t.approvals).set({ result, decidedAt: now })
    .where(and(open(approvalId), gt(t.approvals.expiresAt, now))).returning();
  if (!won) throw new ApprovalError("approval is not open (already decided or expired)");
  if (a.subject === "purchase") await decidePurchase(db, a.subjectId, result);
  else if (a.subject === "shop" && result === "approved") await applyShop(db, a.familyId, a.subjectId, now);
}

async function decidePurchase(db: Db, purchaseId: string, result: "approved" | "declined") {
  const p = await getPurchase(db, purchaseId);
  if (!p) throw new ApprovalError(`unknown purchase ${purchaseId}`);
  if (result === "approved") {
    await db.update(t.purchases).set({ status: "approved" }).where(eq(t.purchases.id, purchaseId));
    return;
  }
  const decision = { ...p.decision, outcome: "REFUSE" as const, reasons: [{ constraint: "DECLINED", detail: "Guardian declined" }] };
  await db.update(t.purchases).set({ status: "refused", decision }).where(eq(t.purchases.id, purchaseId));
}

/** Past-expiry approvals keep result=null; their unsettled purchases become `expired`. */
export async function expireStale(deps: Pick<Deps, "db" | "now">, familyId: string): Promise<void> {
  const { db } = deps;
  const now = await deps.now(familyId);
  const stale = await db.select({ subjectId: t.approvals.subjectId }).from(t.approvals).where(and(
    eq(t.approvals.familyId, familyId), eq(t.approvals.subject, "purchase"), lte(t.approvals.expiresAt, now),
    or(isNull(t.approvals.result), eq(t.approvals.result, "approved"))));
  if (stale.length === 0) return;
  await db.update(t.purchases).set({ status: "expired" }).where(and(
    inArray(t.purchases.id, stale.map((s) => s.subjectId)), inArray(t.purchases.status, ["needs_approval", "approved"])));
}

export type PendingApproval = {
  id: string; subject: Subject; subjectId: string; expiresAt: Date; cartHash: string | null;
  cart?: Cart; shopDomain?: string;
};

export async function pendingApprovals(db: Db, familyId: string, at?: Date): Promise<PendingApproval[]> {
  const now = at ?? await demoNow(db, familyId);
  await expireStale({ db, now: async () => now }, familyId);
  const rows = await db.select().from(t.approvals).where(and(
    eq(t.approvals.familyId, familyId), isNull(t.approvals.result), gt(t.approvals.expiresAt, now)));
  return Promise.all(rows.map(async (a): Promise<PendingApproval> => {
    const base = { id: a.id, subject: a.subject, subjectId: a.subjectId, expiresAt: a.expiresAt, cartHash: a.cartHash };
    if (a.subject === "shop") return { ...base, shopDomain: a.subjectId };
    if (a.subject === "purchase") return { ...base, cart: (await getPurchase(db, a.subjectId))?.cart };
    return base;
  }));
}

export async function proposeShop(deps: Deps, familyId: string, domain: string, reason: string) {
  void reason; // ponytail: not persisted (no column); add one if the parent UI needs to show it
  return requestApproval(deps, familyId, "shop", domain, "");
}

const addId = (c: Constraint, merchantId: string): Constraint =>
  (c.type === "payment.allowed_payees" || c.type === "checkout.allowed_merchants") && Array.isArray(c.merchantIds)
    ? { ...c, merchantIds: [...(c.merchantIds as string[]), merchantId] } : c;

async function applyShop(db: Db, familyId: string, domain: string, now: Date) {
  const grant = await getActiveGrant(db, familyId);
  if (!grant) throw new ApprovalError("no active grant");
  const [found] = await db.select().from(t.merchants).where(eq(t.merchants.channel3WebsiteId, domain));
  const merchantId = found?.id ?? crypto.randomUUID();
  if (!found) {
    await db.insert(t.merchants).values({
      id: merchantId, name: domain, domain, class: "general", channel3WebsiteId: domain, opensAtLevel: grant.level,
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
