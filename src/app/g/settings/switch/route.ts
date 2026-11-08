import { readCookie } from "@/auth/guardian";
import { requireLiveGuardian } from "@/auth/guardianSession";
import { BROWSER_FAMILY_COOKIE, PAYPAL_WHO_COOKIE, openBrowserFamilies, openPaypalWho } from "@/auth/start";
import { safeErrorText } from "@/adapters/paypal/http";
import { getDb } from "@/db/client";
import { switchableFamilies } from "@/flows/start";
import { goTo, sameOrigin, signIn } from "../../login/login";

// Settings → "Switch to <teen>" (decision 028). Signs her in to another teen only when the PayPal this browser last
// logged in with can open BOTH the teen she's on now and the one she picked: live, owned by that PayPal, and, for the
// shared sandbox login, made in this browser. Anything else changes nothing.
export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return goTo(req, "/g/settings?switch=failed");
  let current: string;
  try {
    current = await requireLiveGuardian(req);
  } catch {
    return goTo(req, "/g"); // signed out: Home says how to sign in
  }
  const now = new Date();
  const who = openPaypalWho(readCookie(req, PAYPAL_WHO_COOKIE), now);
  const id = (await req.formData().catch(() => null))?.get("familyId");
  if (!who || typeof id !== "string" || id.length > 100) return goTo(req, "/g/settings?switch=failed");
  try {
    const mine = await switchableFamilies(await getDb(), who, openBrowserFamilies(readCookie(req, BROWSER_FAMILY_COOKIE), now));
    if (!mine.some((f) => f.id === current) || !mine.some((f) => f.id === id)) return goTo(req, "/g/settings?switch=failed");
  } catch (err) {
    console.error("switch: checking her teens failed", safeErrorText(err));
    return goTo(req, "/g/settings?switch=failed");
  }
  return signIn(goTo(req, "/g?switched=1"), id);
}
