import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { cartItems, receiptsForMonth, type MonthReceipt, type ReceiptItem } from "@/db/repo";
import { weekRecords } from "@/ledger/ledger";
import { TOKEN_TTL_MS } from "@/engine/token";
import type { Level, WeekRecord } from "@/engine/ladder";
import type { Grant } from "@/engine/types";
import { clauseText, grantClause } from "@/ui/grantWords";
import { guardianHome, type GuardianHome } from "@/flows/home";

export type GrantStatus = "active" | "ended" | "stopped";

export interface RecordGrant {
  version: number; level: Level; signedAt: Date; expiresAt: Date; status: GrantStatus; weeklyCents: number; shops: string[];
}

export interface RecordReceipt extends MonthReceipt {
  /** The permission slip behind this payment: the clause Amara signed and the single-use token's binding. No secrets. */
  slip: { clause: string; cartHash: string; issuedAt: Date; expiresAt: Date };
}

export interface RecordView {
  home: GuardianHome; month: string; grants: RecordGrant[]; receipts: RecordReceipt[];
  investments: { id: string; symbol: string; amountCents: number; status: (typeof t.investments.$inferSelect)["status"] }[];
  /** Up to the last 4 closed weeks (guardian-only weekly spend). */
  weeks: WeekRecord[];
  /** Money left the budget this month but PayPal hasn't answered yet (no receipt). */
  unreceipted: { purchaseId: string; at: Date; shop: string; items: ReceiptItem[]; amountCents: number; needsCheck: boolean }[];
}

const payees = (g: Grant): string[] =>
  g.constraints.find((c): c is { type: "payment.allowed_payees"; merchantIds: string[] } => c.type === "payment.allowed_payees")?.merchantIds ?? [];

/** Read model for Amara's record of one month (`month` = 'YYYY-MM', demo clock). Family always from the caller. */
export async function guardianRecord(db: Db, familyId: string, month: string, now: Date): Promise<RecordView> {
  const [home, grantRows, receipts, merchants, investments, weeks, paying] = await Promise.all([
    guardianHome(db, familyId, now),
    db.select().from(t.grants).where(eq(t.grants.familyId, familyId)).orderBy(desc(t.grants.version)),
    receiptsForMonth(db, familyId, month),
    db.select({ id: t.merchants.id, name: t.merchants.name }).from(t.merchants),
    db.select({ id: t.investments.id, symbol: t.investments.symbol, amountCents: t.investments.amountCents, status: t.investments.status })
      .from(t.investments).where(eq(t.investments.familyId, familyId)),
    weekRecords(db, familyId),
    db.select({ p: t.purchases, at: t.journal.at }).from(t.purchases)
      .innerJoin(t.journal, and(eq(t.journal.kind, "spend"), eq(t.journal.ref, t.purchases.id)))
      .where(and(eq(t.purchases.familyId, familyId), eq(t.purchases.status, "paying"))),
  ]);
  const name = new Map(merchants.map((m) => [m.id, m.name]));
  const grants = grantRows.map((g): RecordGrant => ({
    version: g.version, level: g.level as Level, signedAt: g.signedAt, expiresAt: g.expiresAt, weeklyCents: g.body.weeklyCents,
    status: g.status === "revoked" ? "stopped" : g.status === "active" && g.expiresAt > now ? "active" : "ended",
    shops: payees(g.body).map((id) => name.get(id) ?? id),
  }));
  const byId = new Map(grantRows.map((g) => [g.id, g]));
  const receipted = new Set(receipts.map((r) => r.purchaseId));
  const unreceipted = paying
    .filter(({ p, at }) => at.toISOString().startsWith(month) && !receipted.has(p.id))
    .map(({ p, at }) => ({ purchaseId: p.id, at, shop: name.get(p.cart.merchantId) ?? "a shop", items: cartItems(p.cart), amountCents: p.cart.totalCents,
      needsCheck: p.chargeError?.startsWith("NEEDS_CHECK") ?? false }));
  return {
    home, month, grants, investments, weeks: weeks.slice(-4), unreceipted,
    receipts: receipts.slice().reverse().map((r) => {
      const g = byId.get(r.grantId);
      const clause = g ? clauseText(grantClause({
        teenName: home.teenName, level: g.level as Level, shops: payees(g.body).map((id) => name.get(id) ?? id),
        floorPct: g.body.commitmentFloorPct, matchPct: g.body.matchPct, expiresAt: g.expiresAt,
      })) : "";
      // The token was minted at the moment the money left the budget (same demo-clock `now` as the spend row).
      return { ...r, slip: { clause, cartHash: r.cartHash, issuedAt: r.at, expiresAt: new Date(r.at.getTime() + TOKEN_TTL_MS) } };
    }),
  };
}
