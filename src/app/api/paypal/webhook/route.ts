import { getDb } from "@/db/client";
import { paypalFromEnv, type PaypalHttp } from "@/adapters/paypal/http";
import { verifyWebhook } from "@/adapters/paypal/webhooks";
import { onCaptureCompleted } from "@/flows/purchase";

// POST handlers are never prerendered, and reading the body makes this request-time anyway.
// (No `export const dynamic`: it is a build error with cacheComponents.)
export async function POST(req: Request): Promise<Response> {
  const { PAYPAL_WEBHOOK_ID } = process.env;
  let p: PaypalHttp;
  try {
    if (!PAYPAL_WEBHOOK_ID) throw new Error("PAYPAL_WEBHOOK_ID is not set");
    p = paypalFromEnv(); // M2: the same sandbox-over-https guard as every other PayPal call
  } catch (err) {
    console.error("paypal webhook: not configured", err instanceof Error ? err.message : err);
    return new Response("webhook not configured", { status: 500 }); // fail closed: nothing is verified or applied
  }
  const body = await req.text();
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
