// e2e-only fixture values: a throwaway PGlite DB under .pglite/e2e (gitignored), never a real family.
export const E2E = {
  port: 3100,
  paypalPort: 3101, // tests/e2e/fake-paypal.ts: the dev server talks to this, never to PayPal
  dbUrl: "pglite:./.pglite/e2e",
  dir: ".pglite/e2e",
  guardianKey: "e2e-guardian-key-for-tests-only-0001",
  teenToken: "e2e-teen-token-for-tests-only-00001",
  otherGuardianKey: "e2e-guardian-key-for-tests-only-0002",
  otherTeenToken: "e2e-teen-token-for-tests-only-00002",
  // Ids the seed and the fake PayPal share.
  approvalId: "e2e-approval-zoe-0001",
  otherApprovalId: "e2e-approval-other-0001",
  receiptCapture: "E2E-CAP-0001",
  missingCapture: "E2E-CAP-0002", // PayPal charged it; Tether has no receipt
  otherFamilyCapture: "E2E-CAP-OTHER",
  unlinkedCapture: "E2E-CAP-NOLINK",
  tokens: { receipt: "e2e-token-0001", missing: "e2e-token-0002", other: "e2e-token-other" },
} as const;
