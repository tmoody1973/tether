export interface PaypalConfig { baseUrl: string; clientId: string; secret: string }

export interface PaypalHttp {
  /** false only for the stand-in used when PayPal isn't configured: flows refuse before debiting anything. */
  configured?: boolean;
  request<T = unknown>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    /** timeoutMs: a shorter limit than REQUEST_TIMEOUT_MS for this call (review NEW-2: background refund searches). */
    opts?: { body?: unknown; headers?: Record<string, string>; timeoutMs?: number },
  ): Promise<{ status: number; headers: Headers; data: T }>;
}

export const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_REFRESH_MARGIN_MS = 60_000;

/** Typed PayPal failure. Carries only PayPal's own error fields, never credentials. */
export class PaypalError extends Error {
  constructor(
    readonly status: number,
    readonly paypalName: string,
    message: string,
    readonly debugId?: string,
    /** PayPal's `details[0].issue`, e.g. INSTRUMENT_DECLINED or ORDER_ALREADY_CAPTURED. */
    readonly issue?: string,
  ) {
    super(`PayPal ${status} ${paypalName}${issue ? `/${issue}` : ""}: ${message}${debugId ? ` (debug_id ${debugId})` : ""}`);
    this.name = "PaypalError";
  }
}

/**
 * Safe to log: PayPal's own error text (it carries no ids, tokens or emails), else only the error's class name. A
 * database error's message lists the query's values (drizzle: "Failed query: … params: …"), so it is never logged.
 */
export function safeErrorText(err: unknown): string {
  if (err instanceof PaypalError) return err.message;
  return err instanceof Error ? err.name : "unknown error";
}

export function paypalHttp(cfg: PaypalConfig, fetchImpl: typeof fetch = fetch): PaypalHttp {
  let cached: { token: string; refreshAt: number } | null = null;

  async function send(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
      const text = await res.text();
      let data: unknown = undefined;
      if (text) {
        try { data = JSON.parse(text); } catch { data = undefined; }
      }
      if (!res.ok) {
        const e = (data ?? {}) as {
          name?: string; message?: string; debug_id?: string; error?: string; error_description?: string; details?: { issue?: unknown }[];
        };
        const issue = typeof e.details?.[0]?.issue === "string" ? e.details[0].issue : undefined;
        throw new PaypalError(res.status, e.name ?? e.error ?? "HTTP_ERROR", e.message ?? e.error_description ?? res.statusText ?? "request failed", e.debug_id, issue);
      }
      return { status: res.status, headers: res.headers, data };
    } catch (err) {
      if (err instanceof PaypalError) throw err;
      if (ctrl.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
        throw new PaypalError(0, "TIMEOUT", `request timed out after ${timeoutMs} ms`);
      }
      throw new PaypalError(0, "NETWORK_ERROR", err instanceof Error ? err.message : "network failure");
    } finally {
      clearTimeout(timer);
    }
  }

  async function accessToken(): Promise<string> {
    if (cached && Date.now() < cached.refreshAt) return cached.token;
    const basic = Buffer.from(`${cfg.clientId}:${cfg.secret}`).toString("base64");
    const { data } = await send(`${cfg.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const t = data as { access_token?: string; expires_in?: number };
    if (!t?.access_token) throw new PaypalError(0, "BAD_OAUTH_RESPONSE", "no access_token in response");
    cached = { token: t.access_token, refreshAt: Date.now() + (t.expires_in ?? 0) * 1000 - TOKEN_REFRESH_MARGIN_MS };
    return cached.token;
  }

  return {
    async request<T>(method: "GET" | "POST" | "DELETE", path: string, opts: { body?: unknown; headers?: Record<string, string>; timeoutMs?: number } = {}) {
      const token = await accessToken();
      const res = await send(`${cfg.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...opts.headers },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      }, opts.timeoutMs);
      return { ...res, data: res.data as T };
    },
  };
}

const SANDBOX_HOST = "api-m.sandbox.paypal.com";

/** The e2e suite's local fakes: only with TETHER_E2E=1 (set by playwright.config only), only outside production. */
export function isE2eLocal(url: URL, env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TETHER_E2E === "1" && env.NODE_ENV !== "production" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

/**
 * PayPal client from env. Refuses anything but the sandbox over https: this build never touches real money.
 * The one exception is the e2e suite's local fake PayPal (see isE2eLocal), which can't move money either.
 */
export function paypalFromEnv(env: NodeJS.ProcessEnv = process.env): PaypalHttp {
  const { PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: secret, PAYPAL_BASE_URL } = env;
  if (!clientId || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");
  const baseUrl = PAYPAL_BASE_URL || `https://${SANDBOX_HOST}`;
  const url = new URL(baseUrl);
  const sandbox = url.protocol === "https:" && url.hostname === SANDBOX_HOST;
  if (!sandbox && !isE2eLocal(url, env)) throw new Error("PAYPAL_BASE_URL must be the PayPal sandbox");
  return paypalHttp({ baseUrl, clientId, secret });
}
