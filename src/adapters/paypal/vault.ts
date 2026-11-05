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

export async function createPaymentToken(p: PaypalHttp, setupTokenId: string): Promise<{ paymentTokenId: string }> {
  const { data } = await p.request<{ id: string }>("POST", "/v3/vault/payment-tokens", {
    body: { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } },
  });
  return { paymentTokenId: data.id };
}

export async function deletePaymentToken(p: PaypalHttp, paymentTokenId: string): Promise<void> {
  await p.request("DELETE", `/v3/vault/payment-tokens/${encodeURIComponent(paymentTokenId)}`);
}
