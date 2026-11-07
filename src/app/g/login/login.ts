import { NextResponse } from "next/server";
import { GUARDIAN_COOKIE, guardianCookieOptions, signGuardianCookie } from "@/auth/guardian";
import { LOGIN_STATE_COOKIE, START_COOKIE, loginStateCookieOptions, startCookieOptions } from "@/auth/start";
import { safeErrorText } from "@/adapters/paypal/http";
import { getDb } from "@/db/client";
import { retireStaleFamilies } from "@/flows/start";
import { appBaseUrl } from "../connect-paypal/setup";
import { paypalOrUnavailable } from "../flowDeps";

/** The one return URL registered with PayPal: `${APP_BASE_URL}/g/login/paypal/return`. */
export const loginReturnUrl = () => `${appBaseUrl()}/g/login/paypal/return`;

/** A 303 to `path` that also drops the one-time login cookies (state always; the starting cookie when asked). */
export function goTo(req: Request, path: string, opts: { dropStart?: boolean } = {}): NextResponse {
  const res = NextResponse.redirect(new URL(path, req.url), 303);
  res.cookies.delete({ name: LOGIN_STATE_COOKIE, path: loginStateCookieOptions().path });
  if (opts.dropStart) res.cookies.delete({ name: START_COOKIE, path: startCookieOptions().path });
  return res;
}

export function signIn(res: NextResponse, familyId: string): NextResponse {
  res.cookies.set(GUARDIAN_COOKIE, signGuardianCookie(familyId, new Date()), guardianCookieOptions());
  return res;
}

/** Form posts must come from Tether's own pages: a cross-site Origin is refused (SameSite=Lax already withholds the cookie). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin form posts from older browsers; the cookie is still required
  const own = new Set([new URL(req.url).origin]);
  try { own.add(new URL(appBaseUrl()).origin); } catch { /* no APP_BASE_URL in production: the request's own origin only */ }
  return own.has(origin);
}

/** Lazy clean-up of week-old self-started families. Never blocks a sign-in. */
export async function retireQuietly(): Promise<void> {
  await retireStaleFamilies({ db: await getDb(), paypal: paypalOrUnavailable() }).catch((err: unknown) => {
    console.error("retire: clean-up failed", safeErrorText(err));
  });
}
