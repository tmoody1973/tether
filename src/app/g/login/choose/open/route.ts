import { readCookie } from "@/auth/guardian";
import { START_COOKIE, openStart } from "@/auth/start";
import { safeErrorText } from "@/adapters/paypal/http";
import { getDb } from "@/db/client";
import { isSharedLogin, ownedFamilies } from "@/flows/start";
import { goTo, sameOrigin, signIn } from "../../login";

// "Which teen?": signs in to the family she picked, only if the PayPal she just logged in with owns it.
export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return goTo(req, "/g?login=failed");
  const who = openStart(readCookie(req, START_COOKIE), new Date())?.who;
  if (!who) return goTo(req, "/g?login=expired");
  const id = (await req.formData().catch(() => null))?.get("familyId");
  if (typeof id !== "string" || id.length > 100) return goTo(req, "/g?login=failed");
  try {
    const db = await getDb();
    if (await isSharedLogin(db, who)) return goTo(req, "/g?login=failed"); // review H1: the shared login never picks a family
    if (!(await ownedFamilies(db, who.sub)).some((f) => f.id === id)) return goTo(req, "/g?login=failed");
  } catch (err) {
    console.error("login: opening the chosen family failed", safeErrorText(err));
    return goTo(req, "/g?login=failed");
  }
  return signIn(goTo(req, "/g", { dropStart: true }), id);
}
