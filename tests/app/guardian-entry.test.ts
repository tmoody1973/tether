import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: async () => testDb }));
let testDb: import("@/db/client").Db;
const vaultCalls: string[] = [];
vi.mock("@/adapters/paypal/vault", () => ({
  createSetupToken: async () => ({ id: "SETUP-1", approveUrl: "https://www.sandbox.paypal.com/agreements/approve?approval_session_id=SETUP-1" }),
  createPaymentToken: async (_p: unknown, id: string) => { vaultCalls.push(id); return { paymentTokenId: `PT-${id}` }; },
}));
import { createDb, migrateDb } from "@/db/client";
import * as repo from "@/db/repo";
import { GUARDIAN_COOKIE, signGuardianCookie, verifyGuardianCookie } from "@/auth/guardian";
import { GET as enter } from "@/app/g/enter/[key]/route";
import { GET as connect } from "@/app/g/connect-paypal/route";
import { GET as paypalReturn } from "@/app/g/connect-paypal/return/route";

process.env.TETHER_SIGNING_KEY = "test-key";
process.env.PAYPAL_CLIENT_ID = "id";
process.env.PAYPAL_CLIENT_SECRET = "secret";
let fam: repo.Family;
beforeAll(async () => {
  testDb = createDb("pglite:memory"); await migrateDb(testDb);
  fam = await repo.insertFamily(testDb, { name: "F", teenToken: "entry-teen", guardianName: "Amara", teenName: "Zoe" });
});

const params = (key: string) => ({ params: Promise.resolve({ key }) });
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));

describe("GET /g/enter/[key]", () => {
  it("valid key: sets an HttpOnly, SameSite=Lax, Path=/ guardian cookie and lands on /g", async () => {
    const res = await enter(new Request(`http://localhost/g/enter/${fam.guardianToken}`), params(fam.guardianToken));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/g");
    const c = cookieOf(res, GUARDIAN_COOKIE)!;
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\//);
    expect(c).not.toMatch(/Secure/i); // not production
    const value = decodeURIComponent(c.split(";")[0].split("=")[1]);
    expect(verifyGuardianCookie(value, new Date())).toBe(fam.id);
  });

  it("unknown key: no cookie, lands on the neutral page", async () => {
    const res = await enter(new Request("http://localhost/g/enter/wrong"), params("wrong"));
    expect(cookieOf(res, GUARDIAN_COOKIE)).toBeUndefined();
    expect(new URL(res.headers.get("location")!).pathname).toBe("/g");
  });
});

describe("connect PayPal", () => {
  const signedIn = (extra = "") => ({ cookie: `${GUARDIAN_COOKIE}=${encodeURIComponent(signGuardianCookie(fam.id, new Date()))}${extra}` });

  it("start needs the guardian cookie, then redirects to PayPal and remembers the setup token", async () => {
    const anon = await connect(new Request("http://localhost/g/connect-paypal"));
    expect(new URL(anon.headers.get("location")!).pathname).toBe("/g");
    const res = await connect(new Request("http://localhost/g/connect-paypal", { headers: signedIn() }));
    expect(res.headers.get("location")).toContain("sandbox.paypal.com");
    expect(cookieOf(res, "tether_setup")).toMatch(/HttpOnly/i);
  });

  it("return only accepts the setup token this browser started", async () => {
    const url = "http://localhost/g/connect-paypal/return?approval_token_id=SETUP-1";
    const forged = await paypalReturn(new Request(url, { headers: signedIn("; tether_setup=OTHER") }));
    expect(new URL(forged.headers.get("location")!).search).toContain("paypal=failed");
    expect(await repo.getVault(testDb, fam.id)).toBeNull();
    const ok = await paypalReturn(new Request(url, { headers: signedIn("; tether_setup=SETUP-1") }));
    expect(new URL(ok.headers.get("location")!).search).toContain("paypal=connected");
    expect((await repo.getVault(testDb, fam.id))?.paymentTokenId).toBe("PT-SETUP-1");
    expect(vaultCalls).toEqual(["SETUP-1"]);
  });
});
