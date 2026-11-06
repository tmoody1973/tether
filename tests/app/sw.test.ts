import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const { route, PRECACHE } = createRequire(import.meta.url)("../../public/sw.js") as {
  route: (method: string, mode: string, url: string, origin: string) => "network" | "navigate" | "precache";
  PRECACHE: string[];
};
const O = "https://tether.example";

describe("service worker routing (money screens are never cached)", () => {
  it("never touches /api, /g, /t data or _next: straight to the network", () => {
    for (const p of ["/api/g/ask", "/api/paypal/webhook", "/g", "/g/record", "/t/abc123", "/t/abc123/shop", "/_next/static/x.js", "/manifest.webmanifest"]) {
      expect(route("GET", "cors", O + p, O)).toBe("network");
    }
  });
  it("never touches POST (server actions) or other origins", () => {
    expect(route("POST", "same-origin", O + "/t/abc123", O)).toBe("network");
    expect(route("POST", "navigate", O + "/g", O)).toBe("network");
    expect(route("GET", "cors", "https://cdn.example/brand/icon-192.png", O)).toBe("network");
  });
  it("a tapped push opens the request fresh, never from a cache", () => {
    expect(route("GET", "navigate", O + "/g/requests/abc", O)).toBe("navigate");
  });
  it("hosts OneSignal's push handling itself, so a tapped push can steer the app's own window", () => {
    // A worker can only navigate windows it controls; this one controls every page (scope "/").
    const src = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
    expect(src).toContain('importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js")');
  });
  it("navigations are network-first (offline page only on failure), including money pages", () => {
    expect(route("GET", "navigate", O + "/g", O)).toBe("navigate");
    expect(route("GET", "navigate", O + "/t/abc123", O)).toBe("navigate");
  });
  it("only the static shell files are precached, and none is a money path", () => {
    expect(route("GET", "no-cors", O + "/offline.html", O)).toBe("precache");
    expect(route("GET", "no-cors", O + "/brand/icon-192.png", O)).toBe("precache");
    for (const p of PRECACHE) expect(p).not.toMatch(/^\/(g|t|api)(\/|$)/);
  });
});

describe("next.config headers", () => {
  it("sends Cache-Control: no-store for /g and /t", async () => {
    const { default: config } = await import("../../next.config");
    const rules = await config.headers!();
    for (const source of ["/g/:path*", "/t/:path*"]) {
      const rule = rules.find((r) => r.source === source);
      expect(rule?.headers).toContainEqual({ key: "Cache-Control", value: "no-store" });
    }
  });
});
