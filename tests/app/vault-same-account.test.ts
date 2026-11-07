import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: async () => testDb }));
let testDb: import("@/db/client").Db;
// What PayPal's payment-token reply says about the wallet that was just approved.
let payer: { payerId?: string; email?: string } = {};
const deleted: string[] = [];
vi.mock("@/adapters/paypal/vault", async (orig) => ({
  ...(await orig<typeof import("@/adapters/paypal/vault")>()),
  createSetupToken: async () => ({ id: "SETUP-1", approveUrl: "https://www.sandbox.paypal.com/agreements/approve?x=1" }),
  createPaymentToken: async (_p: unknown, id: string) => ({ paymentTokenId: `PT-${id}`, ...payer }),
  deletePaymentToken: async (_p: unknown, id: string) => { deleted.push(id); },
}));
import { eq } from "drizzle-orm";
import { createDb, migrateDb } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { GUARDIAN_COOKIE, signGuardianCookie } from "@/auth/guardian";
import { GET as paypalReturn } from "@/app/g/connect-paypal/return/route";

process.env.TETHER_SIGNING_KEY = "test-key";
process.env.PAYPAL_CLIENT_ID = "id";
process.env.PAYPAL_CLIENT_SECRET = "secret";
beforeAll(async () => { testDb = createDb("pglite:memory"); await migrateDb(testDb); });

let n = 0;
async function family(identity: Partial<repo.Family>) {
  const f = await repo.insertFamily(testDb, { name: "F", teenToken: `vault-${++n}`, guardianName: "Amara", teenName: "Zoe" });
  if (Object.keys(identity).length) await testDb.update(t.families).set(identity).where(eq(t.families.id, f.id));
  return f;
}
const back = (familyId: string, setupId: string) => paypalReturn(new Request(`http://localhost/g/connect-paypal/return?approval_token_id=${setupId}`, {
  headers: { cookie: `${GUARDIAN_COOKIE}=${encodeURIComponent(signGuardianCookie(familyId, new Date()))}; tether_setup=${setupId}` },
}));
const outcome = (res: Response) => new URL(res.headers.get("location")!).searchParams.get("paypal");

describe("Save your PayPal: the same account she logged in with", () => {
  it("same payer id ⇒ saved", async () => {
    const f = await family({ paypalSub: "S1", paypalPayerId: "P1", paypalEmail: "a@x.co" });
    payer = { payerId: "P1", email: "a@x.co" };
    expect(outcome(await back(f.id, "S-1"))).toBe("connected");
    expect((await repo.getVault(testDb, f.id))?.paymentTokenId).toBe("PT-S-1");
  });

  it("a different PayPal account ⇒ not saved, the stray token deleted at PayPal, a calm message", async () => {
    const f = await family({ paypalSub: "S2", paypalPayerId: "P2", paypalEmail: "amara@x.co" });
    payer = { payerId: "OTHER", email: "someone@else.co" };
    expect(outcome(await back(f.id, "S-2"))).toBe("different");
    expect(await repo.getVault(testDb, f.id)).toBeNull();
    expect(deleted).toContain("PT-S-2");
  });

  it("the email matches (any case) though the payer ids differ ⇒ saved: PayPal doesn't promise the two ids are the same kind", async () => {
    const f = await family({ paypalSub: "S3", paypalPayerId: "IDENTITY-ID", paypalEmail: "Amara@X.co" });
    payer = { payerId: "VAULT-ID", email: "amara@x.co" };
    expect(outcome(await back(f.id, "S-3"))).toBe("connected");
  });

  it("PayPal's reply has no payer fields ⇒ saved, and that is logged (without ids or emails)", async () => {
    const f = await family({ paypalSub: "S4", paypalPayerId: "P4", paypalEmail: "p4@x.co" });
    payer = {};
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(outcome(await back(f.id, "S-4"))).toBe("connected");
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/P4|p4@x\.co|PT-S-4/);
    log.mockRestore();
  });

  it("families without a PayPal login (the demo, seeded ones) save as before", async () => {
    const f = await family({});
    payer = { payerId: "ANY", email: "any@x.co" };
    expect(outcome(await back(f.id, "S-5"))).toBe("connected");
  });

  it("a retired family's still-valid cookie can't save a wallet", async () => {
    const f = await family({ guardianToken: `${repo.ARCHIVED_PREFIX}gone` });
    payer = {};
    const res = await back(f.id, "S-6");
    expect(new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search).toBe("/g"); // signed out (M2)
    expect(await repo.getVault(testDb, f.id)).toBeNull();
  });
});
