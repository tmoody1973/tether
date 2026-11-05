import type { Cents } from "@/engine/types";

/** Shown wherever a stand-in (non-custodial) sandbox account backs Zoe's investments. */
export const STAND_IN_LABEL =
  "Sandbox stand-in for a custodial account. In production, Zoe's investments sit in a custodial account managed by Amara.";

const AUTH_URL = "https://authx.sandbox.alpaca.markets/v1/oauth2/token";
const REFRESH_EARLY_MS = 60_000;
const TIMEOUT_MS = 15_000;

/** status 0 = no response (network/timeout). 5xx and 0 are "outcome unknown"; other 4xx are definite rejections. */
export class AlpacaError extends Error {
  constructor(readonly status: number, message: string) {
    super(`Alpaca ${status}: ${message}`);
    this.name = "AlpacaError";
  }
  get outcomeUnknown(): boolean { return this.status === 0 || this.status >= 500; }
}

export interface GuardianKyc {
  givenName: string; familyName: string; email: string; phone: string; dateOfBirth: string; taxId: string;
  street: string; city: string; state: string; postalCode: string;
}
export interface MinorIdentity {
  givenName: string; familyName: string; email: string; dateOfBirth: string; taxId: string; state: string;
}
export interface AlpacaConfig {
  baseUrl: string; key: string; secret: string;
  authUrl?: string;
  /** Sandbox firm account id; when set, deposits are instant JNLC journals, otherwise ACH. */
  firmAccountId?: string;
  /** Build the custodial payload (else an ordinary sandbox trading account is the stand-in). */
  custodialEnabled?: boolean;
}

export const dollars = (cents: Cents): string => (cents / 100).toFixed(2);

