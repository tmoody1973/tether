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
  if (!raw) return null;
  try { return decodeURIComponent(raw.slice(name.length + 1)); } catch { return null; } // a broken %-escape is no cookie
}

export class GuardianAuthError extends Error {
  readonly status = 401;
  constructor() { super("guardian sign-in required"); }
}

function signingKey(): string {
  const key = process.env.TETHER_SIGNING_KEY;
  if (!key) throw new Error("TETHER_SIGNING_KEY is not set");
  return key;
}

function mac(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/**
 * The family's OneSignal external id: HMAC-SHA256 of the family id under the signing key, hex. Opaque and stable, never
 * the raw id. The "push-alias:" prefix keeps it from ever equalling a cookie signature made with the same key.
 */
export function pushAlias(familyId: string): string {
  return createHmac("sha256", signingKey()).update(`push-alias:${familyId}`).digest("hex");
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

/**
 * Any other short-lived signed cookie: `base64url(payload).expiryMs.hmac`. The MAC covers `kind:` too, so a value sealed
 * for one purpose never opens as another, and never verifies as a guardian cookie (whose MAC has no kind).
 */
export function sealValue(kind: string, payload: string, now: Date, ttlMs: number): string {
  const body = `${Buffer.from(payload).toString("base64url")}.${now.getTime() + ttlMs}`;
  return `${body}.${mac(`${kind}:${body}`)}`;
}

/** The payload of a value sealValue made for this kind, or null (forged, expired, malformed, another kind). */
export function openValue(kind: string, value: string, now: Date): string | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [data, expiry, sig] = parts;
  if (!/^[A-Za-z0-9_-]*$/.test(data) || !/^\d+$/.test(expiry) || Number(expiry) <= now.getTime()) return null;
  const want = Buffer.from(mac(`${kind}:${data}.${expiry}`));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? Buffer.from(data, "base64url").toString() : null;
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
