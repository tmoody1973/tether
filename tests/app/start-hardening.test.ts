import { beforeAll, describe, expect, it, vi } from "vitest";

// M2 (a retired family's parent cookie is refused everywhere) and L1 (database failures never log personal data).
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: async () => testDb }));
let testDb: import("@/db/client").Db;
let failInsert = false;
vi.mock("@/db/repo", async (orig) => {
  const real = await orig<typeof import("@/db/repo")>();
  return {
    ...real,
    insertFamily: async (...a: Parameters<typeof real.insertFamily>) => {
      if (failInsert) throw new Error("Failed query: insert into families params: amara@example.com,S-leak,Zoe");
      return real.insertFamily(...a);
    },
  };
});
import { createDb, migrateDb } from "@/db/client";
import * as repo from "@/db/repo";
import { GUARDIAN_COOKIE, signGuardianCookie } from "@/auth/guardian";
import { START_COOKIE, sealStart } from "@/auth/start";
import { POST as ask } from "@/app/api/g/ask/route";
import { GET as connect } from "@/app/g/connect-paypal/route";
import { POST as create } from "@/app/g/start/teen/create/route";

process.env.TETHER_SIGNING_KEY = "test-key";
beforeAll(async () => { testDb = createDb("pglite:memory"); await migrateDb(testDb); });

const where = (res: Response) => { const u = new URL(res.headers.get("location")!, "http://localhost"); return `${u.pathname}${u.search}`; };

describe("M2: a retired family's still-valid parent cookie is refused", () => {
  it("by the month assistant (401) and by Save your PayPal (back to /g)", async () => {
    const f = await repo.insertFamily(testDb, { name: "F", teenToken: "hard-1", guardianName: "A", teenName: "Z", guardianToken: `${repo.ARCHIVED_PREFIX}x` });
    const cookie = `${GUARDIAN_COOKIE}=${encodeURIComponent(signGuardianCookie(f.id, new Date()))}`;
    const res = await ask(new Request("http://localhost/api/g/ask", {
      method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ question: "what did she buy?" }),
    }));
    expect(res.status).toBe(401);
    const c = await connect(new Request("http://localhost/g/connect-paypal", { headers: { cookie } }));
    expect(where(c)).toBe("/g");
  });
});
