// OneSignal web push: one POST per notification. Fields per OneSignal's docs (server-sdk-reference, "Send by external
// ID"): target users by external_id alias, which REQUIRES target_channel; always set headings (the title).
export const ONESIGNAL_NOTIFICATIONS_URL = "https://api.onesignal.com/notifications";
export const PUSH_TIMEOUT_MS = 5_000;

export interface PushConfig { appId: string; restKey: string }
export interface Push { title: string; body: string; url: string; externalId: string }
export type PushResult = "sent" | "off" | "failed";

/** Push config from env, or null (push off) when either the public app id or the server-only REST key is missing. */
export function pushFromEnv(env: NodeJS.ProcessEnv = process.env): PushConfig | null {
  const appId = env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const restKey = env.ONESIGNAL_REST_API_KEY;
  return appId && restKey ? { appId, restKey } : null;
}

/** Sends one push. Never throws: a failure, timeout or missing config resolves, and is logged without the key. */
export async function sendPush(cfg: PushConfig | null, p: Push, fetchImpl: typeof fetch = fetch, timeoutMs = PUSH_TIMEOUT_MS): Promise<PushResult> {
  if (!cfg) return "off";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(ONESIGNAL_NOTIFICATIONS_URL, {
      method: "POST",
      headers: { Authorization: `Key ${cfg.restKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: cfg.appId,
        target_channel: "push",
        include_aliases: { external_id: [p.externalId] },
        headings: { en: p.title },
        contents: { en: p.body },
        url: p.url,
      }),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; errors?: unknown };
    // OneSignal can answer 200 with `errors` (e.g. nobody subscribed under that alias yet): not sent.
    if (!res.ok || data.errors) {
      // Error kinds only: OneSignal's invalid_aliases echoes the external ids, and an alias is a capability.
      const kinds = data.errors && typeof data.errors === "object" ? Object.keys(data.errors as object) : [];
      console.error("onesignal push not sent", res.status, kinds.join(",") || "no error detail");
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("onesignal push failed", ctrl.signal.aborted ? `timeout after ${timeoutMs} ms` : err instanceof Error ? err.message : "error");
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}
