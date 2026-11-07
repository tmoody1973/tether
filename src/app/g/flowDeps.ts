import { clockFor } from "@/clock/clock";
import type { Db } from "@/db/client";
import { paypalFromEnv, type PaypalHttp } from "@/adapters/paypal/http";
import { createChannel3, type Channel3Adapter } from "@/adapters/channel3/client";
import { brokerFromEnv, filledOrder } from "@/adapters/alpaca/broker";
import { marketFromEnv } from "@/adapters/alpaca/data";
import type { ApproveDeps } from "@/flows/approve";
import { familyHoldings, type Holding } from "@/flows/holdings";

const unavailable = (what: string) => async (): Promise<never> => { throw new Error(`${what} is not configured here`); };

/** PayPal from env; when it isn't configured every call fails, and the flows treat that as "nothing happened yet". */
export function paypalOrUnavailable(): PaypalHttp {
  try {
    return paypalFromEnv();
  } catch {
    return { configured: false, request: unavailable("PayPal") };
  }
}

function channel3OrUnavailable(): Channel3Adapter {
  try {
    return createChannel3();
  } catch {
    const no = unavailable("Channel3");
    return { search: no, lookup: no, retrieve: no, websites: no, shopsSelling: no };
  }
}

/**
 * Full flow deps for guardian surfaces that settle money (approve, resume). Built per request.
 * The classifier is never consulted at settle time (gate 2 reuses the stored finding, R13), so it fails closed.
 */
export function paymentDeps(db: Db): ApproveDeps {
  return {
    db, now: clockFor(db), paypal: paypalOrUnavailable(), channel3: channel3OrUnavailable(),
    classifier: { ask: async () => ({ probability: null, model: "none", modelVersion: "none" }) },
    // ponytail: the permission-slip HMAC shares the cookie signing key; split it if keys ever rotate separately
    secret: process.env.TETHER_SIGNING_KEY ?? "",
    alpaca: () => brokerFromEnv(),
    assetName: async (symbol) => (await marketFromEnv().searchAssets(symbol)).find((a) => a.symbol === symbol)?.name ?? null,
  };
}

/** Her holdings for a page: Alpaca's fills (cached for good) and closes. Any failure ⇒ none, and her rows stay as today. */
export async function pageHoldings(db: Db, familyId: string): Promise<Holding[]> {
  try {
    return await familyHoldings({ db, order: filledOrder, market: marketFromEnv() }, familyId);
  } catch (err) {
    console.error("holdings unavailable", err instanceof Error ? err.message : err);
    return [];
  }
}
