import { randomBytes } from "node:crypto";
import { and, asc, eq, isNotNull, isNull, lt, not, like, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as t from "@/db/schema";
import { ARCHIVED_PREFIX, insertFamily, type Family } from "@/db/repo";
import { safeErrorText, type PaypalHttp } from "@/adapters/paypal/http";
import type { PaypalIdentity } from "@/adapters/paypal/identity";
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
export type TeenFormError = "name" | "age" | "guardian";

/** Server-side check of the teen form. The age is only checked (13 to 17), never stored. */
export function parseTeenForm(form: FormData): { ok: true; teen: TeenInput } | { ok: false; error: TeenFormError } {
  const rawName = form.get("teenName");
  const teenName = typeof rawName === "string" ? rawName.trim().replace(/\s+/g, " ") : "";
  if (!teenName || teenName.length > NAME_MAX || !FIRST_NAME.test(teenName)) return { ok: false, error: "name" };
  const rawAge = form.get("age");
  const age = typeof rawAge === "string" && /^\d{1,2}$/.test(rawAge.trim()) ? Number(rawAge.trim()) : NaN;
  if (!(age >= TEEN_AGES.min && age <= TEEN_AGES.max)) return { ok: false, error: "age" };
  if (form.get("guardian") !== "on") return { ok: false, error: "guardian" };
  return { ok: true, teen: { teenName, age } };
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

/** True when `familyId` is a live (not retired) family owned by this PayPal id. */
export async function ownsLiveFamily(db: Db, sub: string, familyId: string): Promise<boolean> {
  const [hit] = await db.select({ id: t.families.id }).from(t.families)
    .where(and(eq(t.families.id, familyId), eq(t.families.paypalSub, sub), live)).limit(1);
  return hit !== undefined;
}

/** The families this PayPal identity owns and can still open, oldest first: the "Which teen?" list. */
export async function ownedFamilies(db: Db, sub: string): Promise<{ id: string; teenName: string }[]> {
  return db.select({ id: t.families.id, teenName: t.families.teenName }).from(t.families)
    .where(and(eq(t.families.paypalSub, sub), live))
    .orderBy(asc(t.families.createdAt));
}

/**
 * Makes the family: no rules yet (Level 1 when Amara signs), a new link for the teen, her PayPal identity, and her
 * PayPal first name as the guardian name ("Parent" if PayPal gave none). Null when today's new families are used up.
 */
export async function startFamily(db: Db, who: PaypalIdentity, teen: TeenInput, realNow: number = Date.now()): Promise<Family | null> {
  if (!(await takePool(db, "family_start", NEW_FAMILIES_PER_DAY, realNow))) return null;
  const guardianName = who.givenName ?? "Parent";
  return insertFamily(db, {
    name: `${guardianName} & ${teen.teenName}`, guardianName, teenName: teen.teenName,
    teenToken: randomBytes(24).toString("base64url"),
    paypalSub: who.sub, paypalPayerId: who.payerId ?? null, paypalEmail: who.email ?? null, parentGivenName: who.givenName ?? null,
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
 * demo reset (decision 014). Both links stop working, the PayPal identity and names are wiped, and the saved PayPal
 * is deleted at PayPal (best effort, logged). Never touches the demo family or seeded families (no paypal_sub).
 */
export async function retireStaleFamilies(deps: { db: Db; paypal: PaypalHttp }, realNow: number = Date.now()): Promise<number> {
  const { db } = deps;
  const stale = await db.select({ id: t.families.id }).from(t.families).where(and(
    isNotNull(t.families.paypalSub), isNull(t.families.demo), lt(t.families.createdAt, new Date(realNow - RETIRE_AFTER_MS))));
  // Starting cookies live 30 minutes, so a nonce older than a day can never be presented again.
  await db.delete(t.usedStartNonces).where(lt(t.usedStartNonces.usedAt, new Date(realNow - 86_400_000)));
  let retired = 0;
  for (const { id } of stale) {
    const gone = () => `${ARCHIVED_PREFIX}${randomBytes(24).toString("base64url")}`;
    // The paypal_sub condition is the claim: two logins at once retire a family once.
    const [claimed] = await db.update(t.families).set({
      guardianToken: gone(), teenToken: gone(), name: "Removed family", guardianName: "Removed", teenName: "Removed",
      paypalSub: null, paypalPayerId: null, paypalEmail: null, parentGivenName: null,
    }).where(and(eq(t.families.id, id), isNotNull(t.families.paypalSub))).returning({ id: t.families.id });
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
