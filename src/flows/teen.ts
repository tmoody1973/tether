// Zoe's side. Every function takes the familyId the caller resolved from her link (R39); a purchase id that
// isn't this family's is "unknown", never another family's data.
import { and, desc, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { getActiveGrant, getFamily, getLatestGrant, getPurchase, type PurchaseRow } from "@/db/repo";
import { counted, ledgerView, weekKey, weekRecords } from "@/ledger/ledger";
import { commitmentFloorCents, streak, type Level, type WeekRecord } from "@/engine/ladder";
import type { Cart, Decision, Grant } from "@/engine/types";
import type { Product } from "@/adapters/channel3/client";
import { liftableOverage, requestApproval } from "@/flows/approvals";
import { monthReviewView, reviewWeeks } from "@/flows/month";
import { proposePurchase, settlePurchase, type Deps, type SettleResult } from "@/flows/purchase";
import { formatCents } from "@/ui/grantWords";
import { explainRefusal, type ExplainCtx, type Explanation } from "@/ai/explain";
import type { Llm } from "@/ai/llm";

const WEEK_MS = 7 * 86_400_000;

export class TeenError extends Error {
  constructor(message: string) { super(message); this.name = "TeenError"; }
}

export type TeenState = "active" | "ended" | "paused" | "none";

export interface TeenWeek {
  teenName: string; guardianName: string; state: TeenState; now: Date;
  level: Level | null; weeklyCents: number; spentCents: number; leftCents: number;
  /** When the rules in force end (null without any). */
  endsAt: Date | null;
  /** approved: Amara said yes to this one (it went through on her approval). */
  purchases: { id: string; title: string; shop: string; amountCents: number; status: "paid" | "paying"; approved: boolean }[];
  asks: { id: string; title: string; shop: string; amountCents: number; status: "waiting" | "declined" }[];
  goal: { title: string; targetCents: number } | null; savingsCents: number; commitmentCents: number;
  /** Weeks kept in a row that count toward the next level. */
  streak: number;
  release: { cents: number; confirmed: boolean } | null;
  levelUp: { fromLevel: Level; toLevel: Level; weeks: number; kept: number; savedPct: number } | null;
  /** Closed weeks, oldest first (the week-ended screen reads the last ones). */
  weeks: WeekRecord[];
  /** She already nudged Amara to renew these ended rules. */
  nudged: boolean;
}

/** Read model for every teen page. `now` is the family's demo-clock time. */
export async function teenWeek(db: Db, familyId: string, now: Date): Promise<TeenWeek> {
  const fam = await getFamily(db, familyId);
  if (!fam) throw new TeenError(`unknown family ${familyId}`);
  const [latest, active, ledger, weeks, counting, [goal]] = await Promise.all([
    getLatestGrant(db, familyId), getActiveGrant(db, familyId), ledgerView(db, familyId, now), weekRecords(db, familyId),
    reviewWeeks(db, familyId), db.select().from(t.goals).where(eq(t.goals.familyId, familyId)),
  ]);
  const state: TeenState = !latest ? "none" : latest.status === "revoked" ? "paused"
    : active && active.expiresAt > now ? "active" : "ended";
  const body: Grant | null = (active ?? latest)?.body ?? null;
  const weeklyCents = body?.weeklyCents ?? 0;
  const ended = active ?? latest;
  return {
    teenName: fam.teenName, guardianName: fam.guardianName, state, now,
    level: latest ? (latest.level as Level) : null, weeklyCents, endsAt: ended?.expiresAt ?? null,
    spentCents: ledger.spentThisWeekCents, leftCents: Math.max(0, weeklyCents - ledger.spentThisWeekCents),
    purchases: await thisWeeksPurchases(db, familyId, now),
    asks: await thisWeeksAsks(db, familyId, now),
    goal: goal ? { title: goal.title, targetCents: goal.targetCents } : null,
    savingsCents: ledger.savingsCents,
    commitmentCents: Math.max(fam.commitmentCents, body ? commitmentFloorCents(body.weeklyCents, body.commitmentFloorPct) : 0),
    streak: streak(counting),
    release: await latestRelease(db, familyId, now),
    levelUp: await unseenLevelUp(db, familyId, fam.teenSeenLevelAt),
    weeks,
    nudged: state === "ended" && !!ended && fam.teenNudgeAt !== null && fam.teenNudgeNote === null && fam.teenNudgeAt >= ended.expiresAt,
  };
}

async function shopNames(db: Db, carts: Cart[]): Promise<Map<string, string>> {
  const ids = [...new Set(carts.map((c) => c.merchantId))];
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: t.merchants.id, name: t.merchants.name }).from(t.merchants).where(inArray(t.merchants.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

const titleOf = (c: Cart) => c.items.map((i) => i.title).join(" + ");

/** Paid or still-confirming purchases whose spend landed in this ISO week. */
async function thisWeeksPurchases(db: Db, familyId: string, now: Date): Promise<TeenWeek["purchases"]> {
  const spends = await db.select({ ref: t.journal.ref, at: t.journal.at }).from(t.journal)
    .where(and(eq(t.journal.familyId, familyId), eq(t.journal.kind, "spend"), isNotNull(t.journal.ref), counted));
  const key = weekKey(now);
  const ids = spends.filter((s) => weekKey(s.at) === key).map((s) => s.ref as string);
  if (ids.length === 0) return [];
  const rows = await db.select().from(t.purchases)
    .where(and(eq(t.purchases.familyId, familyId), inArray(t.purchases.id, ids), inArray(t.purchases.status, ["paid", "paying"])));
  const names = await shopNames(db, rows.map((r) => r.cart));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((r) => ({
    id: r.id, title: titleOf(r.cart), shop: names.get(r.cart.merchantId) ?? "a shop", amountCents: r.cart.totalCents,
    status: r.status as "paid" | "paying", approved: !!r.charge?.approvalId,
  }));
}

/** Her open asks, and this week's "not this time" answers (F9: a decline is never silent). */
async function thisWeeksAsks(db: Db, familyId: string, now: Date): Promise<TeenWeek["asks"]> {
  const rows = await db.select({ a: t.approvals, p: t.purchases }).from(t.approvals)
    .innerJoin(t.purchases, eq(t.purchases.id, t.approvals.subjectId))
    .where(and(eq(t.approvals.familyId, familyId), eq(t.approvals.subject, "purchase")));
  const key = weekKey(now);
  const kept = rows.filter(({ a, p }) =>
    (a.result === null && a.expiredAt === null && a.expiresAt > now && (p.status === "needs_approval" || (a.liftsBudget && p.status === "refused")))
    || (a.result === "declined" && a.decidedAt !== null && weekKey(a.decidedAt) === key));
  const names = await shopNames(db, kept.map(({ p }) => p.cart));
  return kept.map(({ a, p }) => ({
    id: a.id, title: titleOf(p.cart), shop: names.get(p.cart.merchantId) ?? "a shop", amountCents: p.cart.totalCents,
    status: a.result === "declined" ? "declined" as const : "waiting" as const,
  }));
}

/** R39 release notice: an open release, or one Amara confirmed in the last week. */
async function latestRelease(db: Db, familyId: string, now: Date): Promise<TeenWeek["release"]> {
  const rows = await db.select().from(t.releases).where(eq(t.releases.familyId, familyId));
  const open = rows.find((r) => r.confirmedAt === null);
  if (open) return { cents: open.savedCents + open.matchCents, confirmed: false };
  const sent = rows.filter((r) => r.confirmedAt && now.getTime() - r.confirmedAt.getTime() < WEEK_MS)
    .sort((a, b) => b.confirmedAt!.getTime() - a.confirmedAt!.getTime())[0];
  return sent ? { cents: sent.savedCents + sent.matchCents, confirmed: true } : null;
}

/** The newest promotion by the engine, if she hasn't tapped "Nice" on it yet. Evidence from the review read model. */
async function unseenLevelUp(db: Db, familyId: string, seenAt: Date | null): Promise<TeenWeek["levelUp"]> {
  const [c] = await db.select().from(t.levelChanges).where(eq(t.levelChanges.familyId, familyId)).orderBy(desc(t.levelChanges.at)).limit(1);
  if (!c || c.by !== "engine" || c.toLevel <= c.fromLevel || (seenAt && c.at <= seenAt)) return null;
  const { evidence: e } = await monthReviewView(db, familyId);
  return {
    fromLevel: c.fromLevel as Level, toLevel: c.toLevel as Level, weeks: e.weeks, kept: e.kept,
    savedPct: e.allowanceCents > 0 ? Math.round((e.savedCents / e.allowanceCents) * 100) : 0,
  };
}

/** "Nice": the level-up moment has been seen. */
export async function markLevelSeen(deps: Pick<Deps, "db">, familyId: string): Promise<void> {
  const [c] = await deps.db.select({ at: t.levelChanges.at }).from(t.levelChanges)
    .where(eq(t.levelChanges.familyId, familyId)).orderBy(desc(t.levelChanges.at)).limit(1);
  if (c) await deps.db.update(t.families).set({ teenSeenLevelAt: c.at }).where(eq(t.families.id, familyId));
}

// ---- shopping ---------------------------------------------------------------

/** The shops her active grant allows, by Channel3 website id (the agent's and search's only reach, D6). */
export async function allowedShops(db: Db, familyId: string): Promise<{ domains: string[]; merchantIdByDomain: Record<string, string> } | null> {
  const g = await getActiveGrant(db, familyId);
  if (!g) return null;
  const payees = g.body.constraints.find((c) => c.type === "payment.allowed_payees") as { merchantIds?: string[] } | undefined;
  const ids = payees?.merchantIds ?? [];
  const rows = ids.length ? await db.select().from(t.merchants).where(inArray(t.merchants.id, ids)) : [];
  const merchantIdByDomain = Object.fromEntries(rows.filter((m) => m.channel3WebsiteId).map((m) => [m.channel3WebsiteId as string, m.id]));
  return { domains: Object.keys(merchantIdByDomain), merchantIdByDomain };
}

/** A one-item cart for a product from an allowed shop, or null if the shop isn't hers. */
export function cartFor(p: Product, merchantIdByDomain: Record<string, string>): Cart | null {
  const merchantId = merchantIdByDomain[p.domain];
  if (!merchantId) return null;
  return { merchantId, items: [{ sku: p.id, title: p.title, qty: 1, unitCents: p.priceCents }], totalCents: p.priceCents };
}

export interface Proposed { purchaseId: string; title: string; shop: string; priceCents: number; decision: Decision; reason?: string }

/**
 * Every result is stored as a proposed purchase before she sees it (gate 1 + gate 2), so its label is the
 * engine's answer and Buy / Ask act on exactly that cart. ponytail: unbought proposals stay as `proposed` rows.
 */
export async function proposeCarts(deps: Deps, familyId: string, items: { cart: Cart; reason?: string }[]): Promise<Proposed[]> {
  const names = await shopNames(deps.db, items.map((i) => i.cart));
  const out: Proposed[] = [];
  for (const { cart, reason } of items) { // in order: the engine reads one ledger at a time
    const { purchaseId, decision } = await proposePurchase(deps, familyId, cart);
    out.push({ purchaseId, title: titleOf(cart), shop: names.get(cart.merchantId) ?? "a shop", priceCents: cart.totalCents, decision, reason });
  }
  return out;
}

async function own(db: Db, familyId: string, purchaseId: string): Promise<PurchaseRow> {
  const p = await getPurchase(db, purchaseId);
  if (!p || p.familyId !== familyId) throw new TeenError("unknown purchase");
  return p;
}

/** One of her purchases, for the refusal sheet, the ask screen and the buy outcome. */
export async function teenPurchase(db: Db, familyId: string, purchaseId: string) {
  const p = await own(db, familyId, purchaseId).catch(() => null);
  if (!p) return null;
  const names = await shopNames(db, [p.cart]);
  return { id: p.id, title: titleOf(p.cart), shop: names.get(p.cart.merchantId) ?? "a shop", amountCents: p.cart.totalCents, status: p.status, decision: p.decision };
}

/**
 * I4: the refusal sentence for one of her refused carts. Written once (model, or the template) and stored on the
 * purchase's decision; every later render reuses it, so re-opening the sheet costs no model call.
 */
export async function refusalSentence(
  db: Db, familyId: string, p: { id: string; decision: Decision }, llm: Llm | null, ctx: ExplainCtx,
): Promise<Explanation> {
  if (p.decision.explained) return { ...(await explainRefusal(null, p.decision, ctx)), sentence: p.decision.explained };
  const e = await explainRefusal(llm, p.decision, ctx);
  await db.update(t.purchases).set({ decision: { ...p.decision, explained: e.sentence } })
    .where(and(eq(t.purchases.id, p.id), eq(t.purchases.familyId, familyId)));
  return e;
}

/** Buy: settles a cart the engine already allowed (R12 re-check, slip, PayPal). Anything else is left alone. */
export async function buy(deps: Deps, familyId: string, purchaseId: string): Promise<SettleResult> {
  const p = await own(deps.db, familyId, purchaseId);
  if (p.status !== "proposed") return { status: p.status };
  return settlePurchase(deps, purchaseId);
}

/** Whether asking about this purchase makes a request Amara can approve (needs her OK, or R40: over budget only). */
export const askable = (p: Pick<PurchaseRow, "status" | "decision">): "request" | "message" | null =>
  p.status === "needs_approval" || (p.status === "refused" && liftableOverage(p.decision) !== null) ? "request"
    : p.status === "refused" ? "message" : null;

/**
 * Ask Amara. A cart that needs her OK, or is over this week's budget and nothing else (R40), becomes a real request
 * scoped to that cart (F9). Any other refusal can't be approved by anyone, so she is told about it instead: a note.
 */
export async function askAmara(deps: Pick<Deps, "db" | "now">, familyId: string, purchaseId: string, reason: string | null): Promise<"request" | "message"> {
  const p = await own(deps.db, familyId, purchaseId);
  const g = await getActiveGrant(deps.db, familyId);
  if (!g || g.expiresAt <= await deps.now(familyId)) throw new TeenError("rules are not in force");
  const kind = askable(p);
  if (kind === "request") {
    await requestApproval(deps, familyId, "purchase", p.id, p.cartHash, reason);
    return "request";
  }
  if (kind !== "message") throw new TeenError(`purchase is ${p.status}`);
  const [names, ledger] = await Promise.all([shopNames(deps.db, [p.cart]), ledgerView(deps.db, familyId, await deps.now(familyId))]);
  const left = Math.max(0, g.body.weeklyCents - ledger.spentThisWeekCents);
  const what = `${titleOf(p.cart)}, ${formatCents(p.cart.totalCents)} at ${names.get(p.cart.merchantId) ?? "a shop"} (${formatCents(left)} left this week)`;
  await nudge(deps, familyId, reason ? `${what} — “${reason}”` : what);
  return "message";
}

/**
 * Records Zoe's nudge (null note = "renew my rules"); Amara's home shows it.
 * ponytail: one slot per family, so a newer nudge replaces an unread older one; a nudges table if that ever matters.
 */
export async function nudge(deps: Pick<Deps, "db" | "now">, familyId: string, note: string | null): Promise<void> {
  const at = await deps.now(familyId);
  await deps.db.update(t.families).set({ teenNudgeAt: at, teenNudgeNote: note?.slice(0, 300) ?? null }).where(eq(t.families.id, familyId));
}

/** Purchases she has open with Amara (so the ask screen can say "already asked"). */
export async function openAsk(db: Db, familyId: string, purchaseId: string): Promise<boolean> {
  const [a] = await db.select({ id: t.approvals.id }).from(t.approvals).where(and(
    eq(t.approvals.familyId, familyId), eq(t.approvals.subjectId, purchaseId), isNull(t.approvals.result), isNull(t.approvals.expiredAt))).limit(1);
  return !!a;
}

const HOUR_MS = 3_600_000;
// I3: rows, not searches, are counted, and one search stores ~6, so the limit is generous; the daily caps bound cost.
export const SHOP_HOURLY_LIMIT = 300;
export const THROTTLED = "Lots of looking this hour — try again in a few minutes.";

/**
 * Every search, link and agent run costs real Channel3 (and model) calls and stores purchase rows, so: at most
 * SHOP_HOURLY_LIMIT purchase rows an hour (real time, not demo time). Cost is bounded by the daily caps in takeDaily.
 * ponytail: no per-run gap — it keyed on the newest purchase row, which a demo reset/freshen creates, so it refused
 * the first agent run of a judge who had just arrived.
 */
export async function shopThrottle(db: Db, familyId: string, _mode: "agent" | "link" | "search", realNow: number = Date.now()): Promise<string | null> {
  const rows = await db.select({ at: t.purchases.createdAt }).from(t.purchases)
    .where(and(eq(t.purchases.familyId, familyId), gt(t.purchases.createdAt, new Date(realNow - HOUR_MS))));
  if (rows.length >= SHOP_HOURLY_LIMIT) return THROTTLED;
  return null;
}
