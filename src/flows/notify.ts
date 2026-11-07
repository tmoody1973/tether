import { pushAlias } from "@/auth/guardian";
import { sendPush, type PushConfig, type PushResult } from "@/adapters/onesignal/push";
import type { Quote } from "@/adapters/alpaca/data";
import type { Deps } from "@/flows/purchase";
import { requestView, type RequestView } from "@/flows/request";
import { takeDaily } from "@/flows/usage";
import { requestTitle } from "@/ui/approveWords";
import { shareWords } from "@/ui/investWords";

/** Schedules "tell Amara about this new request" to run AFTER the ask has answered. Must not block or throw. */
export type Notify = (familyId: string, approvalId: string) => void;

/** Called by each ask once its approval row exists. A notify that throws is logged; the ask carries on. */
export function tellAmara(deps: { notify?: Notify }, familyId: string, approvalId: string): void {
  try {
    deps.notify?.(familyId, approvalId);
  } catch (err) {
    console.error("could not schedule the push to Amara", err instanceof Error ? err.message : err);
  }
}

/** The share count's price may hold the push this long, before the send's own 5 s: about 7 s at worst. */
export const QUOTE_WAIT_MS = 2_000;

export interface PushOpts {
  cfg: PushConfig | null; baseUrl: string; fetchImpl?: typeof fetch; realNow?: number;
  /** The latest close for an investment's share count; without it, or slower than quoteTimeoutMs (default QUOTE_WAIT_MS), the push is today's. */
  quote?: (symbol: string) => Promise<Quote | null>; quoteTimeoutMs?: number;
}

/**
 * The scheduled job: one push about one open request, in the request page's own words, to the family's alias.
 * Off without config; skipped if the request already closed; at most DAILY_CAPS.push per family per day. Never throws.
 */
export async function pushRequest(
  deps: Pick<Deps, "db" | "now">, familyId: string, approvalId: string, o: PushOpts,
): Promise<PushResult | "closed" | "capped"> {
  if (!o.cfg) return "off";
  try {
    const v = await requestView(deps.db, familyId, approvalId, await deps.now(familyId));
    if (!v) return "closed";
    if (!(await takeDaily(deps.db, familyId, "push", o.realNow))) return "capped";
    return await sendPush(o.cfg, {
      title: "Tether", body: await bodyOf(v, o), url: `${o.baseUrl}/g/requests/${approvalId}`, externalId: pushAlias(familyId),
    }, o.fetchImpl);
  } catch (err) {
    console.error("push to Amara failed", err instanceof Error ? err.message : err);
    return "failed";
  }
}

/** The request's title; for an investment, a second line with the share count if the price arrives in time. */
async function bodyOf(v: RequestView, o: PushOpts): Promise<string> {
  const title = requestTitle(v);
  if (!v.investment || !o.quote) return title;
  const { symbol, amountCents } = v.investment;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), o.quoteTimeoutMs ?? QUOTE_WAIT_MS); });
  try {
    const q = await Promise.race([o.quote(symbol), late]);
    if (!q || !q.fractionable) return title; // whole-shares-only: the request page says so; the push stays today's
    const w = shareWords(amountCents, q.cents, true, symbol);
    return `${title}\n${w[0].toUpperCase()}${w.slice(1)}. Tap to decide.`;
  } catch (err) {
    console.error("push: no price for the share count", err instanceof Error ? err.message : err);
    return title;
  } finally {
    clearTimeout(timer);
  }
}
