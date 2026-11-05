// Spike: Alpaca Broker sandbox auth + custodial account. Never prints secrets.
const B = process.env.ALPACA_BROKER_BASE_URL!;
const basic = Buffer.from(`${process.env.ALPACA_BROKER_KEY}:${process.env.ALPACA_BROKER_SECRET}`).toString("base64");
const H = { Authorization: `Basic ${basic}`, "Content-Type": "application/json" };

// Loose shape for the fields the spike reads from Alpaca responses (body may also be a plain string).
interface Loose { id?: string; status?: string; account_type?: string }

async function call(method: string, url: string, body?: unknown) {
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j: unknown = t; try { j = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: j as Loose };
}
const show = (l: string, r: { status: number; body: unknown }) =>
  console.log(l, r.status, typeof r.body === "string" ? r.body.slice(0, 300) : JSON.stringify(r.body).slice(0, 600));

async function main() {
  show("auth GET /v1/accounts?limit=1 (Basic)", await call("GET", `${B}/v1/accounts?limit=1`));
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
    show("transfer $25", await call("POST", `${B}/v1/transfers`, { account_id: id, transfer_type: "ach", relationship_id: undefined, amount: "25", direction: "INCOMING" }));
    show("order $5 VTI", await call("POST", `${B}/v1/trading/accounts/${id}/orders`, { symbol: "VTI", notional: "5", side: "buy", type: "market", time_in_force: "day" }));
  }
  const d = process.env.ALPACA_DATA_BASE_URL!;
  show(`data ${d} bars`, await call("GET", `${d}/stocks/VTI/bars?timeframe=1Day&limit=2`));
  show("data data.alpaca.markets bars", await call("GET", `https://data.alpaca.markets/v2/stocks/VTI/bars?timeframe=1Day&limit=2`));
}
main().catch((e) => console.log("FATAL", e.message));
