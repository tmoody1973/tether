import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDb, openDb } from "@/db/client";
import * as repo from "@/db/repo";

const dir = mkdtempSync(path.join(tmpdir(), "tether-pglite-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("pglite:<dir> (local dev / e2e DB)", () => {
  it("auto-migrates on open and keeps data on disk across reopen", async () => {
    const url = `pglite:${dir}`;
    const a = await openDb(url);
    const fam = await repo.insertFamily(a, { name: "F", teenToken: "disk-1", guardianName: "Amara", teenName: "Zoe" });
    await closeDb(a);
    const b = await openDb(url);
    expect((await repo.getFamilyByTeenToken(b, "disk-1"))?.id).toBe(fam.id);
    await closeDb(b);
  }, 30_000);
});
