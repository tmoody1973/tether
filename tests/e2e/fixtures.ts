// e2e-only fixture values: a throwaway PGlite DB under .pglite/e2e (gitignored), never a real family.
export const E2E = {
  port: 3100,
  dbUrl: "pglite:./.pglite/e2e",
  dir: ".pglite/e2e",
  guardianKey: "e2e-guardian-key-for-tests-only-0001",
  teenToken: "e2e-teen-token-for-tests-only-00001",
} as const;
