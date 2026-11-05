// Spike: Alpaca Broker sandbox auth + custodial account. Never prints secrets.
const B = process.env.ALPACA_BROKER_BASE_URL!;
let H: Record<string, string> = {};
type Loose = { id?: string; status?: string; account_type?: string };
// Broker sandbox auth: Basic -> 401; OAuth client-credentials at authx works (token ~15 min, never printed).
async function auth() {
  const r = await fetch("https://authx.sandbox.alpaca.markets/v1/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.ALPACA_BROKER_KEY!, client_secret: process.env.ALPACA_BROKER_SECRET! }),
  });
  console.log("oauth status", r.status);
  if (!r.ok) throw new Error("oauth failed");
  H = { Authorization: `Bearer ${((await r.json()) as { access_token: string }).access_token}`, "Content-Type": "application/json" };
}

async function call(method: string, url: string, body?: unknown) {
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j: unknown = t; try { j = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: j as Loose };
}
const show = (l: string, r: { status: number; body: unknown }) =>
  console.log(l, r.status, typeof r.body === "string" ? r.body.slice(0, 300) : JSON.stringify(r.body).slice(0, 600));

async function main() {
  await auth();
  show("auth GET /v1/accounts?limit=1 (Bearer)", await call("GET", `${B}/v1/accounts?limit=1`));
  const rev = process.argv[2];
  const body = {
    account_type: "custodial",
    contact: { email_address: `tether-spike-${Date.now()}@example.com`, phone_number: "555-676-7788",
      street_address: ["20 N San Mateo Dr"], city: "San Mateo", state: "CA", postal_code: "94401", country: "USA" },
    identity: { given_name: "Pat", family_name: "Parent", date_of_birth: "1980-01-01", tax_id: "661-55-4321",
      tax_id_type: "USA_SSN", country_of_citizenship: "USA", country_of_birth: "USA", country_of_tax_residence: "USA",
      funding_source: ["employment_income"], annual_income_min: "30000", annual_income_max: "50000",
      liquid_net_worth_min: "100000", liquid_net_worth_max: "150000", total_net_worth_min: "10000", total_net_worth_max: "10000",
      liquidity_needs: "does_not_matter", investment_experience_with_stocks: "over_5_years",
      investment_experience_with_options: "over_5_years", risk_tolerance: "conservative",
      investment_objective: "market_speculation", investment_time_horizon: "more_than_10_years",
      marital_status: "MARRIED", number_of_dependents: 1 },
    disclosures: { is_control_person: false, is_affiliated_exchange_or_finra: false, is_politically_exposed: false, immediate_family_exposed: false },
    agreements: [{ agreement: "customer_agreement", signed_at: new Date().toISOString(), ip_address: "185.13.21.99", ...(rev ? { revision: rev } : {}) }],
    trusted_contact: { given_name: "Jane", family_name: "Doe", email_address: "jane.doe@example.com" },
    minor_identity: { given_name: "Tess", family_name: "Teen", email: "tess@example.com", date_of_birth: "2010-01-01",
      tax_id: "666-54-4321", tax_id_type: "USA_SSN", country_of_citizenship: "USA", country_of_birth: "USA",
      country_of_tax_residence: "USA", state: "CA" },
  };
  const acct = await call("POST", `${B}/v1/accounts`, body);
  show("create custodial", acct);
  const id = acct.body?.id;
  if (id) {
    console.log("account id", id, "status", acct.body.status, "type", acct.body.account_type);
    const rel = await call("POST", `${B}/v1/accounts/${id}/ach_relationships`, { account_owner_name: "Pat Parent", bank_account_type: "CHECKING", bank_account_number: "32131231abc", bank_routing_number: "121000358", nickname: "spike" });
    show("ach relationship", rel);
    show("transfer $25", await call("POST", `${B}/v1/accounts/${id}/transfers`, { transfer_type: "ach", relationship_id: rel.body?.id, amount: "25", direction: "INCOMING" }));
    show("order $5 VTI", await call("POST", `${B}/v1/trading/accounts/${id}/orders`, { symbol: "VTI", notional: "5", side: "buy", type: "market", time_in_force: "day" }));
  }
  show("data.sandbox bars", await call("GET", `https://data.sandbox.alpaca.markets/v2/stocks/VTI/bars?timeframe=1Day&limit=2`));
}
main().catch((e) => console.log("FATAL", e.message));
