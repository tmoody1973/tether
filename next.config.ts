import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite loads its wasm/data files relative to its own module; bundled into a page it can't find them
  // (a guardian route handler happened to boot it first until the teen pages arrived).
  serverExternalPackages: ["@electric-sql/pglite"],
  // R39: Zoe's link is her credential; it must never leave in a Referer header (/t, /t/:token and below).
  // Money pages (/g, /t) are never cached by the browser, a CDN or the service worker.
  // Amara's side is organised around her jobs (Home, Zoe's rules, Activity); old links keep working, query and all.
  async redirects() {
    return [
      { source: "/g/grant", destination: "/g/rules", permanent: false },
      { source: "/g/record", destination: "/g/activity", permanent: false },
      { source: "/g/review", destination: "/g/activity", permanent: false },
    ];
  },
  async headers() {
    const noStore = { key: "Cache-Control", value: "no-store" };
    return [
      { source: "/t/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, noStore] },
      { source: "/g/:path*", headers: [noStore] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }, // a new worker is picked up on the next visit
      { source: "/push/onesignal/:path*", headers: [{ key: "Cache-Control", value: "no-cache" }] }, // OneSignal's push worker, likewise
    ];
  },
};

export default nextConfig;
