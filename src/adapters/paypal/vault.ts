import type { PaypalHttp } from "./http";

export async function createSetupToken(
  p: PaypalHttp, returnUrl: string, cancelUrl: string,
): Promise<{ id: string; approveUrl: string }> {
  const { data } = await p.request<{ id: string; links: { rel: string; href: string }[] }>("POST", "/v3/vault/setup-tokens", {
    body: {
      payment_source: {
        paypal: {
          usage_type: "MERCHANT",
          customer_type: "CONSUMER",
          experience_context: { return_url: returnUrl, cancel_url: cancelUrl },
        },
      },
    },
  });
  const approve = data.links?.find((l) => l.rel === "approve");
  if (!approve) throw new Error("PayPal setup token response had no approve link");
  return { id: data.id, approveUrl: approve.href };
}

/**
 * The saved wallet's id, plus the PayPal account it belongs to when PayPal's reply says (payment_source.paypal
 * payer_id / email_address). UNVERIFIED whether the sandbox fills those in: callers treat them as optional.
 */
export async function createPaymentToken(p: PaypalHttp, setupTokenId: string): Promise<{ paymentTokenId: string; payerId?: string; email?: string }> {
  const { data } = await p.request<{ id: string; payment_source?: { paypal?: { payer_id?: unknown; email_address?: unknown } } }>(
    "POST", "/v3/vault/payment-tokens", { body: { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } } },
  );
  const wallet = data.payment_source?.paypal;
  const text = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 254 ? v : undefined);
  return { paymentTokenId: data.id, payerId: text(wallet?.payer_id), email: text(wallet?.email_address)?.toLowerCase() };
}

/**
 * Same PayPal account as the one she logged in with? Compares whichever of payer id and email both sides have; any
 * match is enough (PayPal doesn't promise its identity payer id and its vault payer id are the same kind of id).
 * "unknown" when there is nothing to compare.
 */
export function sameAccount(
  login: { payerId: string | null; email: string | null }, wallet: { payerId?: string; email?: string },
): "same" | "different" | "unknown" {
  const checks: boolean[] = [];
  if (login.payerId && wallet.payerId) checks.push(login.payerId === wallet.payerId);
  if (login.email && wallet.email) checks.push(login.email.toLowerCase() === wallet.email.toLowerCase());
  return checks.length === 0 ? "unknown" : checks.includes(true) ? "same" : "different";
}

export async function deletePaymentToken(p: PaypalHttp, paymentTokenId: string): Promise<void> {
  await p.request("DELETE", `/v3/vault/payment-tokens/${encodeURIComponent(paymentTokenId)}`);
}
