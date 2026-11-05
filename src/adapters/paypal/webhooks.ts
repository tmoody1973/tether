import type { PaypalHttp } from "./http";

/** True only when PayPal itself confirms the signature. Any failure is false. */
export async function verifyWebhook(p: PaypalHttp, webhookId: string, headers: Headers, body: string): Promise<boolean> {
  let event: unknown;
  try { event = JSON.parse(body); } catch { return false; }
  try {
    const { data } = await p.request<{ verification_status?: string }>("POST", "/v1/notifications/verify-webhook-signature", {
      body: {
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: event,
      },
    });
    return data.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}
