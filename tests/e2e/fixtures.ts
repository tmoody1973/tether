// e2e-only fixture values: a throwaway PGlite DB under .pglite/e2e (gitignored), never a real family.
// Every test that changes state has its own family (own guardian key), so tests don't depend on order.
export const E2E = {
  port: 3100,
  fakePort: 3101, // tests/e2e/fake-paypal.ts: fake PayPal + Channel3; the dev server never calls the real ones
  dbUrl: "pglite:./.pglite/e2e",
  dir: ".pglite/e2e",
  // Amara & Zoe, read-only tests: a paid receipt, a charge PayPal has but Tether has no receipt for, an open request.
  guardianKey: "e2e-guardian-key-for-tests-only-0001",
  teenToken: "e2e-teen-token-for-tests-only-00001",
  approvalId: "e2e-approval-zoe-0001",
  // One family per state-changing test.
  grantKey: "e2e-guardian-key-for-tests-only-0003",
  approveKey: "e2e-guardian-key-for-tests-only-0004",
  approveApprovalId: "e2e-approval-approve-0001",
  levelKey: "e2e-guardian-key-for-tests-only-0005",
  revokeKey: "e2e-guardian-key-for-tests-only-0006",
  // Teen screens (Task 18a): one family per state-changing test, each with a $6 paid purchase at Target.
  teen: {
    agent: "e2e-teen-agent-0001", buy: "e2e-teen-buy-0001", ask: "e2e-teen-ask-0001",
    ended: "e2e-teen-ended-0001", reset: "e2e-teen-reset-0001", sheet: "e2e-teen-sheet-0001",
    over: "e2e-teen-over-0001", paused: "e2e-teen-paused-0001",
  },
  teenOverKey: "e2e-guardian-key-for-tests-only-0009",
  teenAskKey: "e2e-guardian-key-for-tests-only-0007",
  teenResetKey: "e2e-guardian-key-for-tests-only-0008",
  // Another family entirely (Sam & Kai).
  otherGuardianKey: "e2e-guardian-key-for-tests-only-0002",
  otherApprovalId: "e2e-approval-other-0001",
  // Ids the seed and the fake PayPal share.
  receiptCapture: "E2E-CAP-0001",
  missingCapture: "E2E-CAP-0002", // PayPal charged it; Tether has no receipt
  otherFamilyCapture: "E2E-CAP-OTHER",
  unlinkedCapture: "E2E-CAP-NOLINK",
  tokens: { receipt: "e2e-token-0001", missing: "e2e-token-0002", other: "e2e-token-other" },
} as const;
