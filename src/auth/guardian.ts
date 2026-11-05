import { createHmac, timingSafeEqual } from "node:crypto";

// Guardian (Amara) session cookie: `familyId.expiryMs.hmac`. Task 17's entry step sets it with
// HttpOnly, SameSite=Lax, Path=/ and Secure in production.
export const GUARDIAN_COOKIE = "tether_g";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class GuardianAuthError extends Error {
  readonly status = 401;
  constructor() { super("guardian sign-in required"); }
}

function mac(payload: string): string {
  const key = process.env.TETHER_SIGNING_KEY;
  if (!key) throw new Error("TETHER_SIGNING_KEY is not set");
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function signGuardianCookie(familyId: string, now: Date): string {
  const payload = `${familyId}.${now.getTime() + TTL_MS}`;
  return `${payload}.${mac(payload)}`;
}

export function verifyGuardianCookie(value: string, now: Date): string | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [familyId, expiry, sig] = parts;
  if (!familyId || !/^\d+$/.test(expiry) || Number(expiry) <= now.getTime()) return null;
  const want = Buffer.from(mac(`${familyId}.${expiry}`));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? familyId : null;
}

/** The family id from a valid guardian cookie, or throws GuardianAuthError (401). */
export function requireGuardian(req: Request, now: Date = new Date()): string {
  const raw = (req.headers.get("cookie") ?? "").split(";").map((c) => c.trim())
    .find((c) => c.startsWith(`${GUARDIAN_COOKIE}=`));
  const familyId = raw ? verifyGuardianCookie(decodeURIComponent(raw.slice(GUARDIAN_COOKIE.length + 1)), now) : null;
  if (!familyId) throw new GuardianAuthError();
  return familyId;
}
