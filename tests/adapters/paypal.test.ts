import { describe, expect, it, vi } from "vitest";
import { paypalFromEnv, paypalHttp, type PaypalHttp } from "@/adapters/paypal/http";
import { chargeVaulted } from "@/adapters/paypal/orders";
import { createPaymentToken, createSetupToken, deletePaymentToken } from "@/adapters/paypal/vault";
import { verifyWebhook } from "@/adapters/paypal/webhooks";
import { listTransactions } from "@/adapters/paypal/transactions";
import { mintToken } from "@/engine/token";
import type { Cart, Decision, Grant } from "@/engine/types";

const SECRET = "test-token-secret";
const PP_SECRET = "super-secret-paypal-value";
const cfg = { baseUrl: "https://api.sandbox.paypal.test", clientId: "cid", secret: PP_SECRET };
const now = new Date("2026-11-05T12:00:00Z");
const cart: Cart = { merchantId: "m1", items: [{ sku: "a", title: "Book", qty: 1, unitCents: 1250 }], totalCents: 1250 };
const grant = { id: "g1", version: 1 } as unknown as Grant;
const allow = { outcome: "ALLOW" } as unknown as Decision;
const token = () => mintToken(allow, grant, cart, now, SECRET);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const oauth = () => json({ access_token: "AT", expires_in: 3600 });

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
function mockFetch(handler: Handler) {
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/v1/oauth2/token")) return oauth();
    return handler(u, init ?? {});
  });
  return fn;
}
const client = (f: ReturnType<typeof mockFetch>): PaypalHttp => paypalHttp(cfg, f as unknown as typeof fetch);
const apiCalls = (f: ReturnType<typeof mockFetch>) => f.mock.calls.filter(([u]) => !String(u).endsWith("/v1/oauth2/token"));
const args = { vaultId: "VAULT1", description: "Tether purchase" };
const completedOrder = { id: "O1", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "C1", status: "COMPLETED" }] } }] };

describe("paypalHttp", () => {
  it("OAuth token reused across two calls", async () => {
    const f = mockFetch(() => json({}));
    const p = client(f);
    await p.request("GET", "/x");
    await p.request("GET", "/y");
    expect(f.mock.calls.filter(([u]) => String(u).endsWith("/v1/oauth2/token"))).toHaveLength(1);
  });

  it("PayPal error surfaces name and debug_id but never the secret", async () => {
    const f = mockFetch(() => json({ name: "UNPROCESSABLE_ENTITY", message: "bad vault", debug_id: "dbg123" }, 422));
    const err = await client(f).request("POST", "/x").catch((e: Error) => e);
    expect((err as Error).message).toContain("UNPROCESSABLE_ENTITY");
    expect((err as Error).message).toContain("dbg123");
    expect(JSON.stringify(err) + (err as Error).message + (err as Error).stack).not.toContain(PP_SECRET);
  });
});

