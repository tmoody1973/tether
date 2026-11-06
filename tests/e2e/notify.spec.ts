import { expect, test } from "@playwright/test";
import { E2E } from "./fixtures";

// Stands in for OneSignal's page SDK: runs the queued init like the real one and records what the card asked of it.
// Nothing here ever reaches OneSignal, and the e2e server has no REST key, so no push can be sent.
const SDK_STUB = `
window.__os = {};
const OneSignal = {
  init: async (o) => { window.__os.init = o; },
  login: async (id) => { window.__os.login = id; },
  User: { PushSubscription: { optedIn: false, async optIn() { this.optedIn = true; window.__os.optedIn = true; } } },
};
const queued = Array.isArray(window.OneSignalDeferred) ? window.OneSignalDeferred : [];
window.OneSignalDeferred = { push: (fn) => fn(OneSignal) };
queued.forEach((fn) => fn(OneSignal));
`;

test("Amara's Home offers notifications; OneSignal loads only on her page, only when she turns them on", async ({ page, context }) => {
  const sdk: string[] = [];
  await context.route("https://cdn.onesignal.com/**", (route) => {
    sdk.push(route.request().url());
    return route.fulfill({ contentType: "application/javascript", body: SDK_STUB });
  });

  // The landing page and Zoe's pages never load it.
  await page.goto("/");
  await expect(page.locator('script[src*="onesignal"]')).toHaveCount(0);
  await page.goto(`/t/${E2E.teenToken}`);
  await expect(page.getByText("Your week")).toBeVisible();
  await expect(page.locator('script[src*="onesignal"]')).toHaveCount(0);
  expect(sdk).toEqual([]);

  // Amara's Home: the card. Headless Chromium starts with notifications denied, so it says how to allow them, and
  // OneSignal is not loaded (it is only ever loaded once the browser allows notifications or she taps the button).
  await page.goto(`/g/enter/${E2E.guardianKey}`);
  await expect(page.getByRole("heading", { name: "Get a buzz when Zoe asks." })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Notifications are blocked for this site" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn on notifications" })).toHaveCount(0);
  expect(sdk).toEqual([]);

  // A browser that hasn't asked yet (headless Chromium can't show this, so its permission is faked: "default" until the
  // tap, then "granted"): the button, nothing loaded before the tap; tapping signs this device in to the family alias.
  await context.addInitScript(() => {
    let permission: NotificationPermission = "default";
    Object.defineProperty(Notification, "permission", { get: () => permission });
    Notification.requestPermission = async () => (permission = "granted");
  });
  await page.reload();
  const button = page.getByRole("button", { name: "Turn on notifications" });
  await expect(button).toBeEnabled();
  expect(sdk).toEqual([]);
  await button.click();
  await expect(page.getByRole("status").filter({ hasText: "On for this device" })).toBeVisible();
  expect(sdk).toEqual(["https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"]);
  const os = await page.evaluate(() => (window as unknown as { __os: Record<string, unknown> }).__os);
  expect(os.init).toMatchObject({
    appId: "e2e-fake-onesignal-app", serviceWorkerPath: "push/onesignal/OneSignalSDKWorker.js", serviceWorkerParam: { scope: "/push/onesignal/" },
    notifyButton: { enable: false }, promptOptions: { slidedown: { prompts: [{ type: "push", autoPrompt: false }] } },
  });
  expect(os.login).toMatch(/^[0-9a-f]{64}$/); // the family's opaque alias, not its id
  expect(os.optedIn).toBe(true);
});

test("OneSignal's worker is served from its own folder, beside Tether's offline worker", async ({ request }) => {
  const res = await request.get("/push/onesignal/OneSignalSDKWorker.js");
  expect(res.ok()).toBe(true);
  expect((await res.text()).trim()).toBe('importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");');
  expect((await request.get("/sw.js")).ok()).toBe(true);
});
