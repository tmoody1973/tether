import { verifyToken, type AuthToken } from "@/engine/token";
import type { Cart } from "@/engine/types";
import { PaypalError, type PaypalHttp } from "./http";

/**
 * R37/R38: a failed charge is either `declined` (PayPal refused: no money moved, safe to reverse) or `unknown`
 * (timeout, network, 5xx, 409, an unexpected capture-step error, or no final answer: money MAY have moved,
 * never reverse). `orderId` is set whenever PayPal gave us one, so a resume can read the order back.
 */
export type ChargeResult =
  | { ok: true; orderId: string; captureId: string; status: "COMPLETED" | "PENDING" }
  | { ok: false; outcome: "declined" | "unknown"; error: string; orderId?: string };

export interface ChargeArgs { vaultId: string; payeeEmail?: string; description: string }

interface Capture { id: string; status: string }
interface OrderResponse {
  id: string;
  status: string;
  purchase_units?: { payments?: { captures?: Capture[] } }[];
}

const firstCapture = (o: OrderResponse): Capture | undefined => o.purchase_units?.[0]?.payments?.captures?.[0];
const DECLINED_CAPTURE = new Set(["DECLINED", "FAILED"]);
/** Create-order answers that mean PayPal refused the request outright (nothing was created or charged). */
const CREATE_REFUSED = new Set([400, 401, 403, 404, 422]);
/** Create-order 422s that mean "same request id seen before / still processing" — the original may still charge. */
const CREATE_IN_FLIGHT_ISSUES = new Set(["DUPLICATE_REQUEST_ID", "PREVIOUS_REQUEST_IN_PROGRESS"]);
/** The only capture-step issues that mean "no money moved". Anything else at capture: go and look. */
const CAPTURE_DECLINE_ISSUES = new Set(["INSTRUMENT_DECLINED", "TRANSACTION_REFUSED", "PAYER_ACTION_REQUIRED", "ORDER_NOT_APPROVED"]);

const errText = (err: unknown) => (err instanceof Error ? err.message : "PAYPAL_ERROR");
const unknown = (error: string, orderId?: string): ChargeResult => ({ ok: false, outcome: "unknown", error, ...(orderId ? { orderId } : {}) });

function fromCapture(orderId: string, c: Capture): ChargeResult {
  if (c.status === "COMPLETED" || c.status === "PENDING") return { ok: true, orderId, captureId: c.id, status: c.status };
  if (DECLINED_CAPTURE.has(c.status)) return { ok: false, outcome: "declined", error: `CAPTURE_${c.status}`, orderId };
  return unknown(`CAPTURE_${c.status}`, orderId);
}

/**
 * The ONLY place a PayPal order is created from a fresh slip. Requires a valid permission slip.
 * Defence in depth: consumption (single use) is the flow's job, so it is not re-checked here.
 */
export async function chargeVaulted(
  token: AuthToken, cart: Cart, secret: string, now: Date, p: PaypalHttp, args: ChargeArgs,
  onOrder?: (orderId: string) => Promise<void>,
): Promise<ChargeResult> {
  const v = verifyToken(token, cart, now, secret, () => false);
  if (!v.ok) return { ok: false, outcome: "declined", error: `TOKEN_${v.reason}` }; // nothing was sent
  return sendOrder(token, p, args, onOrder);
}

/**
 * Creates (or, re-sent with the same token inside PayPal's 6-hour request-id window, gets back) the order and
 * captures it. PayPal-Request-Id = token id for create, `<tokenId>-capture` for capture. `onOrder` is told the
 * order id as soon as PayPal returns one. Called by chargeVaulted and by resume (within the window only).
 */
export async function sendOrder(
  token: AuthToken, p: PaypalHttp, args: ChargeArgs, onOrder?: (orderId: string) => Promise<void>,
): Promise<ChargeResult> {
  const unit: Record<string, unknown> = {
    reference_id: token.cartHash.slice(0, 32),
    custom_id: token.tokenId,
    description: args.description,
    amount: { currency_code: "USD", value: (token.amountCents / 100).toFixed(2) },
  };
  if (args.payeeEmail) unit.payee = { email_address: args.payeeEmail };
  let order: OrderResponse;
  try {
    order = (await p.request<OrderResponse>("POST", "/v2/checkout/orders", {
      headers: { "PayPal-Request-Id": token.tokenId, Prefer: "return=representation" },
      body: { intent: "CAPTURE", purchase_units: [unit], payment_source: { paypal: { vault_id: args.vaultId } } },
    })).data;
  } catch (err) {
    // A repeat of this request id may still be running at PayPal (or already done): that is not a refusal.
    const inFlight = err instanceof PaypalError && CREATE_IN_FLIGHT_ISSUES.has(err.issue ?? "");
    if (err instanceof PaypalError && CREATE_REFUSED.has(err.status) && !inFlight) return { ok: false, outcome: "declined", error: err.message };
    return unknown(errText(err));
  }
  await onOrder?.(order.id).catch(() => { /* resume still has the request id inside the window */ });
  const capture = order.status === "COMPLETED" ? firstCapture(order) : undefined;
  return capture ? fromCapture(order.id, capture) : captureOrder(token, p, order.id);
}

/** Captures an approved order. Only a known decline issue counts as declined; anything else, read the order. */
async function captureOrder(token: AuthToken, p: PaypalHttp, orderId: string): Promise<ChargeResult> {
  try {
    const { data } = await p.request<OrderResponse>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      headers: { "PayPal-Request-Id": `${token.tokenId}-capture`, Prefer: "return=representation" },
    });
    const capture = firstCapture(data);
    return capture ? fromCapture(orderId, capture) : unknown("NO_CAPTURE_IN_RESPONSE", orderId);
  } catch (err) {
    if (err instanceof PaypalError && err.issue && CAPTURE_DECLINE_ISSUES.has(err.issue)) {
      return { ok: false, outcome: "declined", error: err.message, orderId };
    }
    // ORDER_ALREADY_CAPTURED, DUPLICATE_REQUEST_ID, 409, other 4xx, 5xx, timeout: the order says what happened.
    const looked = await readOrder(p, orderId);
    return looked.ok || looked.outcome === "declined" ? looked : unknown(errText(err), orderId);
  }
}

/** Read-only: what PayPal says about this order now. Never creates or captures anything. */
async function readOrder(p: PaypalHttp, orderId: string): Promise<ChargeResult & { orderStatus?: string }> {
  try {
    const { data } = await p.request<OrderResponse>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    const capture = firstCapture(data);
    if (capture) return fromCapture(orderId, capture);
    if (data.status === "VOIDED") return { ok: false, outcome: "declined", error: "ORDER_VOIDED", orderId };
    return { ...unknown("ORDER_NOT_CAPTURED", orderId), orderStatus: data.status };
  } catch (err) {
    return unknown(errText(err), orderId);
  }
}

/**
 * R38 resume with a stored order id: GET the order (read-only). If it was approved but never captured,
 * capture it with the same capture request id, but only while that id is still inside PayPal's window.
 */
export async function resumeOrder(token: AuthToken, p: PaypalHttp, orderId: string, mayCapture: boolean): Promise<ChargeResult> {
  const r = await readOrder(p, orderId);
  if (!r.ok && r.outcome === "unknown" && mayCapture && (r.orderStatus === "APPROVED" || r.orderStatus === "CREATED")) {
    return captureOrder(token, p, orderId);
  }
  return r.ok ? r : { ok: false, outcome: r.outcome, error: r.error, ...(r.orderId ? { orderId: r.orderId } : {}) };
}
