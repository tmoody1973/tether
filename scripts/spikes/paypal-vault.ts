// Spike: PayPal vault-without-purchase + vault_id charge. Never prints secrets/tokens.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BASE = process.env.PAYPAL_BASE_URL!;
const STATE = ".superpowers/spike-state.json";
const load = (): Record<string, string> => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {});
const save = (p: Record<string, string>) => writeFileSync(STATE, JSON.stringify({ ...load(), ...p }, null, 2));

async function token(): Promise<string> {
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  console.log("oauth status", r.status);
  if (!r.ok) throw new Error("oauth failed");
  return ((await r.json()) as { access_token: string }).access_token;
}

async function api(tok: string, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { /* non-json */ }
  return { status: r.status, json };
}

async function charge(tok: string, vaultId: string, payee?: string) {
  const unit: any = { amount: { currency_code: "USD", value: "1.00" } };
  if (payee) unit.payee = { email_address: payee };
  const o = await api(tok, "POST", "/v2/checkout/orders",
    { intent: "CAPTURE", purchase_units: [unit], payment_source: { paypal: { vault_id: vaultId } } },
    { "PayPal-Request-Id": randomUUID() });
  console.log("order http", o.status, "order id", o.json.id, "order status", o.json.status);
  if (o.status >= 400) {
    console.log("ERROR name:", o.json.name, "message:", o.json.message, "details:", JSON.stringify(o.json.details));
    return;
  }
  if (o.json.status !== "COMPLETED") {
    const c = await api(tok, "POST", `/v2/checkout/orders/${o.json.id}/capture`, undefined, { "PayPal-Request-Id": randomUUID() });
    console.log("capture http", c.status, "status", c.json.status, "capture id", c.json.purchase_units?.[0]?.payments?.captures?.[0]?.id);
    if (c.status >= 400) console.log("ERROR name:", c.json.name, "message:", c.json.message, "details:", JSON.stringify(c.json.details));
  } else {
    console.log("capture id", o.json.purchase_units?.[0]?.payments?.captures?.[0]?.id, "capture status", o.json.purchase_units?.[0]?.payments?.captures?.[0]?.status);
  }
}

async function main() {
const [cmd, arg] = process.argv.slice(2);
const tok = await token();
if (cmd === "start") {
  const r = await api(tok, "POST", "/v3/vault/setup-tokens", {
    payment_source: { paypal: { usage_type: "MERCHANT", customer_type: "CONSUMER",
      experience_context: { return_url: "https://example.com/return", cancel_url: "https://example.com/cancel" } } },
  }, { "PayPal-Request-Id": randomUUID() });
  console.log("setup-token http", r.status, "id", r.json.id);
  console.log("approve url:", r.json.links?.find((l: any) => l.rel === "approve")?.href);
  if (r.json.id) save({ setupTokenId: r.json.id });
  else console.log(JSON.stringify(r.json));
} else if (cmd === "finish") {
  const p = await api(tok, "POST", "/v3/vault/payment-tokens",
    { payment_source: { token: { id: load().setupTokenId, type: "SETUP_TOKEN" } } }, { "PayPal-Request-Id": randomUUID() });
  console.log("payment-token http", p.status, "vault id", p.json.id, "customer id", p.json.customer?.id);
  if (!p.json.id) { console.log(JSON.stringify(p.json)); process.exit(1); }
  save({ vaultId: p.json.id });
  await charge(tok, p.json.id);
} else if (cmd === "payee") {
  await charge(tok, load().vaultId, arg);
} else if (cmd === "txsearch") {
  const end = new Date(), start = new Date(end.getTime() - 2 * 864e5);
  const q = `start_date=${start.toISOString().slice(0, 19)}-0000&end_date=${end.toISOString().slice(0, 19)}-0000&fields=transaction_info`;
  const r = await api(tok, "GET", `/v1/reporting/transactions?${q}`);
  console.log("txsearch http", r.status, "count", r.json.transaction_details?.length, r.status >= 400 ? `${r.json.name}: ${r.json.message}` : "");
} else console.log("usage: start|finish|payee <email>|txsearch");
}
main().catch((e) => { console.log("FATAL", e.message); process.exit(1); });
