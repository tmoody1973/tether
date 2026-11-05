import { and, asc, eq } from "drizzle-orm";
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

type Entry = { at: Date; kind: (typeof t.journalKinds)[number]; amountCents: number };

const entries = (db: Db, familyId: string): Promise<Entry[]> =>
  db.select({ at: t.journal.at, kind: t.journal.kind, amountCents: t.journal.amountCents })
    .from(t.journal).where(eq(t.journal.familyId, familyId)).orderBy(asc(t.journal.at));

const SPEND_SIGN: Partial<Record<Entry["kind"], 1 | -1>> = { spend: 1, spend_reversal: -1 };
const SAVINGS_SIGN: Partial<Record<Entry["kind"], 1 | -1>> = { week_close: 1, release: -1, invest: -1, invest_reversal: 1 };

const sum = (rows: Entry[], signs: Partial<Record<Entry["kind"], 1 | -1>>): Cents =>
  rows.reduce((acc, r) => acc + (signs[r.kind] ?? 0) * r.amountCents, 0);

const spentInWeek = (rows: Entry[], key: string): Cents =>
  sum(rows.filter((r) => weekKey(r.at) === key), SPEND_SIGN);

export async function savingsCents(db: Db, familyId: string): Promise<Cents> {
  return sum(await entries(db, familyId), SAVINGS_SIGN);
}

async function merchantsUsed(db: Db, familyId: string): Promise<Set<string>> {
  const rows = await db.select({ cart: t.purchases.cart }).from(t.purchases)
    .where(and(eq(t.purchases.familyId, familyId), eq(t.purchases.status, "paid")));
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
    spentCents: spentInWeek(rows, w.weekKey), commitmentCents: w.commitmentCents,
  }));
}
