import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { getActiveGrant, getFamily, getPurchase } from "@/db/repo";
import { availableSavingsCents, ledgerView, weekRecords } from "@/ledger/ledger";
import { asOf, commitmentKept } from "@/engine/ladder";
import { pendingApprovals, type PendingApproval } from "@/flows/approvals";

export interface RequestView {
  id: string; subject: PendingApproval["subject"]; teenName: string; expiresAt: Date;
  /** Her words: the note on a purchase or shop, her answers on a fund or investment. */
  reason: string | null; answers: [string, string][];
  /** Her last (up to) 4 closed weeks. */
  lastWeeks: { count: number; insideBudget: number; kept: number };
  /** liftsBudget (R40): approving lets this one cart go past her week; that week then doesn't count toward a level. */
  purchase?: { amountCents: number; shop: string; items: { title: string; qty: number }[]; leftCents: number; overCents: number; liftsBudget: boolean };
  investment?: { symbol: string; amountCents: number; savingsCents: number };
  fund?: { symbol: string };
  shop?: { domain: string };
}

/**
 * One open request, read for Amara. Null when it doesn't exist, belongs to another family, or has closed
 * (decided, expired, or its purchase already moved on). The page then asks closedRequestView what happened: it says so
 * for her own family's decided or expired request, and shows the same calm "closed" state for the rest.
 */
export async function requestView(db: Db, familyId: string, approvalId: string, now: Date): Promise<RequestView | null> {
  const a = (await pendingApprovals(db, familyId, now)).find((x) => x.id === approvalId);
  const fam = await getFamily(db, familyId);
  if (!a || !fam) return null;
  const weeks = (await weekRecords(db, familyId)).slice(-4);
  const base: RequestView = {
    id: a.id, subject: a.subject, teenName: fam.teenName, expiresAt: a.expiresAt, reason: a.note, answers: [],
    lastWeeks: {
      count: weeks.length,
      insideBudget: weeks.filter((w) => w.spentCents <= w.allowanceCents).length,
      kept: weeks.filter(commitmentKept).length,
    },
  };
  if (a.subject === "purchase" && a.cart) {
    const [grant, ledger, [m]] = await Promise.all([
      getActiveGrant(db, familyId), ledgerView(db, familyId, now),
      db.select({ name: t.merchants.name }).from(t.merchants).where(eq(t.merchants.id, a.cart.merchantId)),
    ]);
    const leftCents = Math.max(0, (grant ? asOf(grant.body, now).weeklyCents : 0) - ledger.spentThisWeekCents);
    return {
      ...base,
      purchase: {
        amountCents: a.cart.totalCents, shop: m?.name ?? "a shop", items: a.cart.items.map((i) => ({ title: i.title, qty: i.qty })),
        leftCents, overCents: Math.max(0, a.cart.totalCents - leftCents), liftsBudget: a.liftsBudget,
      },
    };
  }
  if (a.subject === "shop") return { ...base, shop: { domain: a.subjectId } };
  if (a.subject === "investment") {
    const [[inv], available] = await Promise.all([
      db.select().from(t.investments).where(eq(t.investments.id, a.subjectId)), availableSavingsCents(db, familyId),
    ]);
    if (!inv) return null;
    // What she can actually invest: savings minus an open release (I1), so Approve never contradicts this line.
    return { ...base, answers: words(inv.answers), investment: { symbol: inv.symbol, amountCents: inv.amountCents, savingsCents: available } };
  }
  const [prop] = await db.select().from(t.fundProposals).where(eq(t.fundProposals.id, a.subjectId));
  return prop ? { ...base, answers: words(prop.answers), fund: { symbol: prop.symbol } } : null;
}

/** Her answers as plain question → answer pairs; anything that isn't text is dropped. */
const words = (answers: Record<string, unknown>): [string, string][] =>
  Object.entries(answers).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== "");

/** A request that is no longer open, for the page that tells Amara what became of it. */
export interface ClosedRequest {
  outcome: "approved" | "declined" | "expired";
  subject: PendingApproval["subject"]; teenName: string;
  /** Demo clock: when she answered, or when it ran out. Null when none was recorded. */
  at: Date | null;
  purchase?: { amountCents: number; shop: string; status: (typeof t.purchases.$inferSelect)["status"] };
  investment?: { symbol: string; amountCents: number; status: (typeof t.investments.$inferSelect)["status"]; receiptNote: string | null };
  fund?: { symbol: string };
  shop?: { domain: string };
}

/**
 * What became of a request that is decided or expired. Null for an unknown id, another family's id (never reveals that
 * it exists), and a request that is still open: those keep the page's plain "closed" state.
 */
export async function closedRequestView(db: Db, familyId: string, approvalId: string, now: Date): Promise<ClosedRequest | null> {
  const [[a], fam] = await Promise.all([
    db.select().from(t.approvals).where(and(eq(t.approvals.id, approvalId), eq(t.approvals.familyId, familyId))),
    getFamily(db, familyId),
  ]);
  if (!a || !fam) return null;
  const outcome = a.result ?? (a.expiredAt || a.expiresAt <= now ? "expired" : null);
  if (!outcome) return null;
  // Expired: when it ran out. A reset expires asks early (expiredAt before expiresAt); a late look must not move it later.
  const at = outcome === "expired" ? new Date(Math.min(a.expiresAt.getTime(), (a.expiredAt ?? a.expiresAt).getTime())) : a.decidedAt;
  const base = { outcome, subject: a.subject, teenName: fam.teenName, at } satisfies ClosedRequest;
  if (a.subject === "shop") return { ...base, shop: { domain: a.subjectId } };
  if (a.subject === "purchase") {
    const p = await getPurchase(db, a.subjectId);
    if (!p) return null;
    const [m] = await db.select({ name: t.merchants.name }).from(t.merchants).where(eq(t.merchants.id, p.cart.merchantId));
    return { ...base, purchase: { amountCents: p.cart.totalCents, shop: m?.name ?? "a shop", status: p.status } };
  }
  if (a.subject === "investment") {
    const [inv] = await db.select().from(t.investments).where(eq(t.investments.id, a.subjectId));
    return inv ? { ...base, investment: { symbol: inv.symbol, amountCents: inv.amountCents, status: inv.status, receiptNote: inv.receiptNote } } : null;
  }
  const [prop] = await db.select({ symbol: t.fundProposals.symbol }).from(t.fundProposals).where(eq(t.fundProposals.id, a.subjectId));
  return prop ? { ...base, fund: prop } : null;
}
