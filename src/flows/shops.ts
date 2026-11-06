// Amara controls Zoe's shops (levels are defaults, not gates); Zoe searches and asks. No AI anywhere in here.
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { getActiveGrant, getLatestGrant } from "@/db/repo";
import type { Level } from "@/engine/ladder";
import { normaliseDomain } from "@/flows/approvals";
import { GrantError, NO_LEVEL, buildForLevel, chooseShop, merchantForDomain, withFamilyLock } from "@/flows/grant";
import type { Deps } from "@/flows/purchase";
import { takeDaily } from "@/flows/usage";
import { SHOP_QUERY_MAX } from "@/ui/grantWords";

export { SHOP_QUERY_MAX };
const MAX_SITES = 10;
const NAME_MAX = 80;

/** Every merchant id any list in the rules names. */
const idsOfAll = (cs: { type: string }[]): string[] => cs.flatMap((c) => {
  const m = (c as { merchantIds?: unknown }).merchantIds;
  return Array.isArray(m) ? (m as string[]) : [];
});

export interface ListedShop { merchantId: string; name: string; domain: string; note: string }
export interface ShopList { level: Level; inForce: boolean; shops: ListedShop[] }

const idsOf = (cs: { type: string }[], type: string): string[] => cs.flatMap((c) => {
  const m = (c as { merchantIds?: unknown }).merchantIds;
  return c.type === type && Array.isArray(m) ? (m as string[]) : [];
});

/**
 * Zoe's shops as Amara sees them: the rules in force, or (none in force) what her next signing at her latest level
 * would give, choices included. Read-only.
 */
export async function guardianShops(db: Db, familyId: string, now: Date): Promise<ShopList> {
  const latest = await getActiveGrant(db, familyId);
  const cur = latest && latest.expiresAt > now ? latest : null; // past its end date: not in force (same as suggestShop)
  const level = ((latest ?? await getLatestGrant(db, familyId))?.level ?? 1) as Level;
  const cs = cur?.body.constraints
    ?? (await buildForLevel(db, familyId, level, 0, { commitmentFloorPct: 10, matchPct: 100, fundAllowlist: [] }, now)).constraints;
  const ids = idsOf(cs, "payment.allowed_payees");
  const books = new Set(idsOf(cs, "checkout.semantic_category"));
  const [rows, choices] = await Promise.all([
    ids.length ? db.select().from(t.merchants).where(inArray(t.merchants.id, ids)) : [],
    db.select().from(t.shopChoices).where(and(eq(t.shopChoices.familyId, familyId), eq(t.shopChoices.choice, "added"))),
  ]);
  const added = new Set(choices.map((c) => c.merchantId));
  const byId = new Map(rows.map((m) => [m.id, m]));
  const shops = ids.flatMap((id): ListedShop[] => {
    const m = byId.get(id);
    if (!m) return [];
    const note = added.has(id) || m.addedByFamilyId ? "added by you" : `from Level ${m.opensAtLevel}`;
    return [{ merchantId: id, name: m.name, domain: m.domain, note: books.has(id) ? `${note} · books only` : note }];
  });
  return { level, inForce: cur !== null, shops };
}

export interface FoundSite { domain: string; name: string; onList: boolean; opensAt: number | null }
export type SiteSearch = { ok: true; sites: FoundSite[] } | { ok: false; error: "query" | "cap" };

/**
 * Channel3 website search for a shop's name (Amara's "Add a shop" and Zoe's "Suggest a shop"). Counted against the
 * family's daily cap BEFORE Channel3 is called; Amara and Zoe have separate counters (`kind`), so Zoe (or a judge on her
 * side of the demo) using hers up never blocks Amara's. `opensAt` is set only when the shop usually opens above her level.
 */
export async function searchShopSites(
  deps: Pick<Deps, "db" | "now" | "channel3">, familyId: string, query: string, kind: "shop_sites" | "teen_shop_sites",
): Promise<SiteSearch> {
  const q = query.trim();
  if (!q || q.length > SHOP_QUERY_MAX) return { ok: false, error: "query" };
  if (!(await takeDaily(deps.db, familyId, kind))) return { ok: false, error: "cap" };
  const raw = await deps.channel3.websites(q);
  const seen = new Set<string>();
  const found = raw.flatMap((w) => {
    let domain: string;
    try { domain = normaliseDomain(w.domain); } catch { return []; } // not a usable shop address: left out
    if (seen.has(domain)) return [];
    seen.add(domain);
    return [{ domain, name: (w.name || domain).trim().slice(0, NAME_MAX) || domain }];
  }).slice(0, MAX_SITES);
  if (found.length === 0) return { ok: true, sites: [] };
  const list = await guardianShops(deps.db, familyId, await deps.now(familyId));
  const onList = new Set(list.shops.map((s) => s.domain));
  const known = await deps.db.select().from(t.merchants).where(and(inArray(t.merchants.channel3WebsiteId, found.map((f) => f.domain)),
    or(isNull(t.merchants.addedByFamilyId), eq(t.merchants.addedByFamilyId, familyId))));
  const opens = new Map(known.map((m) => [m.channel3WebsiteId, m.opensAtLevel]));
  return {
    ok: true,
    sites: found.map((f) => {
      const at = opens.get(f.domain);
      return { ...f, onList: onList.has(f.domain), opensAt: at !== undefined && at > list.level && at !== NO_LEVEL ? at : null };
    }),
  };
}

/** Amara adds a shop, at any level. Applies now if rules are in force (version returned), else is recorded (null). */
export async function addShop(deps: Pick<Deps, "db" | "now">, familyId: string, site: { domain: string; name: string }): Promise<{ name: string; version: number | null }> {
  const domain = normaliseDomain(site.domain); // throws ApprovalError on junk
  const name = site.name.trim().slice(0, NAME_MAX) || domain;
  return withFamilyLock(deps, familyId, async (tx, now) => {
    const m = await merchantForDomain(tx, familyId, domain, name);
    return { name: m.name, version: await chooseShop(tx, familyId, m.id, "added", now) };
  });
}

/**
 * Amara removes a shop: off every list, and it stays off through re-signing and level-ups until she adds it back.
 * Any shop her active rules name can be removed, even a merchant row another family owns: before shop choices,
 * approving a suggestion could reuse another family's row, and a shop on her rules must never be one she can't take off.
 */
export async function removeShop(deps: Pick<Deps, "db" | "now">, familyId: string, merchantId: string): Promise<{ name: string; version: number | null }> {
  return withFamilyLock(deps, familyId, async (tx, now) => {
    const onRules = idsOfAll((await getActiveGrant(tx, familyId))?.body.constraints ?? []).includes(merchantId);
    const [m] = await tx.select().from(t.merchants).where(and(eq(t.merchants.id, merchantId),
      onRules ? undefined : or(isNull(t.merchants.addedByFamilyId), eq(t.merchants.addedByFamilyId, familyId))));
    if (!m) throw new GrantError(`unknown shop ${merchantId}`);
    return { name: m.name, version: await chooseShop(tx, familyId, m.id, "removed", now) };
  });
}
