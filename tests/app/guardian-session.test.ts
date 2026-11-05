import { beforeAll, describe, expect, it, vi } from "vitest";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }) }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => undefined }));
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: async () => testDb }));
let testDb: import("@/db/client").Db;
import { createDb, migrateDb } from "@/db/client";
import * as repo from "@/db/repo";
import { signGuardianCookie } from "@/auth/guardian";
import { guardianFamilyId } from "@/auth/guardianSession";

process.env.TETHER_SIGNING_KEY = "test-key";
beforeAll(async () => { testDb = createDb("pglite:memory"); await migrateDb(testDb); });

describe("guardianFamilyId", () => {
  it("valid cookie for an existing family ⇒ its id; none or forged ⇒ null", async () => {
    const fam = await repo.insertFamily(testDb, { name: "F", teenToken: "sess-1", guardianName: "Amara", teenName: "Zoe" });
    cookieValue = signGuardianCookie(fam.id, new Date());
    expect(await guardianFamilyId()).toBe(fam.id);
    cookieValue = undefined;
    expect(await guardianFamilyId()).toBeNull();
    cookieValue = `${fam.id}.9999999999999.forged`;
    expect(await guardianFamilyId()).toBeNull();
  });

  it("a valid cookie for a family that no longer exists ⇒ signed out, not a 500", async () => {
    cookieValue = signGuardianCookie("family-that-was-deleted", new Date());
    expect(await guardianFamilyId()).toBeNull();
  });
});
