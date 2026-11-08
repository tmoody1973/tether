import { randomBytes } from "node:crypto";
import { and, eq, isNull, max, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { getActiveGrant, getFamily, getLatestGrant, getVault, type GrantRow } from "@/db/repo";
import { deletePaymentToken } from "@/adapters/paypal/vault";
import { LEVELS, asOf, commitmentFloorCents, grantForLevel, validSpending, validateCommitment, withSpending, type Level } from "@/engine/ladder";
import { validCosts } from "@/engine/pricing";
import { ledgerView } from "@/ledger/ledger";
import type { Constraint, CostTerms, Grant, SpendingMode } from "@/engine/types";
import type { Deps } from "@/flows/purchase";

const WEEK_MS = 7 * 86_400_000;

export class GrantError extends Error {
  constructor(message: string, readonly minCents?: number) { super(message); this.name = "GrantError"; }
}

/** Monday 00:00 UTC of the ISO week containing d. */
export const weekStart = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
export const nextMonday = (d: Date): Date => new Date(weekStart(d).getTime() + WEEK_MS);

/**
 * Whether `g` covers the week starting `monday` (decision 029): it hadn't ended before the week began, and wasn't
 * stopped before it. Rules stopped during the week still cover it: that week closes as promised.
 */
export const coversWeek = (g: Pick<GrantRow, "expiresAt" | "status" | "revokedAt">, monday: Date): boolean =>
  g.expiresAt > monday && (g.status !== "revoked" || (g.revokedAt !== null && g.revokedAt >= monday));

/** This week's allowance under the latest rules, or null when no rules cover this week. */
export function thisWeeksCents(latest: GrantRow | null, now: Date): number | null {
  return latest && coversWeek(latest, weekStart(now)) ? asOf(latest.body, now).weeklyCents : null;
}

/** This week's numbers behind "Change this week too": the words are weekChangeWords(these). */
export interface WeekChange { fromCents: number; toCents: number; spentCents: number; promisedCents: number }

/** "Change this week too" was confirmed on numbers that are no longer true (she spent since, or the week moved). Nothing changed. */
export class WeekChangedError extends GrantError {
  constructor(readonly change: WeekChange) { super("this week's numbers changed since they were shown"); this.name = "WeekChangedError"; }
}

/**
 * false: a different weekly amount waits for next week. true: apply it this week (no check; tests and internal use).
 * The rules page sends what Amara was shown; it applies only if this week's amount, her spending and the savings
 * promise the week is judged on (behind the level-up warning) are all still those.
 */
export type ApplyNow = boolean | { shownFromCents: number; shownSpentCents: number; shownPromisedCents: number };

async function checkShown(tx: Db, familyId: string, latest: GrantRow | null, body: Grant, now: Date, shown: Exclude<ApplyNow, boolean>) {
  const fromCents = thisWeeksCents(latest, now);
  const spentCents = (await ledgerView(tx, familyId, now)).spentThisWeekCents;
  // The family's commitment in force (a pending one is promoted when a week closes), floored as week close judges it.
  const [fam] = await tx.select({ c: t.families.commitmentCents }).from(t.families).where(eq(t.families.id, familyId));
  const promisedCents = Math.max(fam?.c ?? 0, commitmentFloorCents(body.weeklyCents, body.commitmentFloorPct));
  if (fromCents === shown.shownFromCents && spentCents === shown.shownSpentCents && promisedCents === shown.shownPromisedCents) return;
  throw new WeekChangedError({ fromCents: fromCents ?? body.weeklyCents, toCents: body.weeklyCents, spentCents, promisedCents });
}

/**
 * The amount this week keeps when `body` replaces the rules covering it (029): set unless Amara chose to change this
 * week too, or the weekly amount is the same. Renewals and shop changes copy the body, so they keep it as it is.
 */
function keepThisWeek(body: Grant, latest: GrantRow | null, now: Date, applyNow: boolean): Grant {
  const kept = thisWeeksCents(latest, now);
  if (applyNow || kept === null || kept === body.weeklyCents) return body;
  return { ...body, thisWeek: { weeklyCents: kept, until: nextMonday(now).toISOString() } };
}

/** A level change without a reason: only Amara can change a level, and it goes on the record. */
export class ReasonRequiredError extends GrantError {
  constructor() { super("a reason is required to change the level"); this.name = "ReasonRequiredError"; }
}

/** Rules were stopped (revoked): a level can't be overruled on rules that aren't in force. Sign new ones instead. */
export class RulesStoppedError extends GrantError {
  constructor() { super("rules are stopped — sign new ones"); this.name = "RulesStoppedError"; }
}

type Settings = Pick<Grant, "commitmentFloorPct" | "matchPct" | "fundAllowlist"> & Pick<Grant, "spending" | "investing" | "costs">;

/** Runs `fn` in one transaction holding the family-row lock (same lock as settlePurchase / decideApproval). */
export async function withFamilyLock<T>(deps: Pick<Deps, "db" | "now">, familyId: string, fn: (tx: Db, now: Date) => Promise<T>): Promise<T> {
  return deps.db.transaction(async (tx) => {
    const rows = await tx.select({ id: t.families.id }).from(t.families).where(eq(t.families.id, familyId)).for("update");
    if (rows.length === 0) throw new GrantError(`unknown family ${familyId}`);
    return fn(tx, await deps.now(familyId, tx)); // R34: the clock is read on the locked connection
  });
}

/** Expires the active grant (if any) and inserts `body` as the next version. Caller holds the family lock. */
export async function installGrant(tx: Db, familyId: string, make: (version: number) => Grant | Promise<Grant>, now: Date): Promise<Grant> {
  const [{ v }] = await tx.select({ v: max(t.grants.version) }).from(t.grants).where(eq(t.grants.familyId, familyId));
  const body = await make((v ?? 0) + 1);
  await tx.update(t.grants).set({ status: "expired" }).where(and(eq(t.grants.familyId, familyId), eq(t.grants.status, "active")));
  await tx.insert(t.grants).values({
    id: body.id, familyId, version: body.version, level: body.level, body,
    signedAt: now, expiresAt: new Date(body.expiresAt), status: "active",
  });
  return body;
}

/** A fresh grant at `level`: merchants opened by that level, bookshops from class 'books', then Amara's shop choices. */
export async function buildForLevel(tx: Db, familyId: string, level: Level, version: number, s: Settings, now: Date): Promise<Grant> {
  const ms = (await tx.select().from(t.merchants)).filter((m) => m.opensAtLevel <= level && (m.addedByFamilyId === null || m.addedByFamilyId === familyId));
  const byClass: Record<string, string[]> = {};
  for (const m of ms) (byClass[m.class] ??= []).push(m.id);
  const { spending, investing, costs, ...base } = s;
  const g = grantForLevel(level, { id: crypto.randomUUID(), familyId, version, ...base }, byClass, byClass.books ?? [], now);
  const constraints = await applyChoices(tx, familyId, spending ? withSpending(g.constraints, level, spending) : g.constraints);
  return { ...g, constraints, ...(spending ? { spending } : {}), ...(investing === false ? { investing } : {}), ...(costs ? { costs } : {}) };
}

// ---- Amara's shop choices (levels are defaults, not gates) ----------------------------------------------------------

type ShopChoice = (typeof t.shopChoices.$inferSelect)["choice"];
const OPENS_SHOP = new Set(["payment.allowed_payees", "checkout.allowed_merchants"]);
const namesShops = (c: Constraint): c is Constraint & { merchantIds: string[] } => Array.isArray((c as { merchantIds?: unknown }).merchantIds);

/** Off EVERY list that names merchants: a removed shop can't be paid, searched or checked. */
export const withoutShop = (cs: Constraint[], merchantId: string): Constraint[] =>
  cs.map((c) => (namesShops(c) ? { ...c, merchantIds: c.merchantIds.filter((id) => id !== merchantId) } : c));

/**
 * On the lists that open a shop. A bookshop also joins the books-only check when the rules carry one.
 * ponytail: Level 1 rules carry no books-only check, so a bookshop Amara opens early at Level 1 has none.
 */
export const withShop = (cs: Constraint[], merchantId: string, bookshop: boolean): Constraint[] =>
  cs.map((c) => (namesShops(c) && (OPENS_SHOP.has(c.type) || (bookshop && c.type === "checkout.semantic_category"))
    ? { ...c, merchantIds: [...new Set([...c.merchantIds, merchantId])] } : c));

/** `cs` with Amara's added shops put on and her removed shops taken off. */
async function applyChoices(db: Db, familyId: string, cs: Constraint[]): Promise<Constraint[]> {
  const rows = await db.select({ id: t.shopChoices.merchantId, choice: t.shopChoices.choice, cls: t.merchants.class })
    .from(t.shopChoices).innerJoin(t.merchants, eq(t.merchants.id, t.shopChoices.merchantId)).where(eq(t.shopChoices.familyId, familyId));
  return rows.reduce((acc, r) => (r.choice === "removed" ? withoutShop(acc, r.id) : withShop(acc, r.id, r.cls === "books")), cs);
}

/**
 * A shop outside the shared catalogue opens at no level: it is in her rules only while Amara's 'added' choice says so,
 * so clearing the choices (demo reset) takes it out again. Never shown as "opens at Level N".
 */
export const NO_LEVEL = 99;

/** The merchant row this family sees for `domain` (shared, or its own); a new domain gets a family-only 'general' row. */
export async function merchantForDomain(tx: Db, familyId: string, domain: string, name: string) {
  const [found] = await tx.select().from(t.merchants).where(and(eq(t.merchants.channel3WebsiteId, domain),
    or(isNull(t.merchants.addedByFamilyId), eq(t.merchants.addedByFamilyId, familyId))));
  if (found) return found;
  const [made] = await tx.insert(t.merchants).values({
    id: crypto.randomUUID(), name, domain, class: "general", channel3WebsiteId: domain, opensAtLevel: NO_LEVEL, addedByFamilyId: familyId,
  }).returning();
  return made;
}

/**
 * Records Amara's choice for one shop (it sticks through re-signing and level-ups) and, when rules are in force, applies
 * it now as the next version with the same end date: a shop change never extends the week. With no rules in force
 * (none active, or past their end date) it is only recorded; the next signing or renewal picks it up. Returns the new version, or null. Caller holds the family lock.
 */
export async function chooseShop(tx: Db, familyId: string, merchantId: string, choice: ShopChoice, now: Date): Promise<number | null> {
  await tx.insert(t.shopChoices).values({ familyId, merchantId, choice, updatedAt: now })
    .onConflictDoUpdate({ target: [t.shopChoices.familyId, t.shopChoices.merchantId], set: { choice, updatedAt: now } });
  const cur = await getActiveGrant(tx, familyId);
  if (!cur || cur.expiresAt <= now) return null; // past its end date counts as not in force (as suggestShop treats it)
  const constraints = await applyChoices(tx, familyId, cur.body.constraints);
  if (JSON.stringify(constraints) === JSON.stringify(cur.body.constraints)) return cur.version; // already so: no new version
  const body = await installGrant(tx, familyId, (version) => ({
    ...cur.body, id: crypto.randomUUID(), version, signedAt: now.toISOString(), constraints,
  }), now);
  return body.version;
}

/** Shop names a grant at `level` would allow, chosen exactly as signing would choose them. Read-only. */
export async function shopsForLevel(db: Db, familyId: string, level: Level, now: Date): Promise<string[]> {
  const g = await buildForLevel(db, familyId, level, 0, { commitmentFloorPct: 10, matchPct: 100, fundAllowlist: [] }, now);
  const payees = g.constraints.find((c): c is { type: "payment.allowed_payees"; merchantIds: string[] } => c.type === "payment.allowed_payees");
  const ids = payees?.merchantIds ?? [];
  const names = new Map((await db.select({ id: t.merchants.id, name: t.merchants.name }).from(t.merchants)).map((m) => [m.id, m.name]));
  return ids.map((id) => names.get(id) ?? id);
}

/** New grant at `level`, keeping the latest grant's settings (or defaults), even after a revoke. Caller holds the family lock. */
export async function installLevel(
  tx: Db, familyId: string, level: Level, now: Date, s?: Partial<Settings>, keep?: { latest: GrantRow | null; applyNow: ApplyNow },
): Promise<Grant> {
  const cur = (await getLatestGrant(tx, familyId))?.body;
  // Decision 030: "every purchase" survives a level change; an "up to" amount was chosen for that level's money, so a
  // new level starts from its own rule unless Amara sets one again.
  const keptSpending = cur?.spending && (cur.spending.mode === "every" || cur.level === level) ? cur.spending : undefined;
  const base: Settings = {
    commitmentFloorPct: s?.commitmentFloorPct ?? cur?.commitmentFloorPct ?? 10,
    matchPct: s?.matchPct ?? cur?.matchPct ?? 100,
    fundAllowlist: s?.fundAllowlist ?? cur?.fundAllowlist ?? [],
    spending: s?.spending ?? keptSpending,
    investing: s?.investing ?? cur?.investing,
    costs: s?.costs ?? cur?.costs,
  };
  if (base.spending && !validSpending(base.spending, LEVELS[level].weeklyCents)) {
    throw new GrantError("spending amount must be between $1 and the weekly amount");
  }
  if (base.costs && !validCosts(base.costs)) throw new GrantError("cost estimates out of range");
  return installGrant(tx, familyId, async (version) => {
    const body = await buildForLevel(tx, familyId, level, version, base, now);
    if (!keep) return body; // an engine level-up applies now
    if (typeof keep.applyNow === "object") await checkShown(tx, familyId, keep.latest, body, now, keep.applyNow); // before any write
    return keepThisWeek(body, keep.latest, now, keep.applyNow !== false);
  }, now);
}

/**
 * Amara signs a grant at `level`. Settings she leaves out keep the active grant's values.
 * Moving Zoe to a different level than her latest grant (active, ended or revoked) is an override,
 * so it needs a reason (recorded). After a revoke she keeps her level; signing again doesn't reset her to Level 1.
 * A different weekly amount starts next Monday unless `applyNow` ("Change this week too"); shops and approvals apply now.
 */
export async function signGrant(
  deps: Pick<Deps, "db" | "now">, familyId: string, draft: { level: Level; reason?: string; applyNow?: ApplyNow } & Partial<Settings>,
): Promise<Grant> {
  const why = typeof draft.reason === "string" ? draft.reason.trim() : "";
  return withFamilyLock(deps, familyId, async (tx, now) => {
    const cur = await getLatestGrant(tx, familyId);
    const changesLevel = cur !== null && cur.level !== draft.level;
    if (changesLevel && !why) throw new ReasonRequiredError();
    const body = await installLevel(tx, familyId, draft.level, now, {
      commitmentFloorPct: draft.commitmentFloorPct, matchPct: draft.matchPct, fundAllowlist: draft.fundAllowlist,
      spending: draft.spending, investing: draft.investing, costs: draft.costs,
    }, { latest: cur, applyNow: draft.applyNow ?? false });
    if (changesLevel) {
      await tx.insert(t.levelChanges).values({
        id: crypto.randomUUID(), familyId, fromLevel: cur.level, toLevel: draft.level, by: "guardian", reason: why, at: now,
      });
    }
    return body;
  });
}

/** Same level and settings (incl. shops approved since), fresh 7-day window. Shop choices made while the rules had
 * lapsed were only recorded, so they are applied here: a renewal can never bring back a removed shop. */
export async function renewGrant(deps: Deps, familyId: string): Promise<Grant> {
  return withFamilyLock(deps, familyId, async (tx, now) => {
    const cur = await getActiveGrant(tx, familyId);
    if (!cur) throw new GrantError("no active grant to renew");
    const expiresAt = new Date(now.getTime() + WEEK_MS).toISOString();
    const constraints = await applyChoices(tx, familyId, cur.body.constraints.map((c) =>
      c.type === "payment.execution_date" ? { ...c, notBefore: now.toISOString(), notAfter: expiresAt } : c));
    return installGrant(tx, familyId, (version) => ({
      ...cur.body, id: crypto.randomUUID(), version, signedAt: now.toISOString(), expiresAt, constraints,
    }), now);
  });
}

export async function guardianSetLevel(
  deps: Pick<Deps, "db" | "now">, familyId: string, level: Level, reason: string, applyNow: ApplyNow = false,
): Promise<Grant> {
  const why = typeof reason === "string" ? reason.trim() : "";
  if (!why) throw new ReasonRequiredError();
  return withFamilyLock(deps, familyId, async (tx, now) => {
    const cur = await getLatestGrant(tx, familyId);
    if (cur?.status === "revoked") throw new RulesStoppedError(); // stopped rules stay stopped until Amara signs again
    const body = await installLevel(tx, familyId, level, now, undefined, { latest: cur, applyNow });
    await tx.insert(t.levelChanges).values({
      id: crypto.randomUUID(), familyId, fromLevel: cur?.level ?? 0, toLevel: level, by: "guardian", reason: why, at: now,
    });
    return body;
  });
}

// ---- Decision 030: Amara's consent controls on the rules in force ----------------------------------------------------

/** No rules in force to change now; the setting goes in with her next signing. */
export class RulesNotInForceError extends GrantError {
  constructor() { super("no rules in force"); this.name = "RulesNotInForceError"; }
}

/** Changes the rules in force at once, as the next version with the same end date (like a shop change). */
async function changeInForce(deps: Pick<Deps, "db" | "now">, familyId: string, change: (body: Grant) => Grant): Promise<Grant> {
  return withFamilyLock(deps, familyId, async (tx, now) => {
    const cur = await getActiveGrant(tx, familyId);
    if (!cur || cur.expiresAt <= now) throw new RulesNotInForceError();
    const next = change(cur.body);
    return installGrant(tx, familyId, (version) => ({ ...next, id: crypto.randomUUID(), version, signedAt: now.toISOString() }), now);
  });
}

/** "Ask me before every purchase" or "Up to $X without asking". Applies now; the AI has no path here. */
export function setSpending(deps: Pick<Deps, "db" | "now">, familyId: string, spending: SpendingMode): Promise<Grant> {
  return changeInForce(deps, familyId, (b) => {
    if (!validSpending(spending, b.weeklyCents)) throw new GrantError("spending amount must be between $1 and the weekly amount");
    return { ...b, spending, constraints: withSpending(b.constraints, b.level, spending) };
  });
}

/** Investing on or off. Off refuses new proposals (engine/invest.ts); nothing already invested is touched. */
export function setInvesting(deps: Pick<Deps, "db" | "now">, familyId: string, on: boolean): Promise<Grant> {
  return changeInForce(deps, familyId, (b) => {
    const next = { ...b, investing: false };
    if (on) delete (next as Partial<Grant>).investing; // on is the default: absent
    return next;
  });
}

/** Sales tax and shipping estimates. New carts use them; carts already proposed keep theirs (re-checked at payment). */
export function setCosts(deps: Pick<Deps, "db" | "now">, familyId: string, costs: CostTerms): Promise<Grant> {
  return changeInForce(deps, familyId, (b) => {
    if (!validCosts(costs)) throw new GrantError("cost estimates out of range");
    return { ...b, costs };
  });
}

/**
 * Pause or resume spending, at once. While paused every purchase needs Amara's yes (approval.paused); the rules, the
 * saved PayPal and the week are untouched. Not a new rules version: it's a switch, not a signing.
 */
export async function setPaused(deps: Pick<Deps, "db" | "now">, familyId: string, paused: boolean): Promise<void> {
  await withFamilyLock(deps, familyId, (tx, now) =>
    tx.update(t.families).set({ pausedAt: paused ? now : null }).where(eq(t.families.id, familyId)));
}

/** Stored now; takes effect at the next closeWeek. */
export async function setCommitment(deps: Deps, familyId: string, cents: number): Promise<void> {
  await withFamilyLock(deps, familyId, async (tx) => {
    const g = await getActiveGrant(tx, familyId);
    if (!g) throw new GrantError("no active grant");
    const v = validateCommitment(cents, g.body.weeklyCents, g.body.commitmentFloorPct);
    if (!v.ok) throw new GrantError(`commitment must be at least ${v.minCents} cents`, v.minCents);
    await tx.update(t.families).set({ pendingCommitmentCents: cents }).where(eq(t.families.id, familyId));
  });
}

export type RevokeResult = { revoked: true; paypalTokenDeleted: boolean; error?: string; reason?: "no_vault" | "demo_kept" };

/**
 * Fail closed: the local revoke is committed first and stands even if PayPal's delete fails. The stop time is
 * recorded (demo clock), so the week it falls in still closes with the allowance in force (decision 029).
 * The shared demo family keeps its saved PayPal (owner decision, final review C1): deleting it would break the demo
 * for every judge after this one, and re-saving needs Amara's approval at PayPal. Real families delete as always.
 */
export async function revoke(deps: Pick<Deps, "db" | "now" | "paypal">, familyId: string): Promise<RevokeResult> {
  await withFamilyLock(deps, familyId, (tx, now) =>
    tx.update(t.grants).set({ status: "revoked", revokedAt: now }).where(and(eq(t.grants.familyId, familyId), eq(t.grants.status, "active"))));
  const vault = await getVault(deps.db, familyId);
  if (!vault) return { revoked: true, paypalTokenDeleted: false, reason: "no_vault" };
  if ((await getFamily(deps.db, familyId))?.demo) return { revoked: true, paypalTokenDeleted: false, reason: "demo_kept" };
  try {
    await deletePaymentToken(deps.paypal, vault.paymentTokenId);
  } catch (e) {
    // deleted_at stays null so the delete can be retried; the grant is already revoked.
    return { revoked: true, paypalTokenDeleted: false, error: e instanceof Error ? e.message : String(e) };
  }
  await deps.db.update(t.vault).set({ deletedAt: await deps.now(familyId) }).where(eq(t.vault.familyId, familyId));
  return { revoked: true, paypalTokenDeleted: true };
}

export async function resetTeenLink(deps: Pick<Deps, "db">, familyId: string): Promise<{ token: string }> {
  const token = randomBytes(24).toString("base64url");
  const rows = await deps.db.update(t.families).set({ teenToken: token }).where(eq(t.families.id, familyId)).returning({ id: t.families.id });
  if (rows.length === 0) throw new GrantError(`unknown family ${familyId}`);
  return { token };
}
