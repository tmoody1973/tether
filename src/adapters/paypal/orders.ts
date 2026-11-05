import { verifyToken, type AuthToken } from "@/engine/token";
import type { Cart } from "@/engine/types";
import type { PaypalHttp } from "./http";

export type ChargeResult =
  | { ok: true; orderId: string; captureId: string; status: "COMPLETED" | "PENDING" }
  | { ok: false; error: string };

interface Capture { id: string; status: string }
interface OrderResponse {
  id: string;
  status: string;
  purchase_units?: { payments?: { captures?: Capture[] } }[];
}

const firstCapture = (o: OrderResponse): Capture | undefined => o.purchase_units?.[0]?.payments?.captures?.[0];

/**
 * The ONLY place a PayPal order is created. Requires a valid permission slip.
 * Defence in depth: consumption (single use) is the flow's job, so it is not re-checked here.
 */
export async function chargeVaulted(
  token: AuthToken, cart: Cart, secret: string, now: Date, p: PaypalHttp,
  args: { vaultId: string; payeeEmail?: string; description: string },
): Promise<ChargeResult> {
  const v = verifyToken(token, cart, now, secret, () => false);
  if (!v.ok) return { ok: false, error: `TOKEN_${v.reason}` };

  try {
    const unit: Record<string, unknown> = {
      reference_id: token.cartHash.slice(0, 32),
      custom_id: token.tokenId,
      description: args.description,
      amount: { currency_code: "USD", value: (token.amountCents / 100).toFixed(2) },
    };
    if (args.payeeEmail) unit.payee = { email_address: args.payeeEmail };

    const created = await p.request<OrderResponse>("POST", "/v2/checkout/orders", {
      headers: { "PayPal-Request-Id": token.tokenId, Prefer: "return=representation" },
      body: { intent: "CAPTURE", purchase_units: [unit], payment_source: { paypal: { vault_id: args.vaultId } } },
    });
    let order = created.data;
    let capture = order.status === "COMPLETED" ? firstCapture(order) : undefined;

    if (!capture) {
      const cap = await p.request<OrderResponse>("POST", `/v2/checkout/orders/${encodeURIComponent(order.id)}/capture`, {
        headers: { "PayPal-Request-Id": `${token.tokenId}-capture`, Prefer: "return=representation" },
      });
      order = cap.data;
      capture = firstCapture(order);
    }
    if (!capture) return { ok: false, error: "NO_CAPTURE_IN_RESPONSE" };
    if (capture.status !== "COMPLETED" && capture.status !== "PENDING") {
      return { ok: false, error: `CAPTURE_${capture.status}` };
    }
    return { ok: true, orderId: order.id, captureId: capture.id, status: capture.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "PAYPAL_ERROR" };
  }
}
