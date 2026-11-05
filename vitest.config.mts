import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// ponytail: each DB test file boots its own PGlite and replays every migration; more than ~3 at once starves CPU and trips hookTimeout. Raise when the suite moves to a shared template DB.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { maxWorkers: 3, hookTimeout: 30000, testTimeout: 15000, include: ["tests/**/*.test.ts"], exclude: ["tests/e2e/**"] },
});