describe("chargeVaulted", () => {
  it("uses token amount and request id", async () => {
    const f = mockFetch(() => json(completedOrder, 201));
    const t = token();
    const r = await chargeVaulted(t, cart, SECRET, now, client(f), args);
    expect(r).toEqual({ ok: true, orderId: "O1", captureId: "C1", status: "COMPLETED" });
    const [url, init] = apiCalls(f)[0];
    expect(String(url)).toBe(`${cfg.baseUrl}/v2/checkout/orders`);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["PayPal-Request-Id"]).toBe(t.tokenId);
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0].amount).toEqual({ currency_code: "USD", value: "12.50" });
    expect(body.purchase_units[0].reference_id).toBe(t.cartHash.slice(0, 32));
    expect(body.purchase_units[0].custom_id).toBe(t.tokenId);
    expect(body.payment_source.paypal.vault_id).toBe("VAULT1");
  });

  it("returns ok:false on 422 without throwing", async () => {
    const f = mockFetch(() => json({ name: "UNPROCESSABLE_ENTITY", message: "nope", debug_id: "d1" }, 422));
    const r = await chargeVaulted(token(), cart, SECRET, now, client(f), args);
    expect(r).toMatchObject({ ok: false, outcome: "declined" }); // PayPal refused: no money moved
    expect(!r.ok && r.error).toContain("UNPROCESSABLE_ENTITY");
  });

  it("returns ok:false on timeout", async () => {
    vi.useFakeTimers();
    try {
      const f = mockFetch((_u, init) => new Promise<Response>((_res, rej) => {
        init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
      }));
      const pending = chargeVaulted(token(), cart, SECRET, now, client(f), args);
      await vi.advanceTimersByTimeAsync(15_001);
      const r = await pending;
      expect(r).toMatchObject({ ok: false, outcome: "unknown" }); // money may have moved: never reverse
      expect(!r.ok && r.error).toContain("TIMEOUT");
    } finally {
      vi.useRealTimers();
    }
  });

  it("invalid token makes no HTTP call", async () => {
    const f = mockFetch(() => json(completedOrder));
    const bad = { ...token(), signature: "0".repeat(64) };
    const r = await chargeVaulted(bad, cart, SECRET, now, client(f), args);
    expect(r).toEqual({ ok: false, outcome: "declined", error: "TOKEN_BAD_SIGNATURE" });
    expect(f).not.toHaveBeenCalled();
  });

  it("COMPLETED on create skips capture call", async () => {
    const f = mockFetch(() => json(completedOrder, 201));
    await chargeVaulted(token(), cart, SECRET, now, client(f), args);
    expect(apiCalls(f)).toHaveLength(1);
  });

  it("non-COMPLETED create triggers capture", async () => {
    const t = token();
    const f = mockFetch((u) =>
      u.endsWith("/capture") ? json(completedOrder, 201) : json({ id: "O1", status: "APPROVED" }, 201));
    const r = await chargeVaulted(t, cart, SECRET, now, client(f), args);
    expect(r).toMatchObject({ ok: true, captureId: "C1" });
    const calls = apiCalls(f);
    expect(calls).toHaveLength(2);
    expect(String(calls[1][0])).toBe(`${cfg.baseUrl}/v2/checkout/orders/O1/capture`);
    expect(((calls[1][1] as RequestInit).headers as Record<string, string>)["PayPal-Request-Id"]).toBe(`${t.tokenId}-capture`);
  });

  it("maps PENDING capture to PENDING", async () => {
    const pending = { id: "O1", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "C1", status: "PENDING" }] } }] };
    const f = mockFetch(() => json(pending, 201));
    const r = await chargeVaulted(token(), cart, SECRET, now, client(f), args);
    expect(r).toMatchObject({ ok: true, status: "PENDING" });
  });

  it("5xx and a capture with no terminal status are unknown; a DECLINED capture is declined", async () => {
    const r5 = await chargeVaulted(token(), cart, SECRET, now, client(mockFetch(() => json({ name: "INTERNAL_SERVER_ERROR", message: "x" }, 500))), args);
    expect(r5).toMatchObject({ ok: false, outcome: "unknown" });
    const noCap = await chargeVaulted(token(), cart, SECRET, now, client(mockFetch(() => json({ id: "O1", status: "APPROVED" }, 201))), args);
    expect(noCap).toMatchObject({ ok: false, outcome: "unknown", error: "NO_CAPTURE_IN_RESPONSE" });
    const declined = { id: "O1", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "C1", status: "DECLINED" }] } }] };
    const rd = await chargeVaulted(token(), cart, SECRET, now, client(mockFetch(() => json(declined, 201))), args);
    expect(rd).toMatchObject({ ok: false, outcome: "declined" });
  });

  it("payee email passed through when given", async () => {
    const f = mockFetch(() => json(completedOrder, 201));
    await chargeVaulted(token(), cart, SECRET, now, client(f), { ...args, payeeEmail: "shop@example.com" });
    const body = JSON.parse(String((apiCalls(f)[0][1] as RequestInit).body));
    expect(body.purchase_units[0].payee).toEqual({ email_address: "shop@example.com" });
  });
});

describe("vault", () => {
  it("createSetupToken returns the approve link", async () => {
    const f = mockFetch(() => json({ id: "ST1", links: [{ rel: "self", href: "https://s" }, { rel: "approve", href: "https://approve" }] }, 201));
    expect(await createSetupToken(client(f), "https://r", "https://c")).toEqual({ id: "ST1", approveUrl: "https://approve" });
    const body = JSON.parse(String((apiCalls(f)[0][1] as RequestInit).body));
    expect(body.payment_source.paypal).toMatchObject({ usage_type: "MERCHANT", customer_type: "CONSUMER" });
  });

  it("createPaymentToken exchanges the setup token", async () => {
    const f = mockFetch(() => json({ id: "PT1" }, 201));
    expect(await createPaymentToken(client(f), "ST1")).toEqual({ paymentTokenId: "PT1" });
    expect(JSON.parse(String((apiCalls(f)[0][1] as RequestInit).body))).toEqual({ payment_source: { token: { id: "ST1", type: "SETUP_TOKEN" } } });
  });

  it("deletePaymentToken sends DELETE", async () => {
    const f = mockFetch(() => new Response(null, { status: 204 }));
    await deletePaymentToken(client(f), "PT1");
    const [url, init] = apiCalls(f)[0];
    expect(String(url)).toBe(`${cfg.baseUrl}/v3/vault/payment-tokens/PT1`);
    expect((init as RequestInit).method).toBe("DELETE");
  });
});

