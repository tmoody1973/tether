import { cookies } from "next/headers";
import { connection } from "next/server";
import { GUARDIAN_COOKIE, GuardianAuthError, requireGuardian, verifyGuardianCookie } from "@/auth/guardian";
import { getDb } from "@/db/client";
import { ARCHIVED_PREFIX, getFamily } from "@/db/repo";

/**
 * For route handlers: the family id from a valid guardian cookie whose family still exists and isn't archived or
 * retired, else GuardianAuthError (401). A signed cookie outlives a retired family by up to 7 days (review M2).
 */
export async function requireLiveGuardian(req: Request): Promise<string> {
  const familyId = requireGuardian(req);
  if (!(await isLiveFamily(familyId))) throw new GuardianAuthError();
  return familyId;
}

/** The family exists and isn't archived (a re-seeded demo) or retired (a week-old family started with PayPal). */
export async function isLiveFamily(familyId: string): Promise<boolean> {
  const fam = await getFamily(await getDb(), familyId);
  return !!fam && !fam.guardianToken.startsWith(ARCHIVED_PREFIX);
}

/** For pages and server actions: the signed-in guardian's family id, or null. Reads cookies, so call it inside <Suspense>. */
export async function guardianFamilyId(): Promise<string | null> {
  const value = (await cookies()).get(GUARDIAN_COOKIE)?.value;
  if (!value) return null;
  await connection(); // the expiry check reads the clock: request time only, never in a prerender
  let familyId: string | null;
  try {
    familyId = verifyGuardianCookie(value, new Date());
  } catch {
    return null; // malformed cookie or missing signing key: treat as signed out, never as signed in
  }
  // A signed cookie can outlive its family (deleted row, or a demo family archived by a re-seed): signed out, not a 500.
  const fam = familyId ? await getFamily(await getDb(), familyId) : null;
  return fam && !fam.guardianToken.startsWith(ARCHIVED_PREFIX) ? fam.id : null;
}