export function alpacaBroker(cfg: AlpacaConfig, fetchImpl: typeof fetch = fetch) {
  let cached: { token: string; refreshAt: number } | null = null;

  async function raw(url: string, init: RequestInit): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
      const text = await res.text();
      let data: unknown;
      try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
      if (!res.ok) {
        const msg = (data as { message?: string } | undefined)?.message ?? res.statusText ?? "request failed";
        throw new AlpacaError(res.status, msg);
      }
      return data;
    } catch (e) {
      if (e instanceof AlpacaError) throw e;
      throw new AlpacaError(0, e instanceof Error ? e.message : "network failure");
    } finally { clearTimeout(timer); }
  }

  async function bearer(): Promise<string> {
    if (cached && Date.now() < cached.refreshAt) return cached.token;
    const d = (await raw(cfg.authUrl ?? AUTH_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: cfg.key, client_secret: cfg.secret }),
    })) as { access_token?: string; expires_in?: number } | undefined;
    if (!d?.access_token) throw new AlpacaError(0, "token response had no access_token");
    cached = { token: d.access_token, refreshAt: Date.now() + (d.expires_in ?? 900) * 1000 - REFRESH_EARLY_MS };
    return cached.token;
  }

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await raw(`${cfg.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await bearer()}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })) as T;
  }

  /** Authenticated GET to any Alpaca host (market data shares the broker bearer token). */
  async function getAbsolute<T>(url: string): Promise<T> {
    return (await raw(url, { method: "GET", headers: { Authorization: `Bearer ${await bearer()}` } })) as T;
  }

  const contactOf = (g: GuardianKyc) => ({
    email_address: g.email, phone_number: g.phone, street_address: [g.street], city: g.city, state: g.state,
    postal_code: g.postalCode, country: "USA",
  });
  const identityOf = (g: GuardianKyc) => ({
    given_name: g.givenName, family_name: g.familyName, date_of_birth: g.dateOfBirth, tax_id: g.taxId,
    tax_id_type: "USA_SSN", country_of_citizenship: "USA", country_of_birth: "USA", country_of_tax_residence: "USA",
    funding_source: ["employment_income"], annual_income_min: "30000", annual_income_max: "50000",
    liquid_net_worth_min: "100000", liquid_net_worth_max: "150000", total_net_worth_min: "10000", total_net_worth_max: "10000",
    liquidity_needs: "does_not_matter", investment_experience_with_stocks: "over_5_years",
    investment_experience_with_options: "over_5_years", risk_tolerance: "conservative",
    investment_objective: "market_speculation", investment_time_horizon: "more_than_10_years",
    marital_status: "MARRIED", number_of_dependents: 1,
  });

  return {
    getAbsolute,
    /** Active US equities as Alpaca returns them (caller filters tradable). */
    listAssets: () => call<Array<{ symbol: string; name: string; exchange: string; tradable: boolean; fractionable: boolean }>>(
      "GET", "/v1/assets?status=active&asset_class=us_equity"),

    /** Custodial only when ALPACA_CUSTODIAL_ENABLED === 'true'; otherwise an ordinary sandbox trading account (stand-in). */
    async createCustodialAccount(guardian: GuardianKyc, minor: MinorIdentity): Promise<{ accountId: string; custodial: boolean }> {
      const custodial = cfg.custodialEnabled === true;
      const body = {
        account_type: custodial ? "custodial" : "trading",
        contact: contactOf(guardian), identity: identityOf(guardian),
        disclosures: { is_control_person: false, is_affiliated_exchange_or_finra: false, is_politically_exposed: false, immediate_family_exposed: false },
        agreements: [{ agreement: "customer_agreement", signed_at: new Date().toISOString(), ip_address: "185.13.21.99" }],
        trusted_contact: { given_name: "Jane", family_name: "Doe", email_address: "jane.doe@example.com" },
        ...(custodial ? { minor_identity: {
          given_name: minor.givenName, family_name: minor.familyName, email: minor.email, date_of_birth: minor.dateOfBirth,
          tax_id: minor.taxId, tax_id_type: "USA_SSN", country_of_citizenship: "USA", country_of_birth: "USA",
          country_of_tax_residence: "USA", state: minor.state,
        } } : {}),
      };
      const r = await call<{ id: string }>("POST", "/v1/accounts", body);
      return { accountId: r.id, custodial };
    },

    /** Instant firm journal if a firm account is configured, else ACH relationship + transfer. */
    async deposit(accountId: string, amountCents: Cents, owner = "Tether Demo"): Promise<{ transferId: string }> {
      if (cfg.firmAccountId) {
        const j = await call<{ id: string }>("POST", "/v1/journals", {
          from_account: cfg.firmAccountId, to_account: accountId, entry_type: "JNLC", amount: dollars(amountCents),
          description: "Tether sandbox funding",
        });
        return { transferId: j.id };
      }
      const rels = await call<Array<{ id: string }>>("GET", `/v1/accounts/${accountId}/ach_relationships`);
      const rel = rels[0] ?? await call<{ id: string }>("POST", `/v1/accounts/${accountId}/ach_relationships`, {
        account_owner_name: owner, bank_account_type: "CHECKING", bank_account_number: "32131231abc",
        bank_routing_number: "121000358", nickname: "tether-demo",
      });
      const t = await call<{ id: string }>("POST", `/v1/accounts/${accountId}/transfers`, {
        transfer_type: "ach", relationship_id: rel.id, amount: dollars(amountCents), direction: "INCOMING",
      });
      return { transferId: t.id };
    },

    /** clientOrderId makes the order findable (and un-duplicable) if the response is lost. */
    async placeNotionalOrder(accountId: string, symbol: string, amountCents: Cents, clientOrderId?: string): Promise<{ orderId: string; status: string }> {
      const o = await call<{ id: string; status: string }>("POST", `/v1/trading/accounts/${accountId}/orders`, {
        symbol, notional: dollars(amountCents), side: "buy", type: "market", time_in_force: "day",
        ...(clientOrderId ? { client_order_id: clientOrderId } : {}),
      });
      return { orderId: o.id, status: o.status };
    },

    /** The order Tether already sent for this client id, or null (404). Used to avoid double-placing after a lost response. */
    async findOrderByClientId(accountId: string, clientOrderId: string): Promise<{ orderId: string; status: string } | null> {
      try {
        const o = await call<{ id: string; status: string }>("GET",
          `/v1/trading/accounts/${accountId}/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientOrderId)}`);
        return { orderId: o.id, status: o.status };
      } catch (e) {
        if (e instanceof AlpacaError && e.status === 404) return null;
        throw e;
      }
    },

    async listTransfers(accountId: string): Promise<Array<{ transferId: string; amount: number; createdAt: number; incoming: boolean; status: string }>> {
      const rows = await call<Array<{ id: string; amount: string; created_at: string; direction: string; status: string }>>("GET", `/v1/accounts/${accountId}/transfers`);
      return rows.map((r) => ({ transferId: r.id, amount: Number(r.amount), createdAt: Date.parse(r.created_at), incoming: r.direction === "INCOMING", status: r.status }));
    },

    async getOrder(accountId: string, orderId: string): Promise<{ status: string }> {
      const o = await call<{ status: string }>("GET", `/v1/trading/accounts/${accountId}/orders/${orderId}`);
      return { status: o.status };
    },
  };
}

export type AlpacaBroker = ReturnType<typeof alpacaBroker>;

export function alpacaFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): AlpacaBroker {
  const { ALPACA_BROKER_KEY: key, ALPACA_BROKER_SECRET: secret, ALPACA_BROKER_BASE_URL: baseUrl } = env;
  if (!key || !secret || !baseUrl) throw new Error("ALPACA_BROKER_KEY, ALPACA_BROKER_SECRET, ALPACA_BROKER_BASE_URL are required");
  return alpacaBroker({ baseUrl, key, secret, firmAccountId: env.ALPACA_FIRM_ACCOUNT_ID, custodialEnabled: env.ALPACA_CUSTODIAL_ENABLED === "true" }, fetchImpl);
}
