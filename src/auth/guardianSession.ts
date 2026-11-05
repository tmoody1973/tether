import { cookies } from "next/headers";
import { connection } from "next/server";
import { GUARDIAN_COOKIE, verifyGuardianCookie } from "@/auth/guardian";

/** For pages and server actions: the signed-in guardian's family id, or null. Reads cookies, so call it inside <Suspense>. */
export async function guardianFamilyId(): Promise<string | null> {
  const value = (await cookies()).get(GUARDIAN_COOKIE)?.value;
  if (!value) return null;
  await connection(); // the expiry check reads the clock: request time only, never in a prerender
  try {
    return verifyGuardianCookie(value, new Date());
  } catch {
    return null; // malformed cookie or missing signing key: treat as signed out, never as signed in
  }
}
