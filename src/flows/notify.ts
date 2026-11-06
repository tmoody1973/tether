import { pushAlias } from "@/auth/guardian";
import { sendPush, type PushConfig, type PushResult } from "@/adapters/onesignal/push";
import type { Deps } from "@/flows/purchase";
import { requestView } from "@/flows/request";
import { takeDaily } from "@/flows/usage";
import { requestTitle } from "@/ui/approveWords";

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

export interface PushOpts { cfg: PushConfig | null; baseUrl: string; fetchImpl?: typeof fetch; realNow?: number }

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
      title: "Tether", body: requestTitle(v), url: `${o.baseUrl}/g/requests/${approvalId}`, externalId: pushAlias(familyId),
    }, o.fetchImpl);
  } catch (err) {
    console.error("push to Amara failed", err instanceof Error ? err.message : err);
    return "failed";
  }
}
