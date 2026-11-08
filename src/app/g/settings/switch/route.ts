import { readCookie } from "@/auth/guardian";
import { requireLiveGuardian } from "@/auth/guardianSession";
import { BROWSER_FAMILY_COOKIE, PAYPAL_WHO_COOKIE, openBrowserFamilies, openPaypalWho } from "@/auth/start";
import { safeErrorText } from "@/adapters/paypal/http";
import { getDb } from "@/db/client";
import { switchableFamilies } from "@/flows/start";
import { goTo, sameOrigin, signIn } from "../../login/login";

// Settings → "Switch to <teen>" (decision 028). Signs her in to another teen only when the PayPal this browser last
// logged in with can open BOTH the teen she's on now and the one she picked: live, owned by that PayPal, and, for the
// shared sandbox login, made in this browser. Anything else changes nothing. `to` names the tab she was on, so Rules
// switches to the other teen's Rules; only these tabs, so it can never send her anywhere else.
const TABS: Record<string, string> = {
  home: "/g?switched=1", rules: "/g/rules", savings: "/g/savings", invest: "/g/invest", activity: "/g/activity", settings: "/g/settings",
};
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
  const form = await req.formData().catch(() => null);
  const id = form?.get("familyId"), to = form?.get("to"), requestId = form?.get("request");
  if (!who || typeof id !== "string" || id.length > 100) return goTo(req, "/g/settings?switch=failed");
  try {
    const mine = await switchableFamilies(await getDb(), who, openBrowserFamilies(readCookie(req, BROWSER_FAMILY_COOKIE), now));
    if (!mine.some((f) => f.id === current) || !mine.some((f) => f.id === id)) return goTo(req, "/g/settings?switch=failed");
  } catch (err) {
    console.error("switch: checking her teens failed", safeErrorText(err));
    return goTo(req, "/g/settings?switch=failed");
  }
  // A push for another teen's request (review HIGH-2): straight to that request, once she's on that teen.
  const request = to === "request" && typeof requestId === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(requestId) ? `/g/requests/${requestId}` : null;
  return signIn(goTo(req, request ?? (typeof to === "string" && Object.hasOwn(TABS, to) ? TABS[to] : null) ?? TABS.home), id);
}
