import { randomBytes } from "node:crypto";
import { and, eq, max } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { getActiveGrant, getVault } from "@/db/repo";
import { deletePaymentToken } from "@/adapters/paypal/vault";
import { grantForLevel, validateCommitment, type Level } from "@/engine/ladder";
import type { Grant } from "@/engine/types";
import type { Deps } from "@/flows/purchase";

const WEEK_MS = 7 * 86_400_000;

export class GrantError extends Error {
  constructor(message: string, readonly minCents?: number) { super(message); this.name = "GrantError"; }
}

type Settings = Pick<Grant, "commitmentFloorPct" | "matchPct" | "fundAllowlist">;

/** Runs `fn` in one transaction holding the family-row lock (same lock as settlePurchase / decideApproval). */
export async function withFamilyLock<T>(deps: Deps, familyId: string, fn: (tx: Db, now: Date) => Promise<T>): Promise<T> {
  return deps.db.transaction(async (tx) => {
    const rows = await tx.select({ id: t.families.id }).from(t.families).where(eq(t.families.id, familyId)).for("update");
    if (rows.length === 0) throw new GrantError(`unknown family ${familyId}`);
    return fn(tx, await deps.now(familyId));
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

/** A fresh grant at `level`: merchants opened by that level, bookshops from class 'books'. */
export async function buildForLevel(tx: Db, familyId: string, level: Level, version: number, s: Settings, now: Date): Promise<Grant> {
  const ms = (await tx.select().from(t.merchants)).filter((m) => m.opensAtLevel <= level && (m.addedByFamilyId === null || m.addedByFamilyId === familyId));
  const byClass: Record<string, string[]> = {};
  for (const m of ms) (byClass[m.class] ??= []).push(m.id);
  return grantForLevel(level, { id: crypto.randomUUID(), familyId, version, ...s }, byClass, byClass.books ?? [], now);
}

/** New grant at `level`, keeping the active grant's settings (or defaults). Caller holds the family lock. */
export async function installLevel(tx: Db, familyId: string, level: Level, now: Date, s?: Partial<Settings>): Promise<Grant> {
  const cur = (await getActiveGrant(tx, familyId))?.body;
  const base: Settings = {
    commitmentFloorPct: s?.commitmentFloorPct ?? cur?.commitmentFloorPct ?? 10,
    matchPct: s?.matchPct ?? cur?.matchPct ?? 100,
    fundAllowlist: s?.fundAllowlist ?? cur?.fundAllowlist ?? [],
  };
  return installGrant(tx, familyId, (version) => buildForLevel(tx, familyId, level, version, base, now), now);
}

export async function signGrant(deps: Deps, familyId: string, draft: { level: Level } & Partial<Settings>): Promise<Grant> {
  return withFamilyLock(deps, familyId, (tx, now) => installLevel(tx, familyId, draft.level, now, {
    commitmentFloorPct: draft.commitmentFloorPct ?? 10, matchPct: draft.matchPct ?? 100, fundAllowlist: draft.fundAllowlist ?? [],
  }));
}

/** Same level and settings (incl. shops approved since), fresh 7-day window. */
export async function renewGrant(deps: Deps, familyId: string): Promise<Grant> {
  return withFamilyLock(deps, familyId, async (tx, now) => {
    const cur = await getActiveGrant(tx, familyId);
    if (!cur) throw new GrantError("no active grant to renew");
    const expiresAt = new Date(now.getTime() + WEEK_MS).toISOString();
    return installGrant(tx, familyId, (version) => ({
      ...cur.body, id: crypto.randomUUID(), version, signedAt: now.toISOString(), expiresAt,
      constraints: cur.body.constraints.map((c) =>
        c.type === "payment.execution_date" ? { ...c, notBefore: now.toISOString(), notAfter: expiresAt } : c),
    }), now);
  });
}

export async function guardianSetLevel(deps: Deps, familyId: string, level: Level, reason: string): Promise<Grant> {
  const why = typeof reason === "string" ? reason.trim() : "";
  if (!why) throw new GrantError("a reason is required to change the level");
  return withFamilyLock(deps, familyId, async (tx, now) => {
    const cur = await getActiveGrant(tx, familyId);
    const body = await installLevel(tx, familyId, level, now);
    await tx.insert(t.levelChanges).values({
      id: crypto.randomUUID(), familyId, fromLevel: cur?.level ?? 0, toLevel: level, by: "guardian", reason: why, at: now,
    });
    return body;
  });
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

export type RevokeResult = { revoked: true; paypalTokenDeleted: boolean; error?: string; reason?: "no_vault" };

/** Fail closed: the local revoke is committed first and stands even if PayPal's delete fails. */
export async function revoke(deps: Deps, familyId: string): Promise<RevokeResult> {
  await withFamilyLock(deps, familyId, (tx) =>
    tx.update(t.grants).set({ status: "revoked" }).where(and(eq(t.grants.familyId, familyId), eq(t.grants.status, "active"))));
  const vault = await getVault(deps.db, familyId);
  if (!vault) return { revoked: true, paypalTokenDeleted: false, reason: "no_vault" };
  try {
    await deletePaymentToken(deps.paypal, vault.paymentTokenId);
  } catch (e) {
    // deleted_at stays null so the delete can be retried; the grant is already revoked.
    return { revoked: true, paypalTokenDeleted: false, error: e instanceof Error ? e.message : String(e) };
  }
  await deps.db.update(t.vault).set({ deletedAt: await deps.now(familyId) }).where(eq(t.vault.familyId, familyId));
  return { revoked: true, paypalTokenDeleted: true };
}

export async function resetTeenLink(deps: Deps, familyId: string): Promise<{ token: string }> {
  const token = randomBytes(24).toString("base64url");
  const rows = await deps.db.update(t.families).set({ teenToken: token }).where(eq(t.families.id, familyId)).returning({ id: t.families.id });
  if (rows.length === 0) throw new GrantError(`unknown family ${familyId}`);
  return { token };
}