describe("webhooks", () => {
  const headers = new Headers({
    "paypal-auth-algo": "A", "paypal-cert-url": "https://cert", "paypal-transmission-id": "T",
    "paypal-transmission-sig": "S", "paypal-transmission-time": "2026-11-05T00:00:00Z",
  });
  it("verifyWebhook true only on SUCCESS", async () => {
    const ok = mockFetch(() => json({ verification_status: "SUCCESS" }));
    expect(await verifyWebhook(client(ok), "WH", headers, '{"id":"E1"}')).toBe(true);
    const body = JSON.parse(String((apiCalls(ok)[0][1] as RequestInit).body));
    expect(body).toMatchObject({ webhook_id: "WH", transmission_id: "T", webhook_event: { id: "E1" } });
    const fail = mockFetch(() => json({ verification_status: "FAILURE" }));
    expect(await verifyWebhook(client(fail), "WH", headers, '{"id":"E1"}')).toBe(false);
    const err = mockFetch(() => json({ name: "X" }, 500));
    expect(await verifyWebhook(client(err), "WH", headers, '{"id":"E1"}')).toBe(false);
  });
});

describe("transactions", () => {
  it('listTransactions converts "12.50" to 1250', async () => {
    const f = mockFetch(() => json({ transaction_details: [{ transaction_info: { transaction_id: "TX1", transaction_amount: { value: "12.50" }, transaction_status: "S" } }] }));
    expect(await listTransactions(client(f), now, now)).toEqual([{ id: "TX1", amountCents: 1250, status: "S" }]);
  });

  it("listTransactions keeps custom_field / reference id and reads every page", async () => {
    const f = mockFetch((u) => {
      const page = new URL(u).searchParams.get("page");
      const info = page === "1"
        ? { transaction_id: "TX1", transaction_amount: { value: "6.00" }, transaction_status: "S", custom_field: "tok-1" }
        : { transaction_id: "TX2", transaction_amount: { value: "-6.00" }, transaction_status: "S", custom_field: "tok-1", paypal_reference_id: "TX1" };
      return json({ transaction_details: [{ transaction_info: info }], total_pages: 2 });
    });
    expect(await listTransactions(client(f), now, now)).toEqual([
      { id: "TX1", amountCents: 600, status: "S", customField: "tok-1" },
      { id: "TX2", amountCents: -600, status: "S", customField: "tok-1", referenceId: "TX1" },
    ]);
    expect(apiCalls(f)).toHaveLength(2);
  });
});

describe("paypalFromEnv", () => {
  const creds = { PAYPAL_CLIENT_ID: "c", PAYPAL_CLIENT_SECRET: "s" };
  it("accepts only the https sandbox, plus localhost for the e2e fake (TETHER_E2E=1, never production)", () => {
    expect(() => paypalFromEnv({ ...creds, NODE_ENV: "production" })).not.toThrow();
    expect(() => paypalFromEnv({ ...creds, NODE_ENV: "production", PAYPAL_BASE_URL: "https://api-m.paypal.com" })).toThrow(/sandbox/);
    expect(() => paypalFromEnv({ ...creds, NODE_ENV: "production", PAYPAL_BASE_URL: "http://api-m.sandbox.paypal.com" })).toThrow(/sandbox/);
    expect(() => paypalFromEnv({ ...creds, NODE_ENV: "production", TETHER_E2E: "1", PAYPAL_BASE_URL: "http://localhost:3101" })).toThrow(/sandbox/);
    expect(() => paypalFromEnv({ ...creds, NODE_ENV: "development", PAYPAL_BASE_URL: "http://localhost:3101" })).toThrow(/sandbox/);
    expect(() => paypalFromEnv({ ...creds, NODE_ENV: "development", TETHER_E2E: "1", PAYPAL_BASE_URL: "http://localhost:3101" })).not.toThrow();
    expect(() => paypalFromEnv({ ...creds, NODE_ENV: "development", TETHER_E2E: "1", PAYPAL_BASE_URL: "https://evil.example" })).toThrow(/sandbox/);
  });
});
