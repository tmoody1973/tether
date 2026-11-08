import { NextResponse } from "next/server";
import { readCookie } from "@/auth/guardian";
import { requireLiveGuardian } from "@/auth/guardianSession";
import { paypalFromEnv, safeErrorText } from "@/adapters/paypal/http";
import { createPaymentToken, deletePaymentToken, sameAccount } from "@/adapters/paypal/vault";
import { getDb } from "@/db/client";
import { getFamily, saveVault } from "@/db/repo";
import { SETUP_COOKIE, SETUP_COOKIE_PATH, openSetupCookie } from "../setup";

// Step 2: PayPal sends Amara back with ?approval_token_id=…; exchange it for a payment token and keep it.
export async function GET(req: Request): Promise<Response> {
  let familyId: string;
  try {
    familyId = await requireLiveGuardian(req);
  } catch {
    return NextResponse.redirect(new URL("/g", req.url), 303);
  }
  const done = (outcome: "connected" | "failed" | "different" | "stale") => {
    const res = NextResponse.redirect(new URL(outcome === "stale" ? "/g?stale=1" : `/g?paypal=${outcome}`, req.url), 303);
    res.cookies.delete({ name: SETUP_COOKIE, path: SETUP_COOKIE_PATH });
    return res;
  };
  const params = new URL(req.url).searchParams;
  const setupId = params.get("approval_token_id") ?? params.get("approval_session_id");
  // Only the setup token this browser started: stops someone sending Amara a link that saves *their* PayPal.
  const started = openSetupCookie(readCookie(req, SETUP_COOKIE));
  if (!setupId || setupId !== started?.setupId) return done("failed");
  // Review HIGH-1: she started this for one teen and has switched to another since; save nothing, to either.
  if (started.familyId !== familyId) return done("stale");
  try {
    const db = await getDb();
    const fam = await getFamily(db, familyId);
    if (!fam) return done("failed");
    const paypal = paypalFromEnv();
    const wallet = await createPaymentToken(paypal, setupId);
    // Decision 026: a family started with Log in with PayPal saves only that same PayPal account.
    if (fam.paypalSub) {
      const match = sameAccount({ payerId: fam.paypalPayerId, email: fam.paypalEmail }, wallet);
      if (match === "different") {
        await deletePaymentToken(paypal, wallet.paymentTokenId).catch((err: unknown) => {
          console.error("connect-paypal: deleting the other account's token failed", safeErrorText(err));
        });
        return done("different");
      }
      if (match === "unknown") console.warn("connect-paypal: PayPal's reply had no payer id or email to compare; saved without the same-account check");
    }
    await saveVault(db, familyId, wallet.paymentTokenId);
  } catch (err) {
    console.error("connect-paypal: saving the wallet failed", safeErrorText(err)); // never the query: it holds the token id
    return done("failed");
  }
  return done("connected");
}
