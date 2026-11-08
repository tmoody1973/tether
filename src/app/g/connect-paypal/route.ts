import { NextResponse } from "next/server";
import { requireLiveGuardian } from "@/auth/guardianSession";
import { paypalFromEnv } from "@/adapters/paypal/http";
import { createSetupToken } from "@/adapters/paypal/vault";
import { SETUP_COOKIE, appBaseUrl, setupCookieOptions, setupCookieValue } from "./setup";

// Step 1 of saving Amara's PayPal (sandbox): ask PayPal for a setup token, send her to approve it. `?for=` is the teen
// the link was drawn for: if she has switched teens since (another tab), nothing starts (review HIGH-1).
export async function GET(req: Request): Promise<Response> {
  let familyId: string;
  try {
    familyId = await requireLiveGuardian(req);
  } catch {
    return NextResponse.redirect(new URL("/g", req.url), 303);
  }
  if (new URL(req.url).searchParams.get("for") !== familyId) return NextResponse.redirect(new URL("/g?stale=1", req.url), 303);
  try {
    const base = appBaseUrl();
    const { id, approveUrl } = await createSetupToken(paypalFromEnv(), `${base}/g/connect-paypal/return`, `${base}/g?paypal=cancelled`);
    const res = NextResponse.redirect(approveUrl, 303);
    res.cookies.set(SETUP_COOKIE, setupCookieValue(familyId, id), setupCookieOptions());
    return res;
  } catch (err) {
    console.error("connect-paypal: setup token failed", err instanceof Error ? err.message : err);
    return NextResponse.redirect(new URL("/g?paypal=failed", req.url), 303);
  }
}
