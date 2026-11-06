// Zoe's map of where her money works (F4): every shop as Open / Ask first / Locked, and "Suggest a shop".
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { getActiveGrant } from "@/db/repo";
import { ledgerView } from "@/ledger/ledger";
import type { Constraint } from "@/engine/types";
import { ApprovalError, normaliseDomain, proposeShop } from "@/flows/approvals";
import type { Deps } from "@/flows/purchase";

export type TileKind = "open" | "ask" | "locked";
/** opensAt: the level a locked shop opens at (null: it's open at her level, just not on her list). */
export interface ShopTile { id: string; name: string; kind: TileKind; booksOnly: boolean; opensAt: number | null }

const ORDER: Record<TileKind, number> = { open: 0, ask: 1, locked: 2 };
const ids = (cs: Constraint[], type: string): string[] => cs.flatMap((c) => {
  const m = (c as { merchantIds?: unknown }).merchantIds;
  return c.type === type && Array.isArray(m) ? (m as string[]) : [];
});

/** The shops she can see (shared ones plus any added for her family), as her rules in force treat them. */
export async function shopMap(db: Db, familyId: string, now: Date): Promise<{ tiles: ShopTile[]; suggested: string[] }> {
  const [grant, ledger, merchants, open] = await Promise.all([
    getActiveGrant(db, familyId), ledgerView(db, familyId, now),
    db.select().from(t.merchants).where(or(isNull(t.merchants.addedByFamilyId), eq(t.merchants.addedByFamilyId, familyId))),
    db.select({ d: t.approvals.subjectId }).from(t.approvals).where(and(eq(t.approvals.familyId, familyId), eq(t.approvals.subject, "shop"),
      isNull(t.approvals.result), isNull(t.approvals.expiredAt), gt(t.approvals.expiresAt, now))),
  ]);
  const cs = grant?.body.constraints ?? [];
  const level = grant?.level ?? 1;
  const payees = new Set(ids(cs, "payment.allowed_payees"));
  const books = new Set(ids(cs, "checkout.semantic_category"));
  const firstTime = cs.some((c) => c.type === "approval.first_time_merchant");
  const tiles = merchants.map((m): ShopTile => {
    const kind: TileKind = !payees.has(m.id) ? "locked" : firstTime && !ledger.merchantsUsed.has(m.id) ? "ask" : "open";
    return { id: m.id, name: m.name, kind, booksOnly: books.has(m.id), opensAt: kind === "locked" && m.opensAtLevel > level ? m.opensAtLevel : null };
  }).sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.opensAt ?? 0) - (b.opensAt ?? 0) || a.name.localeCompare(b.name));
  return { tiles, suggested: open.map((r) => r.d) };
}

export const SUGGEST_REASON_MAX = 200;
export const MAX_OPEN_SUGGESTIONS = 5;

export type SuggestResult =
  | { ok: true; domain: string }
  | { ok: false; error: "domain" | "reason" | "have" | "asked" | "many" | "rules" }
  | { ok: false; error: "level"; level: number };

/** "Suggest a shop": a request on Amara's needs-you list (approving adds it to these rules). */
export async function suggestShop(deps: Deps, familyId: string, input: string, why: string): Promise<SuggestResult> {
  let domain: string;
  try { domain = normaliseDomain(input); } catch (e) {
    if (e instanceof ApprovalError) return { ok: false, error: "domain" };
    throw e;
  }
  const reason = why.trim();
  if (!reason || reason.length > SUGGEST_REASON_MAX) return { ok: false, error: "reason" };
  const now = await deps.now(familyId);
  const grant = await getActiveGrant(deps.db, familyId);
  if (!grant || grant.expiresAt <= now) return { ok: false, error: "rules" };
  const { tiles, suggested } = await shopMap(deps.db, familyId, now);
  if (suggested.includes(domain)) return { ok: false, error: "asked" };
  if (suggested.length >= MAX_OPEN_SUGGESTIONS) return { ok: false, error: "many" };
  const [known] = await deps.db.select().from(t.merchants).where(and(eq(t.merchants.channel3WebsiteId, domain),
    or(isNull(t.merchants.addedByFamilyId), eq(t.merchants.addedByFamilyId, familyId))));
  const tile = known && tiles.find((x) => x.id === known.id);
  if (tile && tile.kind !== "locked") return { ok: false, error: "have" };
  if (tile?.opensAt) return { ok: false, error: "level", level: tile.opensAt };
  await proposeShop(deps, familyId, domain, reason);
  return { ok: true, domain };
}
