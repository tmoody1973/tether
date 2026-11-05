import { getDb } from "@/db/client";
import { paypalHttp } from "@/adapters/paypal/http";
import { verifyWebhook } from "@/adapters/paypal/webhooks";
import { onCaptureCompleted } from "@/flows/purchase";

const SANDBOX = "https://api-m.sandbox.paypal.com";

// POST handlers are never prerendered, and reading the body makes this request-time anyway.
// (No `export const dynamic`: it is a build error with cacheComponents.)
export async function POST(req: Request): Promise<Response> {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_BASE_URL } = process.env;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !PAYPAL_WEBHOOK_ID) {
    return new Response("webhook not configured", { status: 500 });
  }
  const body = await req.text();
  const p = paypalHttp({ baseUrl: PAYPAL_BASE_URL ?? SANDBOX, clientId: PAYPAL_CLIENT_ID, secret: PAYPAL_CLIENT_SECRET });
  if (!(await verifyWebhook(p, PAYPAL_WEBHOOK_ID, req.headers, body))) {
    return new Response("invalid signature", { status: 400 });
  }
  const event = JSON.parse(body) as { event_type?: string; resource?: { id?: unknown; custom_id?: unknown } };
  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED" && typeof event.resource?.id === "string") {
    const customId = typeof event.resource.custom_id === "string" ? event.resource.custom_id : undefined;
    await onCaptureCompleted({ db: await getDb() }, event.resource.id, customId);
  }
  return new Response(null, { status: 200 });
}
