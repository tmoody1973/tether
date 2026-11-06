import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite loads its wasm/data files relative to its own module; bundled into a page it can't find them
  // (a guardian route handler happened to boot it first until the teen pages arrived).
  serverExternalPackages: ["@electric-sql/pglite"],
  // R39: Zoe's link is her credential; it must never leave in a Referer header (/t, /t/:token and below).
  async headers() {
    return [{ source: "/t/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
  },
};

export default nextConfig;
