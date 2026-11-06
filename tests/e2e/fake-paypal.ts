// Stand-ins for PayPal's sandbox and Channel3 during e2e. Never real money, never a real shop.
// - PayPal: OAuth, create-order (idempotent on PayPal-Request-Id, like PayPal), Transaction Search (Tether's
//   whole merchant account: other families' and unlinked rows too), and a vault delete that is refused.
// - Channel3: product `sku-<cents>` costs <cents>, at the shop it is asked about. Search returns the same three
//   products whatever the words (the teen e2e agent proposes exactly these); lookup reads `sku-<cents>` from the URL.
// - Alpaca (broker + market data): a few assets, deterministic daily bars, an account, an instant journal deposit,
//   and orders that are always accepted but not filled (the market is "closed", so investments end up queued).
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

const ASSETS = [
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", exchange: "ARCA", tradable: true, fractionable: true },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", exchange: "ARCA", tradable: true, fractionable: true },
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", exchange: "ARCA", tradable: true, fractionable: true },
  { symbol: "VT", name: "Vanguard Total World Stock ETF", exchange: "ARCA", tradable: true, fractionable: true },
  { symbol: "AAPL", name: "Apple Inc. Common Stock", exchange: "NASDAQ", tradable: true, fractionable: true },
  { symbol: "NEWX", name: "Newly Listed Example Fund", exchange: "ARCA", tradable: true, fractionable: true },
];
// Price today and each past year's change, most recent first, so a 1-year and a 5-year window always agree.
// One down year each, so the chart shows a fall in its neutral style.
const PATHS: Record<string, { today: number; years: number[] }> = {
  SPY: { today: 600, years: [0.12, 0.22, -0.18, 0.27, 0.16] },
  VOO: { today: 550, years: [0.12, 0.22, -0.18, 0.27, 0.16] },
  VTI: { today: 300, years: [0.1, 0.2, -0.2, 0.25, 0.18] },
};
const DEFAULT_PATH = { today: 100, years: [0.08, 0.1, -0.1, 0.15, 0.05] };
/** Listed this many days ago: bars start then (R42: shorter histories must say so). */
const LISTED_DAYS: Record<string, number> = { NEWX: 120 };
const DAY = 86_400_000;

/** Dated weekly closes across the asked window (1 or 5 years), oldest first: exact, whatever today's date is. */
function bars(symbol: string, start: string | null, end: string | null) {
  const { today, years } = PATHS[symbol] ?? DEFAULT_PATH;
  const endMs = Date.parse(end ?? "") || Date.now();
  const span = Math.max(1, Math.min(5, Math.round((endMs - Date.parse(start ?? "")) / (365 * DAY)) || 1));
  const listedMs = LISTED_DAYS[symbol] ? endMs - LISTED_DAYS[symbol] * DAY : -Infinity;
  const price = (ago: number) => { // ago: years before the last bar
    let p = today;
    for (let k = 0; k < Math.floor(ago); k++) p /= 1 + years[k];
    const frac = ago - Math.floor(ago);
    return frac > 0 ? p / (1 + years[Math.floor(ago)]) ** frac : p;
  };
  const points = span * 52;
  return Array.from({ length: points + 1 }, (_, i) => {
    const ago = span * (1 - i / points);
    return { t: new Date(endMs - ago * 365 * DAY).toISOString(), c: Math.round(price(ago) * 100) / 100 };
  }).filter((b) => Date.parse(b.t) >= listedMs);
}

// Searched with no shop filter (shops that SELL it): matched by title. Two shoe shops, one product offered by both.
const CATALOGUE = [
  { ...c3("sku-6000", "Canvas high-top sneakers", 6000, "kickscrew.com"), offers: [
    { domain: "kickscrew.com", price: { price: 60, currency: "USD" }, availability: "InStock" },
    { domain: "nike.com", price: { price: 65, currency: "USD" }, availability: "InStock" }] },
  c3("sku-7000", "Retro running sneakers", 7000, "kickscrew.com"),
];

const SITES = [["Etsy", "etsy.com"], ["Nike", "nike.com"], ["Target", "target.com"], ["Lego", "lego.com"]]
  .map(([name, domain]) => ({ id: domain, name, url: `https://www.${domain}/` }));

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
    if (req.method === "POST" && path === "/v1/search") {
      const body = JSON.parse(raw || "{}") as { query?: string; filters?: { website_ids?: string[] } | null };
      if (body.filters?.website_ids) return send(200, { products: SEARCH, next_page_token: null }); // Zoe's product search
      const q = (body.query ?? "").toLowerCase();
      return send(200, { products: CATALOGUE.filter((p) => p.title.toLowerCase().includes(q)), next_page_token: null });
    }
    if (req.method === "GET" && path === "/v1/websites/search") { // shop search by name (Amara's "Add a shop", Zoe's "Suggest a shop")
      const q = (url.searchParams.get("query") ?? "").toLowerCase();
      return send(200, { websites: SITES.filter((w) => w.name.toLowerCase().includes(q)) });
    }
    if (req.method === "POST" && path === "/v1/lookup") {
      const link = String((JSON.parse(raw || "{}") as { url?: string }).url ?? "");
      const sku = link.match(/sku-(\d+)/);
      if (!sku) return send(422, { detail: "not a product page" });
      const domain = new URL(link).hostname.replace(/^www\./, "");
      return send(200, { product: c3(`sku-${sku[1]}`, "Notebook", Number(sku[1]), domain) });
    }
    // Alpaca (OAuth shares /v1/oauth2/token with PayPal's above: ALPACA_AUTH_URL points there).
    if (req.method === "GET" && path === "/v1/assets") return send(200, ASSETS);
    const stock = path.match(/^\/v2\/stocks\/([A-Z.]+)\/bars$/);
    if (req.method === "GET" && stock) return send(200, { bars: bars(stock[1], url.searchParams.get("start"), url.searchParams.get("end")), next_page_token: null });
    if (req.method === "POST" && path === "/v1/accounts") return send(200, { id: `E2E-ALPACA-ACCT-${++n}` });
    if (req.method === "POST" && path === "/v1/journals") return send(200, { id: `E2E-ALPACA-JNL-${++n}` });
    if (req.method === "GET" && /^\/v1\/trading\/accounts\/[^/]+\/orders:by_client_order_id$/.test(path)) return send(404, { message: "order not found" });
    if (req.method === "POST" && /^\/v1\/trading\/accounts\/[^/]+\/orders$/.test(path)) return send(200, { id: `E2E-ALPACA-ORD-${++n}`, status: "accepted" });
    if (req.method === "GET" && /^\/v1\/trading\/accounts\/[^/]+\/orders\/[^/]+$/.test(path)) return send(200, { status: "accepted" });
    if (req.method === "GET" && path === "/health") return send(200, { ok: true });
    send(404, { name: "NOT_FAKED", message: `${req.method} ${path}` });
  });
}).listen(E2E.fakePort);
