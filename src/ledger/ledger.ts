import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import type { WeekRecord } from "@/engine/ladder";
import type { Cents, LedgerView } from "@/engine/types";

/** ISO-8601 week in UTC, e.g. '2026-W45'. */
export function weekKey(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7; // Mon=1..Sun=7
  x.setUTCDate(x.getUTCDate() + 4 - day); // Thursday of this week decides the ISO year
  const year = x.getUTCFullYear();
  const week = Math.ceil(((x.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * Journal rows that count. A demo reset (Task 19) voids the rows written (real time) between the seed and the reset:
 * they stay on the record, append-only, but no longer count toward a week, the budget or savings. A reversal is
 * judged by the row it reverses (same ref), so undoing a set-aside spend can't count on its own (R44).
 */
// ponytail: a correlated lookup per journal row; fine at family scale, index journal(family_id, ref) if it ever isn't.
export const counted = sql`not exists (select 1 from families f, lateral (select coalesce(
    (select o.created_at from journal o where o.family_id = ${t.journal.familyId} and o.ref = ${t.journal.ref}
      and o.kind = case ${t.journal.kind} when 'spend_reversal' then 'spend' when 'invest_reversal' then 'invest' end
      order by o.created_at limit 1),
    ${t.journal.createdAt}) as written) w
  where f.id = ${t.journal.familyId} and w.written > f.ledger_void_from and w.written <= f.ledger_void_to)`;

type Entry = { at: Date; kind: (typeof t.journalKinds)[number]; amountCents: number; ref: string | null };

const entries = (db: Db, familyId: string): Promise<Entry[]> =>
  db.select({ at: t.journal.at, kind: t.journal.kind, amountCents: t.journal.amountCents, ref: t.journal.ref })
    .from(t.journal).where(and(eq(t.journal.familyId, familyId), counted)).orderBy(asc(t.journal.at));

const SPEND_SIGN: Partial<Record<Entry["kind"], 1 | -1>> = { spend: 1, spend_reversal: -1 };
const SAVINGS_SIGN: Partial<Record<Entry["kind"], 1 | -1>> = { week_close: 1, release: -1, invest: -1, invest_reversal: 1 };

const sum = (rows: Entry[], signs: Partial<Record<Entry["kind"], 1 | -1>>): Cents =>
  rows.reduce((acc, r) => acc + (signs[r.kind] ?? 0) * r.amountCents, 0);

const spentInWeek = (rows: Entry[], key: string): Cents =>
  sum(rows.filter((r) => weekKey(r.at) === key), SPEND_SIGN);

export async function savingsCents(db: Db, familyId: string): Promise<Cents> {
  return sum(await entries(db, familyId), SAVINGS_SIGN);
}

/**
 * The savings figure in its parts, from the same counted journal rows and signs (decision 029's closing statement):
 * savingsCents = recordedCents − paidCents − investedCents, and is exactly what savingsCents() returns.
 */
export async function savingsParts(db: Db, familyId: string) {
  const rows = await entries(db, familyId);
  const of = (kind: Entry["kind"]) => rows.filter((r) => r.kind === kind).reduce((s, r) => s + r.amountCents, 0);
  return {
    recordedCents: of("week_close"), paidCents: of("release"), investedCents: of("invest") - of("invest_reversal"),
    savingsCents: sum(rows, SAVINGS_SIGN),
    /** What each closed week added, by week key. */
    byWeek: new Map(rows.filter((r) => r.kind === "week_close" && r.ref).map((r) => [r.ref as string, r.amountCents])),
  };
}

/**
 * What an investment may use (final review I1): savings minus what an open (unconfirmed) release already promises
 * Amara will send, never below 0. Without it Zoe could invest money that is about to leave as the release.
 */
export async function availableSavingsCents(db: Db, familyId: string): Promise<Cents> {
  const [saved, open] = await Promise.all([
    savingsCents(db, familyId),
    db.select({ c: t.releases.savedCents }).from(t.releases).where(and(eq(t.releases.familyId, familyId), isNull(t.releases.confirmedAt))),
  ]);
  return Math.max(0, saved - open.reduce((s, r) => s + r.c, 0));
}

/** Shops she has bought from: paid purchases whose spend counts (a demo reset brings "first time here" back). */
async function merchantsUsed(db: Db, familyId: string): Promise<Set<string>> {
  const rows = await db.select({ cart: t.purchases.cart }).from(t.purchases)
    .leftJoin(t.journal, and(eq(t.journal.kind, "spend"), eq(t.journal.ref, t.purchases.id)))
    .where(and(eq(t.purchases.familyId, familyId), eq(t.purchases.status, "paid"), counted)); // no spend row ⇒ counts
  return new Set(rows.map((r) => r.cart.merchantId));
}

export async function ledgerView(db: Db, familyId: string, now: Date): Promise<LedgerView> {
  const rows = await entries(db, familyId);
  return {
    spentThisWeekCents: spentInWeek(rows, weekKey(now)),
    merchantsUsed: await merchantsUsed(db, familyId),
    savingsCents: sum(rows, SAVINGS_SIGN),
  };
}

export async function weekRecords(db: Db, familyId: string): Promise<WeekRecord[]> {
  const [rows, weeks] = await Promise.all([
    entries(db, familyId),
    db.select().from(t.weeks).where(eq(t.weeks.familyId, familyId)).orderBy(asc(t.weeks.weekKey)),
  ]);
  return weeks.map((w) => ({
    weekKey: w.weekKey, allowanceCents: w.allowanceCents,
    spentCents: spentInWeek(rows, w.weekKey), commitmentCents: w.commitmentCents, ...(w.stopped ? { stopped: true } : {}),
  }));
}
