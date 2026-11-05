/* Live SANDBOX smoke (NOT run in CI): set -a; source .env.local; set +a; pnpm tsx scripts/alpaca-smoke.ts
   Creates an account, deposits $25, places a $5 VTI notional order. Prints ids/statuses only, never keys or tokens. */
import { alpacaFromEnv, type GuardianKyc, type MinorIdentity } from "../src/adapters/alpaca/broker";

const alpaca = alpacaFromEnv();
const guardian: GuardianKyc = {
  givenName: "Pat", familyName: "Parent", email: `tether-smoke-${Date.now()}@example.com`, phone: "555-676-7788",
  dateOfBirth: "1980-01-01", taxId: "661-55-4321", street: "20 N San Mateo Dr", city: "San Mateo", state: "CA", postalCode: "94401",
};
const minor: MinorIdentity = { givenName: "Tess", familyName: "Teen", email: "tess@example.com", dateOfBirth: "2010-01-01", taxId: "666-54-4321", state: "CA" };
const show = (id: string) => `${id.slice(0, 8)}…`;
async function main() {
  // Sandbox ACH takes a few minutes to complete and a new account about a minute to go ACTIVE, so a same-run order
  // is expected to fail. Re-run with an existing account id (arg 1) to skip create + deposit and place the order.
  let accountId = process.argv[2];
  if (!accountId) {
    const a = await alpaca.createCustodialAccount(guardian, minor);
    accountId = a.accountId;
    console.log("account", show(accountId), "custodial:", a.custodial);
    const d = await alpaca.deposit(accountId, 2500);
    console.log("deposit route:", process.env.ALPACA_FIRM_ACCOUNT_ID ? "journal" : "ach", "transfer", show(d.transferId));
  }
  const o = await alpaca.placeNotionalOrder(accountId, "VTI", 500);
  console.log("order", show(o.orderId), "status", o.status, "->", (await alpaca.getOrder(accountId, o.orderId)).status);
}
main().catch((e) => {
  console.log("FAILED:", e instanceof Error ? e.message.slice(0, 300) : "unknown");
  process.exit(1);
});
