import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cartHash } from "./hash";
import type { Cart, Cents, Decision, Grant } from "./types";

export const TOKEN_TTL_MS = 120_000;

export interface AuthToken {
  tokenId: string; grantId: string; grantVersion: number; cartHash: string;
  amountCents: Cents; merchantId: string; issuedAt: string; expiresAt: string; signature: string;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "BAD_SIGNATURE" | "EXPIRED" | "CONSUMED" | "CART_MISMATCH" | "AMOUNT_MISMATCH" };

function sign(body: Omit<AuthToken, "signature">, secret: string): string {
  const sorted = Object.fromEntries(Object.entries(body).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return createHmac("sha256", secret).update(JSON.stringify(sorted)).digest("hex");
}

export function mintToken(d: Decision, grant: Grant, cart: Cart, now: Date, secret: string): AuthToken {
  if (d.outcome !== "ALLOW") throw new Error(`cannot mint token for outcome ${d.outcome}`);
  if (!secret) throw new Error("token secret is required");
  const body = {
    tokenId: randomUUID(), grantId: grant.id, grantVersion: grant.version, cartHash: cartHash(cart),
    amountCents: cart.totalCents, merchantId: cart.merchantId, issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
  };
  return { ...body, signature: sign(body, secret) };
}

export function verifyToken(
  t: AuthToken, cart: Cart, now: Date, secret: string, isConsumed: (tokenId: string) => boolean,
): VerifyResult {
  const { signature, ...body } = t;
  const expected = Buffer.from(sign(body, secret), "hex");
  const given = Buffer.from(signature, "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "BAD_SIGNATURE" };
  if (now.getTime() > Date.parse(t.expiresAt)) return { ok: false, reason: "EXPIRED" };
  if (isConsumed(t.tokenId)) return { ok: false, reason: "CONSUMED" };
  if (cartHash(cart) !== t.cartHash) return { ok: false, reason: "CART_MISMATCH" };
  if (cart.totalCents !== t.amountCents) return { ok: false, reason: "AMOUNT_MISMATCH" };
  return { ok: true };
}
