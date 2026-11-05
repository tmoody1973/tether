// A stand-in for PayPal's sandbox during e2e: OAuth, Transaction Search and the vault delete. Never real money.
// Transaction Search returns Tether's whole merchant account, so it includes other families' and unlinked rows.
import { createServer } from "node:http";
import { E2E } from "./fixtures";

const row = (id: string, value: string, custom?: string) =>
  ({ transaction_info: { transaction_id: id, transaction_amount: { currency_code: "USD", value }, transaction_status: "S", ...(custom ? { custom_field: custom } : {}) } });

const TRANSACTIONS = {
  transaction_details: [
    row(E2E.receiptCapture, "6.00", E2E.tokens.receipt),
    row(E2E.missingCapture, "4.50", E2E.tokens.missing),
    row(E2E.otherFamilyCapture, "9.99", E2E.tokens.other),
    row(E2E.unlinkedCapture, "50.00"),
  ],
  total_pages: 1,
};

createServer((req, res) => {
  const send = (status: number, body?: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  const path = (req.url ?? "").split("?")[0];
  if (req.method === "POST" && path === "/v1/oauth2/token") return send(200, { access_token: "e2e-fake", expires_in: 3600 });
  if (req.method === "GET" && path === "/v1/reporting/transactions") return send(200, TRANSACTIONS);
  // The saved wallet is a placeholder PayPal has never seen: removal is refused, so the page must say so honestly.
  if (req.method === "DELETE" && path.startsWith("/v3/vault/payment-tokens/")) return send(404, { name: "RESOURCE_NOT_FOUND", message: "not found" });
  if (req.method === "GET" && path === "/health") return send(200, { ok: true });
  send(404, { name: "NOT_FAKED", message: `${req.method} ${path}` });
}).listen(E2E.paypalPort);
