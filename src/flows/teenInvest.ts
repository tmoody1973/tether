// Zoe proposes; Amara decides (F17, D13, D16). Tether ranks and recommends nothing. familyId comes from her link (R39).
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { getActiveGrant } from "@/db/repo";
import { availableSavingsCents } from "@/ledger/ledger";
import { MIN_INVEST_CENTS } from "@/engine/invest";
import { proposeFund, proposeInvestment } from "@/flows/invest";
import type { Deps } from "@/flows/purchase";
import { tellAmara } from "@/flows/notify";
import { formatCents } from "@/ui/grantWords";
import { ANSWER_MAX, ANSWER_MIN, QUESTIONS, type Answers } from "@/ui/investQuestions";

export { ANSWER_MAX, QUESTIONS, type Answers };

const SYMBOL = /^[A-Z][A-Z.]{0,5}$/;
export const isSymbol = (s: string) => SYMBOL.test(s);

type Status = (typeof t.investments.$inferSelect)["status"];
/** declined: Amara said no. A rejected row is otherwise one that didn't go through after her yes (nothing moved). */
export interface TeenInvestment { id: string; symbol: string; amountCents: number; status: Status; receiptNote: string | null; declined: boolean }

/**
 * Her investments. A row the engine refused when she proposed it never reached Amara (she was told why on the spot),
 * so it isn't listed: it must never read as Amara's "not this time".
 */
export async function teenInvestments(db: Db, familyId: string): Promise<TeenInvestment[]> {
  const rows = await db.select({ i: t.investments, result: t.approvals.result }).from(t.investments)
    .leftJoin(t.approvals, and(eq(t.approvals.subject, "investment"), eq(t.approvals.subjectId, t.investments.id)))
    .where(eq(t.investments.familyId, familyId));
  const decided = new Map<string, Set<string>>(); // investment id -> Amara's answers on it
  for (const { i, result } of rows) {
    const set = decided.get(i.id) ?? new Set<string>();
    if (result) set.add(result);
    decided.set(i.id, set);
  }
  const seen = new Set<string>();
  return rows.flatMap(({ i }) => {
    const answers = decided.get(i.id)!;
    if (seen.has(i.id) || (i.status === "rejected" && answers.size === 0)) return [];
    seen.add(i.id);
    return [{ id: i.id, symbol: i.symbol, amountCents: i.amountCents, status: i.status, receiptNote: i.receiptNote, declined: answers.has("declined") }];
  });
}

/** Rules in force at Level 3: checked before anything else (and before any market call). */
export async function canPropose(deps: Pick<Deps, "db" | "now">, familyId: string): Promise<"level" | "rules" | null> {
  const now = await deps.now(familyId);
  const grant = await getActiveGrant(deps.db, familyId);
  if (!grant || grant.expiresAt <= now) return "rules";
  return grant.level < 3 ? "level" : null;
}

/** She already has an investment in this symbol waiting for Amara. */
async function investmentWaiting(db: Db, familyId: string, symbol: string, now: Date): Promise<boolean> {
  const rows = await db.select({ id: t.investments.id }).from(t.investments)
    .innerJoin(t.approvals, and(eq(t.approvals.subject, "investment"), eq(t.approvals.subjectId, t.investments.id)))
    .where(and(eq(t.investments.familyId, familyId), eq(t.investments.symbol, symbol), eq(t.investments.status, "proposed"),
      isNull(t.approvals.result), isNull(t.approvals.expiredAt), gt(t.approvals.expiresAt, now))).limit(1);
  return rows.length > 0;
}

