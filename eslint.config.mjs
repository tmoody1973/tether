import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The PayPal agent toolkit can move money; only the read-only month assistant may import it.
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/ai/monthAssistant.ts", "scripts/spikes/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["@paypal/agent-toolkit", "@paypal/agent-toolkit/*"] }],
    },
  },
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
    // Vendored, unmodified Stageshow kit (MIT): its frame-exact measuring reads refs during render and sets state in
    // layout effects on purpose, which the React Compiler rules flag. Our code that uses it is linted as usual.
    "src/ui/stageshow/kit/**",
  ]),
]);

export default eslintConfig;
