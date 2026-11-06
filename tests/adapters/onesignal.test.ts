import { describe, expect, it, vi } from "vitest";
import { ONESIGNAL_NOTIFICATIONS_URL, pushFromEnv, sendPush, type PushConfig } from "@/adapters/onesignal/push";

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const cfg: PushConfig = { appId: "app-123", restKey: "rest-key-secret" };
const push = { title: "Tether", body: "Zoe is asking for $25.30 at Best Buy", url: "https://tether.example/g/requests/a1", externalId: "ab".repeat(32) };

function fakeFetch(res: { status?: number; body?: unknown } = {}) {
  return vi.fn<FetchFn>(async () =>
    new Response(JSON.stringify(res.body ?? { id: "n1" }), { status: res.status ?? 200, headers: { "Content-Type": "application/json" } }));
}

describe("sendPush (OneSignal create notification)", () => {
  it("POSTs one push to the family's external id with a title, a body and the request's url", async () => {
    const f = fakeFetch();
    expect(await sendPush(cfg, push, f as unknown as typeof fetch)).toBe("sent");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.onesignal.com/notifications");
    expect(url).toBe(ONESIGNAL_NOTIFICATIONS_URL);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Key rest-key-secret");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      app_id: "app-123",
      target_channel: "push",
      include_aliases: { external_id: [push.externalId] },
      headings: { en: "Tether" },
      contents: { en: "Zoe is asking for $25.30 at Best Buy" },
      url: "https://tether.example/g/requests/a1",
    });
  });

  it("no config (no REST key) ⇒ push is off: no fetch at all", async () => {
    const f = fakeFetch();
    expect(await sendPush(null, push, f as unknown as typeof fetch)).toBe("off");
    expect(f).not.toHaveBeenCalled();
  });

  it("a timeout resolves as failed, without throwing", async () => {
    const hang = vi.fn<FetchFn>((...[, init]: Parameters<FetchFn>) => new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendPush(cfg, push, hang as unknown as typeof fetch, 20)).resolves.toBe("failed");
    expect(JSON.stringify(err.mock.calls)).not.toContain("rest-key-secret");
    err.mockRestore();
  });

  it("an HTTP error, a 200 with OneSignal errors, or a network failure all resolve as failed; the key is never logged", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendPush(cfg, push, fakeFetch({ status: 400, body: { errors: ["bad"] } }) as unknown as typeof fetch)).toBe("failed");
    expect(await sendPush(cfg, push, fakeFetch({ body: { id: "", errors: ["All included players are not subscribed"] } }) as unknown as typeof fetch)).toBe("failed");
    const boom = vi.fn(async () => { throw new TypeError("fetch failed"); });
    expect(await sendPush(cfg, push, boom as unknown as typeof fetch)).toBe("failed");
    expect(err).toHaveBeenCalled();
    expect(JSON.stringify(err.mock.calls)).not.toContain("rest-key-secret");
    err.mockRestore();
  });
});

describe("pushFromEnv", () => {
  it("needs both the public app id and the server REST key; either missing ⇒ null (push off, no throw)", () => {
    expect(pushFromEnv({ NEXT_PUBLIC_ONESIGNAL_APP_ID: "app", ONESIGNAL_REST_API_KEY: "k" } as unknown as NodeJS.ProcessEnv)).toEqual({ appId: "app", restKey: "k" });
    expect(pushFromEnv({ NEXT_PUBLIC_ONESIGNAL_APP_ID: "app" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(pushFromEnv({ ONESIGNAL_REST_API_KEY: "k" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(pushFromEnv({ NEXT_PUBLIC_ONESIGNAL_APP_ID: "app", ONESIGNAL_REST_API_KEY: "" } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
});
