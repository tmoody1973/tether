// Stand-ins for PayPal's sandbox and Channel3 during e2e. Never real money, never a real shop.
// - PayPal: OAuth, create-order (idempotent on PayPal-Request-Id, like PayPal), Transaction Search (Tether's
//   whole merchant account: other families' and unlinked rows too), and a vault delete that is refused.
// - Channel3: product `sku-<cents>` costs <cents>, at the shop it is asked about. Search returns the same three
//   products whatever the words (the teen e2e agent proposes exactly these); lookup reads `sku-<cents>` from the URL.
import { createServer } from "node:http";
import { E2E } from "./fixtures";

type Row = { transaction_info: Record<string, unknown> };
const row = (id: string, value: string, custom?: string): Row =>
  ({ transaction_info: { transaction_id: id, transaction_amount: { currency_code: "USD", value }, transaction_status: "S", ...(custom ? { custom_field: custom } : {}) } });

const search: Row[] = [
  row(E2E.receiptCapture, "6.00", E2E.tokens.receipt),
  row(E2E.missingCapture, "4.50", E2E.tokens.missing),
  row(E2E.otherFamilyCapture, "9.99", E2E.tokens.other),
  row(E2E.unlinkedCapture, "50.00"),
];
const orders = new Map<string, unknown>(); // PayPal-Request-Id → order

const c3 = (id: string, title: string, cents: number, domain: string) =>
  ({ id, title, offers: [{ domain, price: { price: cents / 100, currency: "USD" }, availability: "InStock" }] });
// Level 1 Zoe who has bought at Target: fits / needs Amara's OK (first time at Best Buy) / over budget.
const SEARCH = [c3("sku-500", "Notebook", 500, "target.com"), c3("sku-800", "Earbuds", 800, "bestbuy.com"), c3("sku-1500", "Running shoes", 1500, "target.com")];
let n = 0;

createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const send = (status: number, body?: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (req.method === "POST" && path === "/v1/oauth2/token") return send(200, { access_token: "e2e-fake", expires_in: 3600 });
    if (req.method === "POST" && path === "/v2/checkout/orders") {
      const key = String(req.headers["paypal-request-id"] ?? "");
      if (!orders.has(key)) {
        const unit = (JSON.parse(raw || "{}") as { purchase_units?: { custom_id?: string; amount?: { value?: string } }[] }).purchase_units?.[0] ?? {};
        const captureId = `E2E-PAID-${++n}`;
        orders.set(key, { id: `E2E-ORDER-${n}`, status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: captureId, status: "COMPLETED" }] } }] });
        search.push(row(captureId, unit.amount?.value ?? "0.00", unit.custom_id));
      }
      return send(201, orders.get(key));
    }
    if (req.method === "GET" && path === "/v1/reporting/transactions") return send(200, { transaction_details: search, total_pages: 1 });
    // The saved wallet is a placeholder PayPal has never seen: removal is refused, so the page must say so honestly.
    if (req.method === "DELETE" && path.startsWith("/v3/vault/payment-tokens/")) return send(404, { name: "RESOURCE_NOT_FOUND", message: "not found" });
    const product = path.match(/^\/v1\/products\/sku-(\d+)$/);
    if (req.method === "GET" && product) {
      const w = url.searchParams.get("website_ids") ?? "";
      const domain = w.startsWith("[") ? (JSON.parse(w) as string[])[0] : w; // the SDK sends a JSON list
      return send(200, { id: `sku-${product[1]}`, title: "Item", offers: [{ domain, price: { price: Number(product[1]) / 100, currency: "USD" }, availability: "InStock" }] });
    }
    if (req.method === "POST" && path === "/v1/search") return send(200, { products: SEARCH, next_page_token: null });
    if (req.method === "POST" && path === "/v1/lookup") {
      const link = String((JSON.parse(raw || "{}") as { url?: string }).url ?? "");
      const sku = link.match(/sku-(\d+)/);
      if (!sku) return send(422, { detail: "not a product page" });
      const domain = new URL(link).hostname.replace(/^www\./, "");
      return send(200, { product: c3(`sku-${sku[1]}`, "Notebook", Number(sku[1]), domain) });
    }
    if (req.method === "GET" && path === "/health") return send(200, { ok: true });
    send(404, { name: "NOT_FAKED", message: `${req.method} ${path}` });
  });
}).listen(E2E.fakePort);
