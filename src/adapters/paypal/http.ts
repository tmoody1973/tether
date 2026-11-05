export interface PaypalConfig { baseUrl: string; clientId: string; secret: string }

export interface PaypalHttp {
  request<T = unknown>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    opts?: { body?: unknown; headers?: Record<string, string> },
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
  ) {
    super(`PayPal ${status} ${paypalName}: ${message}${debugId ? ` (debug_id ${debugId})` : ""}`);
    this.name = "PaypalError";
  }
}

export function paypalHttp(cfg: PaypalConfig, fetchImpl: typeof fetch = fetch): PaypalHttp {
  let cached: { token: string; refreshAt: number } | null = null;

  async function send(url: string, init: RequestInit) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
      const text = await res.text();
      let data: unknown = undefined;
      if (text) {
        try { data = JSON.parse(text); } catch { data = undefined; }
      }
      if (!res.ok) {
        const e = (data ?? {}) as { name?: string; message?: string; debug_id?: string; error?: string; error_description?: string };
        throw new PaypalError(res.status, e.name ?? e.error ?? "HTTP_ERROR", e.message ?? e.error_description ?? res.statusText ?? "request failed", e.debug_id);
      }
      return { status: res.status, headers: res.headers, data };
    } catch (err) {
      if (err instanceof PaypalError) throw err;
      if (ctrl.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
        throw new PaypalError(0, "TIMEOUT", `request timed out after ${REQUEST_TIMEOUT_MS} ms`);
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
    async request<T>(method: "GET" | "POST" | "DELETE", path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}) {
      const token = await accessToken();
      const res = await send(`${cfg.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...opts.headers },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      return { ...res, data: res.data as T };
    },
  };
}
