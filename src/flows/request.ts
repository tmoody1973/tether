import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { getActiveGrant, getFamily } from "@/db/repo";
import { ledgerView, weekRecords } from "@/ledger/ledger";
import { commitmentKept } from "@/engine/ladder";
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
 * (decided, expired, or its purchase already moved on): the page shows the same calm "closed" state for all three.
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
    const leftCents = Math.max(0, (grant?.body.weeklyCents ?? 0) - ledger.spentThisWeekCents);
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
    const [[inv], ledger] = await Promise.all([
      db.select().from(t.investments).where(eq(t.investments.id, a.subjectId)), ledgerView(db, familyId, now),
    ]);
    if (!inv) return null;
    return { ...base, answers: words(inv.answers), investment: { symbol: inv.symbol, amountCents: inv.amountCents, savingsCents: ledger.savingsCents } };
  }
  const [prop] = await db.select().from(t.fundProposals).where(eq(t.fundProposals.id, a.subjectId));
  return prop ? { ...base, answers: words(prop.answers), fund: { symbol: prop.symbol } } : null;
}

/** Her answers as plain question → answer pairs; anything that isn't text is dropped. */
const words = (answers: Record<string, unknown>): [string, string][] =>
  Object.entries(answers).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== "");