/** allowed: on Amara's fund list. asked: she has a fund proposal waiting. new: neither. */
export async function fundStatus(db: Db, familyId: string, symbol: string, now: Date): Promise<"allowed" | "asked" | "new"> {
  const [grant, listed, asked] = await Promise.all([
    getActiveGrant(db, familyId),
    db.select().from(t.fundAllowlist).where(and(eq(t.fundAllowlist.familyId, familyId), eq(t.fundAllowlist.symbol, symbol))),
    db.select({ id: t.approvals.id }).from(t.approvals).innerJoin(t.fundProposals, eq(t.fundProposals.id, t.approvals.subjectId))
      .where(and(eq(t.approvals.familyId, familyId), eq(t.approvals.subject, "fund"), eq(t.fundProposals.symbol, symbol),
        isNull(t.approvals.result), isNull(t.approvals.expiredAt), gt(t.approvals.expiresAt, now))).limit(1),
  ]);
  if (listed.length > 0 || grant?.body.fundAllowlist.includes(symbol)) return "allowed";
  return asked.length > 0 ? "asked" : "new";
}

/**
 * Every fund Amara allows, once each: the ones on her signed rules first, then the ones she approved since.
 * The same two places fundStatus checks, so the list she reads agrees with what Zoe can propose.
 */
export async function allowedFunds(db: Db, familyId: string): Promise<string[]> {
  const [grant, added] = await Promise.all([
    getActiveGrant(db, familyId),
    db.select({ symbol: t.fundAllowlist.symbol }).from(t.fundAllowlist).where(eq(t.fundAllowlist.familyId, familyId))
      .orderBy(t.fundAllowlist.addedAt, t.fundAllowlist.symbol),
  ]);
  return [...new Set([...(grant?.body.fundAllowlist ?? []), ...added.map((f) => f.symbol)])];
}

export type ProposeResult =
  | { ok: true; sent: "fund" | "investment" }
  | { ok: false; error: "level" | "rules" | "symbol" | "answers" | "amount" | "asked" }
  | { ok: false; error: "savings"; savingsCents: number };

/**
 * "Propose to Amara". Off her list: a fund proposal (adding it to the list), with the amount she has in mind.
 * On her list: an investment request with her answers; the engine checks level, list and savings.
 */
export async function proposeFromTeen(
  deps: Pick<Deps, "db" | "now" | "notify">, familyId: string, symbol: string, amountCents: number, answers: Answers,
): Promise<ProposeResult> {
  const blocked = await canPropose(deps, familyId);
  if (blocked) return { ok: false, error: blocked };
  const now = await deps.now(familyId);
  if (!isSymbol(symbol)) return { ok: false, error: "symbol" };
  const words = Object.fromEntries((Object.keys(QUESTIONS) as (keyof Answers)[]).map((k) => [QUESTIONS[k], (answers[k] ?? "").trim()]));
  if (Object.values(words).some((a) => a.length < ANSWER_MIN || a.length > ANSWER_MAX)) return { ok: false, error: "answers" };
  if (!Number.isInteger(amountCents) || amountCents < MIN_INVEST_CENTS) return { ok: false, error: "amount" };
  const saved = await availableSavingsCents(deps.db, familyId);
  if (amountCents > saved) return { ok: false, error: "savings", savingsCents: saved };

  const status = await fundStatus(deps.db, familyId, symbol, now);
  if (status === "asked") return { ok: false, error: "asked" };
  if (status === "new") {
    const { approvalId } = await proposeFund(deps, familyId, symbol, { ...words, "How much she has in mind": formatCents(amountCents) });
    tellAmara(deps, familyId, approvalId); // a fresh proposal row: always a new request
    return { ok: true, sent: "fund" };
  }
  if (await investmentWaiting(deps.db, familyId, symbol, now)) return { ok: false, error: "asked" };
  const { decision, approvalId } = await proposeInvestment(deps, familyId, { symbol, amountCents }, words);
  if (approvalId) tellAmara(deps, familyId, approvalId);
  if (decision.outcome !== "REFUSE") return { ok: true, sent: "investment" };
  const c = decision.reasons[0]?.constraint;
  return c === "invest.savings" ? { ok: false, error: "savings", savingsCents: saved }
    : c === "invest.minimum" ? { ok: false, error: "amount" } : { ok: false, error: c === "invest.level" ? "level" : "rules" };
}
