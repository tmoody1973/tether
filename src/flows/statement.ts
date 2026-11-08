// Amara's closing statement (decision 029): what Tether has recorded as promised to Zoe, and what is left to pay.
// Every number comes from the ledger's own sums (savingsParts) and week close's own terms (weekTerms): no second formula.
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { getFamily } from "@/db/repo";
import { unspentCents } from "@/engine/ladder";
import { ledgerView, savingsParts, weekRecords } from "@/ledger/ledger";
import { nextMonday, weekStart } from "@/flows/grant";
import { removalDate } from "@/flows/start";
import { weekTerms } from "@/flows/week";

export interface StatementWeek { weekKey: string; allowanceCents: number; spentCents: number; addedCents: number; stopped: boolean }

export interface Statement {
  teenName: string; guardianName: string; now: Date;
  /** Closed weeks, oldest first, and what they added in all. */
  weeks: StatementWeek[]; recordedCents: number;
  /** The week not yet closed. in_force/stopped: it counts as promised and adds `addsCents` when it closes. */
  current: {
    state: "in_force" | "stopped" | "none"; closesAt: Date; stoppedAt: Date | null;
    allowanceCents: number; spentCents: number; addsCents: number;
  };
  /**
   * Payments to Zoe Amara recorded (saved part left savings; the match is hers on top). Built from the same counted
   * journal rows as paidCents, so a payment a demo reset set aside is in neither: sum(savedCents) === paidCents.
   */
  payments: { at: Date; savedCents: number; matchCents: number }[]; paidCents: number;
  /** A release worked out at a level-up and not yet recorded as paid: still inside the remaining amount. */
  waiting: { savedCents: number; matchCents: number } | null;
  investedCents: number;
  /** = the savings figure Zoe and Amara see (closed weeks only). */
  remainingCents: number;
  /**
   * The headline: remaining plus what this week adds when it closes (0 when no rules cover it). After a stop nothing
   * more can be spent, so it is final and equals the savings figure once the week closes. Same unspentCents/weekTerms.
   */
  owedCents: number;
  /** Self-started families are retired (decision 026). */
  removesAt: Date | null;
}

export async function closingStatement(db: Db, familyId: string, now: Date): Promise<Statement> {
  const fam = await getFamily(db, familyId);
  if (!fam) throw new Error(`unknown family ${familyId}`);
  const [parts, records, grants, ledger, paid, [open]] = await Promise.all([
    savingsParts(db, familyId), weekRecords(db, familyId),
    db.select().from(t.grants).where(eq(t.grants.familyId, familyId)), ledgerView(db, familyId, now),
    db.select().from(t.releases).where(eq(t.releases.familyId, familyId)),
    db.select().from(t.releases).where(and(eq(t.releases.familyId, familyId), isNull(t.releases.confirmedAt))).limit(1),
  ]);
  const monday = weekStart(now);
  const terms = grants.length ? weekTerms(grants, monday) : null;
  // A revoked grant covers this week only when it was stopped during it (coversWeek), so "stopped" is that case.
  const state = !terms?.inForce ? "none" : terms.grant.status === "revoked" ? "stopped" : "in_force";
  const allowanceCents = terms?.allowanceCents ?? 0;
  return {
    teenName: fam.teenName, guardianName: fam.guardianName, now,
    weeks: records.map((w) => ({
      weekKey: w.weekKey, allowanceCents: w.allowanceCents, spentCents: w.spentCents,
      addedCents: parts.byWeek.get(w.weekKey) ?? 0, stopped: w.stopped === true,
    })),
    recordedCents: parts.recordedCents,
    current: {
      state, closesAt: nextMonday(now), stoppedAt: state === "stopped" ? terms!.grant.revokedAt : null,
      allowanceCents, spentCents: ledger.spentThisWeekCents, addsCents: unspentCents(allowanceCents, ledger.spentThisWeekCents),
    },
    payments: parts.releases.flatMap(({ releaseId, savedCents }) => {
      const r = paid.find((x) => x.id === releaseId);
      return r?.confirmedAt ? [{ at: r.confirmedAt, savedCents, matchCents: r.matchCents }] : [];
    }).sort((a, b) => a.at.getTime() - b.at.getTime()),
    paidCents: parts.paidCents,
    waiting: open ? { savedCents: open.savedCents, matchCents: open.matchCents } : null,
    investedCents: parts.investedCents,
    remainingCents: parts.savingsCents,
    owedCents: parts.savingsCents + (state === "none" ? 0 : unspentCents(allowanceCents, ledger.spentThisWeekCents)),
    removesAt: fam.paypalSub !== null ? removalDate(fam.createdAt) : null,
  };
}
