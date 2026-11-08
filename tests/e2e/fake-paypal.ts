// Stand-ins for PayPal's sandbox and Channel3 during e2e. Never real money, never a real shop.
// - PayPal: OAuth, Log in with PayPal (/connect + userinfo), saving a wallet (vault setup → approve → payment token),
//   create-order (idempotent on PayPal-Request-Id, like PayPal), Transaction Search (Tether's
//   whole merchant account: other families' and unlinked rows too), and a vault delete that is refused.
// - Channel3: product `sku-<cents>` costs <cents>, at the shop it is asked about. Search returns the same three
//   products whatever the words (the teen e2e agent proposes exactly these); lookup reads `sku-<cents>` from the URL.
// - Alpaca (broker + market data): a few assets, deterministic daily bars, an account, an instant journal deposit,
//   and orders that are accepted when placed (the market is "closed", so an approval says queued), then filled the next
//   time they're looked up, at last week's close, with filled_qty, filled_avg_price and filled_at.
// - Financial Datasets: VTI, SPY and VOO are covered funds; VTI's holdings are a trimmed copy of the real response.
//   Company facts cover AAPL (and, like the real list, some funds, which the app must never ask about).
// - One leveraged product (AAPX) sits in the asset list so the search can show it isn't available.
import { createServer } from "node:http";
import { E2E } from "./fixtures";
import VTI_HOLDINGS from "../fixtures/fd-vti-holdings.json";

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
  { symbol: "AAPX", name: "T-Rex 2X Long Apple Daily Target ETF", exchange: "BATS", tradable: true, fractionable: true },
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
// The documented /company/facts fields (no employee count in the schema).
const AAPL_FACTS = {
  ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", industry: "Consumer Electronics", sector: "Technology", exchange: "NASDAQ",
  is_active: true, location: "Cupertino, CA", sic_code: "3571", sic_industry: "Electronic Computers", sic_sector: "Manufacturing",
};
const placed = new Map<string, { symbol: string; notional: number; filledAt?: string }>(); // Alpaca order id → order
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
    // Log in with PayPal: /connect "signs in" at once and sends the browser back with a code. The PayPal user is per
    // browser (a cookie this fake sets), so logging in again in the same test is the same parent (decision 028: add
    // another teen), while every test's fresh browser context is a new parent who never finds another test's family.
    if (req.method === "GET" && path === "/connect") {
      const known = /(?:^|;\s*)e2e_paypal_user=(\d+)/.exec(String(req.headers.cookie ?? ""))?.[1];
      const user = known ?? String(++n);
      const back = new URL(url.searchParams.get("redirect_uri") ?? "http://localhost/");
      back.searchParams.set("code", `E2E-LOGIN-${user}.${++n}`);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { location: back.toString(), "set-cookie": `e2e_paypal_user=${user}; Path=/connect; HttpOnly; SameSite=Lax` });
      return res.end();
    }
    if (req.method === "POST" && path === "/v1/oauth2/token") {
      const form = new URLSearchParams(raw);
      if (form.get("grant_type") === "authorization_code") return send(200, { access_token: `login:${form.get("code")}`, expires_in: 28800 });
      return send(200, { access_token: "e2e-fake", expires_in: 3600 });
    }
    if (req.method === "GET" && path === "/v1/identity/oauth2/userinfo") {
      const who = String(req.headers.authorization ?? "").replace(/^Bearer login:/, "").replace(/\.\d+$/, ""); // the user, not this login
      return send(200, { user_id: `e2e-paypal-user-${who}`, given_name: "Amara", name: "Amara Okafor", payer_id: "E2EPAYER1", verified_account: "true", emails: [{ value: "amara@e2e.example", primary: true }] });
    }
    // Saving a wallet (vault v3): a setup token whose approve link comes straight back, then a payment token that says
    // which PayPal account it belongs to (the same one the login above returns).
    if (req.method === "POST" && path === "/v3/vault/setup-tokens") {
      const id = `E2E-SETUP-${++n}`;
      const back = (JSON.parse(raw || "{}") as { payment_source?: { paypal?: { experience_context?: { return_url?: string } } } })
        .payment_source?.paypal?.experience_context?.return_url ?? "";
      const approve = `http://localhost:${E2E.fakePort}/vault/approve?id=${id}&back=${encodeURIComponent(back)}`;
      return send(201, { id, status: "PAYER_ACTION_REQUIRED", links: [{ rel: "approve", href: approve }] });
    }
    if (req.method === "GET" && path === "/vault/approve") {
      const back = new URL(url.searchParams.get("back") ?? "http://localhost/");
      back.searchParams.set("approval_token_id", url.searchParams.get("id") ?? "");
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    if (req.method === "POST" && path === "/v3/vault/payment-tokens") {
      return send(201, { id: `E2E-PT-${++n}`, payment_source: { paypal: { payer_id: "E2EPAYER1", email_address: "amara@e2e.example" } } });
    }
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
    if (req.method === "POST" && /^\/v1\/trading\/accounts\/[^/]+\/orders$/.test(path)) {
      const id = `E2E-ALPACA-ORD-${++n}`;
      const o = JSON.parse(raw || "{}") as { symbol?: string; notional?: string };
      placed.set(id, { symbol: String(o.symbol), notional: Number(o.notional) });
      return send(200, { id, status: "accepted" });
    }
    const orderGet = path.match(/^\/v1\/trading\/accounts\/[^/]+\/orders\/([^/]+)$/);
    if (req.method === "GET" && orderGet) {
      const o = placed.get(orderGet[1]);
      if (!o) return send(200, { status: "accepted", filled_qty: "0", filled_avg_price: null, filled_at: null });
      // Filled at last week's close: never above what the app reads as the latest close, at any hour (it skips a
      // session that hasn't closed), so Zoe's card never shows a dip the fake invented.
      const year = bars(o.symbol, new Date(Date.now() - 365 * DAY).toISOString(), new Date().toISOString());
      const price = year[year.length - 2].c;
      o.filledAt ??= new Date().toISOString();
      return send(200, { status: "filled", filled_qty: (o.notional / price).toFixed(9), filled_avg_price: price.toFixed(2), filled_at: o.filledAt });
    }
    // Financial Datasets (FINANCIALDATASETS_BASE_URL points here).
    if (req.method === "GET" && path === "/index-funds/tickers/") return send(200, { tickers: ["SPY", "VOO", "VTI"] });
    if (req.method === "GET" && path === "/index-funds/") {
      return url.searchParams.get("ticker") === "VTI" ? send(200, VTI_HOLDINGS) : send(404, { error: "Not found" });
    }
    if (req.method === "GET" && path === "/company/facts/tickers/") return send(200, { resource: "company_facts", tickers: ["AAPL", "SPY", "VOO", "VTI"] });
    if (req.method === "GET" && path === "/company/facts") {
      return url.searchParams.get("ticker") === "AAPL" ? send(200, { company_facts: AAPL_FACTS }) : send(404, { error: "Not Found", message: "Ticker not found" });
    }
    if (req.method === "GET" && path === "/news") { // company news, or market news with no ticker; funds have none (as the real API)
      const ticker = url.searchParams.get("ticker");
      if (ticker && ["SPY", "VOO", "VTI"].includes(ticker)) return send(404, { error: "No data found", message: `No news found for ${ticker}` });
      return send(200, { news: [{ ticker, title: `E2E headline${ticker ? ` about ${ticker}` : ""}`, source: "E2E Wire", date: new Date().toISOString(), url: "https://example.com/e2e-news" }] });
    }
    if (req.method === "GET" && path === "/health") return send(200, { ok: true });
    send(404, { name: "NOT_FAKED", message: `${req.method} ${path}` });
  });
}).listen(E2E.fakePort);
