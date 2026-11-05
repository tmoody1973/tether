/* Live sandbox smoke (NOT run in CI): pnpm tsx scripts/paypal-smoke.ts <vaultId>
   Needs PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, TOKEN_SECRET; PAYPAL_BASE_URL optional. Charges $1.00. */
import { paypalHttp } from "../src/adapters/paypal/http";
import { chargeVaulted } from "../src/adapters/paypal/orders";
import { mintToken } from "../src/engine/token";
import type { Cart, Decision, Grant } from "../src/engine/types";

const vaultId = process.argv[2];
const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, TOKEN_SECRET } = process.env;
if (!vaultId || !PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !TOKEN_SECRET) {
  console.error("usage: paypal-smoke.ts <vaultId>  (env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, TOKEN_SECRET)");
  process.exit(1);
}
const p = paypalHttp({
  baseUrl: process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com",
  clientId: PAYPAL_CLIENT_ID,
  secret: PAYPAL_CLIENT_SECRET,
});
const cart: Cart = { merchantId: "smoke", items: [{ sku: "smoke-1", title: "Smoke test", qty: 1, unitCents: 100 }], totalCents: 100 };
const now = new Date();
const token = mintToken({ outcome: "ALLOW" } as unknown as Decision, { id: "smoke", version: 1 } as unknown as Grant, cart, now, TOKEN_SECRET);
const r = await chargeVaulted(token, cart, TOKEN_SECRET, now, p, { vaultId, description: "Tether smoke test" });
console.log(r.ok ? `captured ${r.captureId} (${r.status}) order ${r.orderId}` : `failed: ${r.error}`);
process.exit(r.ok ? 0 : 1);
