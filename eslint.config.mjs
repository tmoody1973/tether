import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/engine/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/adapters/*",
            "@/ai/*",
            "@/db/*",
            "**/adapters/**",
            "**/ai/**",
            "**/db/**",
            "@anthropic-ai/sdk",
            "ai",
            "@ai-sdk/*",
            "@paypal/agent-toolkit",
            "node:http",
            "node:https",
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    ".remember/**",
    ".superpowers/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
