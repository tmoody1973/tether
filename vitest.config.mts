import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { hookTimeout: 30000, testTimeout: 15000, include: ["tests/**/*.test.ts"], exclude: ["tests/e2e/**"] },
});
