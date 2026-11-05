import { createHmac, timingSafeEqual } from "node:crypto";

// Guardian (Amara) session cookie: `familyId.expiryMs.hmac`. /g/enter/[key] sets it with guardianCookieOptions().
export const GUARDIAN_COOKIE = "tether_g";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** HttpOnly, SameSite=Lax set explicitly (PayPal's redirect back is a top-level GET, which Lax allows), Path=/, Secure in production. */
export function guardianCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production", maxAge: TTL_MS / 1000 };
}

/** One cookie's raw value from a request's Cookie header, or null. */
export function readCookie(req: Request, name: string): string | null {
  const raw = (req.headers.get("cookie") ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return raw ? decodeURIComponent(raw.slice(name.length + 1)) : null;
}

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
  if (!familyId || familyId.includes(".")) throw new Error("invalid familyId");
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
  let familyId: string | null = null;
  try {
    const raw = readCookie(req, GUARDIAN_COOKIE);
    familyId = raw ? verifyGuardianCookie(raw, now) : null;
  } catch { familyId = null; } // any malformed cookie is simply "not signed in"
  if (!familyId) throw new GuardianAuthError();
  return familyId;
}
