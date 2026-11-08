import { randomBytes } from "node:crypto";
import { and, asc, count, eq, gt, inArray, isNotNull, isNull, lt, not, like, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { ARCHIVED_PREFIX, insertFamily, type Family } from "@/db/repo";
import { safeErrorText, type PaypalHttp } from "@/adapters/paypal/http";
import type { PaypalIdentity } from "@/adapters/paypal/identity";
import type { PaypalWho } from "@/auth/start";
import { deletePaymentToken } from "@/adapters/paypal/vault";
import { takePool } from "@/flows/usage";
import { SANDBOX_LOGIN } from "@/ui/sandboxAccount";

// "Start your own family" with Log in with PayPal (decision 026) and its public-demo limits.

export const NEW_FAMILIES_PER_DAY = 30; // site-wide, real UTC day
export const ALPACA_ACCOUNTS_PER_DAY = 30; // new Alpaca sandbox accounts for self-started families, real UTC day
export const RETIRE_AFTER_MS = 7 * 86_400_000;
export const TEEN_AGES = { min: 13, max: 17 } as const;
const NAME_MAX = 30;
/** A first name: letters (any script), with spaces, hyphens and apostrophes inside it. */
const FIRST_NAME = /^\p{L}[\p{L}\p{M}' -]*$/u;

export type TeenInput = { teenName: string; age: number };
export type TeenFormError = "name" | "age" | "guardian" | "duplicate" | "many";
/** Teens one teen form can make at once (decision 028). */
export const TEENS_PER_FORM = 5;

/** One name-and-age row: the name cleaned up, the age only checked (13 to 17), never stored. */
function teenRow(rawName: FormDataEntryValue | null, rawAge: FormDataEntryValue | null): TeenInput | "name" | "age" {
  const teenName = typeof rawName === "string" ? rawName.trim().replace(/\s+/g, " ") : "";
  if (!teenName || teenName.length > NAME_MAX || !FIRST_NAME.test(teenName)) return "name";
  const age = typeof rawAge === "string" && /^\d{1,2}$/.test(rawAge.trim()) ? Number(rawAge.trim()) : NaN;
  if (!(age >= TEEN_AGES.min && age <= TEEN_AGES.max)) return "age";
  return { teenName, age };
}

/** Server-side check of the teen form, one teen. */
export function parseTeenForm(form: FormData): { ok: true; teen: TeenInput } | { ok: false; error: TeenFormError } {
  const r = parseTeensForm(form);
  return r.ok ? { ok: true, teen: r.teens[0] } : r;
}

/**
 * Server-side check of the teen form with one or more rows (decision 028): 1 to 5 teens, each name and age checked as
 * for one teen, no name twice (ignoring case), and the parent checkbox once for all of them.
 */
export function parseTeensForm(form: FormData): { ok: true; teens: TeenInput[] } | { ok: false; error: TeenFormError } {
  const names = form.getAll("teenName"), ages = form.getAll("age");
  if (names.length === 0) return { ok: false, error: "name" };
  if (names.length > TEENS_PER_FORM || ages.length > TEENS_PER_FORM) return { ok: false, error: "many" };
  const teens: TeenInput[] = [];
  for (let i = 0; i < names.length; i++) {
    const row = teenRow(names[i], ages[i] ?? null);
    if (typeof row === "string") return { ok: false, error: row };
    if (teens.some((t) => t.teenName.toLowerCase() === row.teenName.toLowerCase())) return { ok: false, error: "duplicate" };
    teens.push(row);
  }
  if (form.get("guardian") !== "on") return { ok: false, error: "guardian" };
  return { ok: true, teens };
}

/** Records a starting cookie's nonce. True only for the first caller: one atomic insert, so a replay or a race loses. */
export async function consumeStartNonce(db: Db, nonce: string): Promise<boolean> {
  return (await db.insert(t.usedStartNonces).values({ nonce }).onConflictDoNothing().returning()).length > 0;
}

const live = not(like(t.families.guardianToken, `${ARCHIVED_PREFIX}%`));

/**
 * Is this the published shared sandbox login (reviews H1, R1)? Per-browser mode whenever ANY of: its email
 * (case-insensitive); its payer id (only once a non-empty one is configured); PayPal sent no email at all, so it
 * can't be told apart; or a family already stored with the shared email under this PayPal id or payer id (the account's
 * email may have been changed since). When unsure, per browser is the safe side: it never opens another browser's family.
 */
export async function isSharedLogin(
  db: Db, who: PaypalIdentity, account: { email: string; payerId: string } = SANDBOX_LOGIN,
): Promise<boolean> {
  const shared = account.email.toLowerCase();
  if (!who.email || who.email.toLowerCase() === shared) return true;
  if (account.payerId !== "" && who.payerId === account.payerId) return true;
  const byId = who.payerId ? or(eq(t.families.paypalSub, who.sub), eq(t.families.paypalPayerId, who.payerId)) : eq(t.families.paypalSub, who.sub);
  const [hit] = await db.select({ id: t.families.id }).from(t.families).where(and(eq(t.families.paypalEmail, shared), byId)).limit(1);
  return hit !== undefined;
}

/** The families this PayPal identity owns and can still open, oldest first: the "Which teen?" list. */
export async function ownedFamilies(db: Db, sub: string): Promise<{ id: string; teenName: string }[]> {
  return db.select({ id: t.families.id, teenName: t.families.teenName }).from(t.families)
    .where(and(eq(t.families.paypalSub, sub), live))
    .orderBy(asc(t.families.createdAt));
}

/**
 * The teens this browser may open and switch between (decision 028), oldest first. An ordinary PayPal: every live family
 * it owns. The shared sandbox login: only the families THIS browser made (its cookie list) that it still owns and are
 * live; never another browser's, never a list from paypal_sub alone.
 */
export async function switchableFamilies(db: Db, who: PaypalWho, browserFamilies: readonly string[]): Promise<{ id: string; teenName: string }[]> {
  if (who.shared && browserFamilies.length === 0) return [];
  return db.select({ id: t.families.id, teenName: t.families.teenName }).from(t.families)
    .where(and(eq(t.families.paypalSub, who.sub), live, who.shared ? inArray(t.families.id, [...browserFamilies]) : undefined))
    .orderBy(asc(t.families.createdAt));
}

export type SettingsTeens = { viaPaypal: boolean; teens: { id: string; teenName: string; current: boolean }[] };

/**
 * Settings' "Your teens". Signed in through PayPal (the remembered PayPal can open the current family): every teen she
 * can switch to. Signed in another way (a private guardian link, the shared demo family): the current teen only.
 */
export async function settingsTeens(
  db: Db, current: { id: string; teenName: string }, who: PaypalWho | null, browserFamilies: readonly string[],
): Promise<SettingsTeens> {
  const list = who ? await switchableFamilies(db, who, browserFamilies) : [];
  if (!list.some((f) => f.id === current.id)) return { viaPaypal: false, teens: [{ ...current, current: true }] };
  return { viaPaypal: true, teens: list.map((f) => ({ ...f, current: f.id === current.id })) };
}

/**
 * Makes the family: no rules yet (Level 1 when Amara signs), a new link for the teen, her PayPal identity, and her
 * PayPal first name as the guardian name ("Parent" if PayPal gave none). Null when today's new families are used up.
 */
export async function startFamily(db: Db, who: PaypalIdentity, teen: TeenInput, realNow: number = Date.now()): Promise<Family | null> {
  return (await startFamilies(db, who, [teen], realNow))?.[0] ?? null;
}

/** New teens one ordinary PayPal account can make in a rolling day (review LOW-3). The shared login shares one PayPal
 * id among all judges, so it has only the site cap. */
export const NEW_TEENS_PER_ACCOUNT_PER_DAY = 5;

/**
 * Checks before a teen form spends its one-time ticket, so she can fix the form and try again (decision 028):
 * "taken" when a name matches one of the teens she can already open (review LOW-5); "account" when this PayPal would
 * pass NEW_TEENS_PER_ACCOUNT_PER_DAY. ponytail: counted, then made in a separate step, so two forms sent at the same
 * instant can pass it together; the site cap (atomic) still holds.
 */
export async function startProblem(
  db: Db, who: PaypalIdentity, teens: TeenInput[], browserFamilies: readonly string[], realNow: number = Date.now(),
): Promise<"taken" | "account" | null> {
  const shared = await isSharedLogin(db, who);
  const mine = await switchableFamilies(db, { sub: who.sub, shared }, browserFamilies);
  const names = new Set(mine.map((f) => f.teenName.toLowerCase()));
  if (teens.some((x) => names.has(x.teenName.toLowerCase()))) return "taken";
  if (shared) return null;
  const [{ n }] = await db.select({ n: count() }).from(t.families)
    .where(and(eq(t.families.paypalSub, who.sub), gt(t.families.createdAt, new Date(realNow - 86_400_000))));
  return n + teens.length > NEW_TEENS_PER_ACCOUNT_PER_DAY ? "account" : null;
}

/**
 * One family per teen, in order (decision 028), in one transaction (review LOW-1). Each counts against the daily site
 * cap, taken for the whole list at once: if it would cut the list short, or anything fails, none is made (null).
 */
export async function startFamilies(db: Db, who: PaypalIdentity, teens: TeenInput[], realNow: number = Date.now()): Promise<Family[] | null> {
  return db.transaction(async (tx) => {
    if (!(await takePool(tx, "family_start", NEW_FAMILIES_PER_DAY, realNow, teens.length))) return null;
    const guardianName = who.givenName ?? "Parent";
    const made: Family[] = [];
    for (const teen of teens) {
      made.push(await insertFamily(tx, {
        name: `${guardianName} & ${teen.teenName}`, guardianName, teenName: teen.teenName,
        teenToken: randomBytes(24).toString("base64url"),
        paypalSub: who.sub, paypalPayerId: who.payerId ?? null, paypalEmail: who.email ?? null, parentGivenName: who.givenName ?? null,
      }));
    }
    return made;
  });
}

export const removalDate = (createdAt: Date): Date => new Date(createdAt.getTime() + RETIRE_AFTER_MS);

/** Thrown before creating an Alpaca account past today's cap: the investment closes unfunded, nothing moves. */
export class AccountCapError extends Error {
  constructor() { super("today's new investing accounts are used up"); this.name = "AccountCapError"; }
}

/**
 * Lazily, whenever someone logs in with PayPal or starts a family: retires self-started families more than 7 days old.
 * Retired, not deleted: the journal is append-only (a database trigger refuses deletes), so money rows stay, as with a
 * demo reset (decision 014). Both links stop working, the PayPal identity (except the published shared account's, see
 * below) and names are wiped, and the saved PayPal
 * is deleted at PayPal (best effort, logged). Never touches the demo family or seeded families (no paypal_sub).
 */
export async function retireStaleFamilies(deps: { db: Db; paypal: PaypalHttp }, realNow: number = Date.now()): Promise<number> {
  const { db } = deps;
  const stale = await db.select({ id: t.families.id, email: t.families.paypalEmail }).from(t.families).where(and(
    isNotNull(t.families.paypalSub), isNull(t.families.demo), live, lt(t.families.createdAt, new Date(realNow - RETIRE_AFTER_MS))));
  // Starting cookies live 30 minutes, so a nonce older than a day can never be presented again.
  await db.delete(t.usedStartNonces).where(lt(t.usedStartNonces.usedAt, new Date(realNow - 86_400_000)));
  const sharedEmail = SANDBOX_LOGIN.email.toLowerCase();
  let retired = 0;
  for (const { id, email } of stale) {
    const gone = () => `${ARCHIVED_PREFIX}${randomBytes(24).toString("base64url")}`;
    // Review MEDIUM-1: a family made with the published shared sandbox account keeps that account's PayPal id and
    // email (published test credentials, nobody's personal data), so isSharedLogin still recognises the account by
    // its PayPal id after someone changes its email. Every other family's PayPal identity is wiped as before.
    const keep = email?.toLowerCase() === sharedEmail;
    // "Still live" is the claim: two logins at once retire a family once.
    const [claimed] = await db.update(t.families).set({
      guardianToken: gone(), teenToken: gone(), name: "Removed family", guardianName: "Removed", teenName: "Removed",
      parentGivenName: null, paypalPayerId: null,
      ...(keep ? { paypalEmail: sharedEmail } : { paypalSub: null, paypalEmail: null }),
    }).where(and(eq(t.families.id, id), live)).returning({ id: t.families.id });
    if (!claimed) continue;
    retired++;
    const [saved] = await db.update(t.vault).set({ deletedAt: new Date(realNow) })
      .where(and(eq(t.vault.familyId, id), isNull(t.vault.deletedAt))).returning({ token: t.vault.paymentTokenId });
    if (!saved) continue;
    try {
      await deletePaymentToken(deps.paypal, saved.token);
    } catch (err) {
      console.error("retire: PayPal didn't delete a retired family's saved PayPal", safeErrorText(err));
    }
  }
  if (retired) console.info(`retire: ${retired} self-started famil${retired === 1 ? "y" : "ies"} older than 7 days retired`);
  return retired;
}
