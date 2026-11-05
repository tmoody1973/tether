import { beforeAll, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { jsonSchema, tool } from "ai";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { ALLOWED_PAYPAL_TOOLS, askAboutMonth, readOnlyPaypalTools } from "@/ai/monthAssistant";
import { GUARDIAN_COOKIE, signGuardianCookie, verifyGuardianCookie } from "@/auth/guardian";
import { POST } from "@/app/api/g/ask/route";

process.env.TETHER_SIGNING_KEY = "test-key";
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
type Step = { calls: { name: string; input: object }[] } | { text: string };
function scripted(steps: Step[]) {
  let i = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const s = steps[Math.min(i++, steps.length - 1)];
      if ("text" in s) return { content: [{ type: "text" as const, text: s.text }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] };
      return {
        content: s.calls.map((c, n) => ({ type: "tool-call" as const, toolCallId: `c${i}-${n}`, toolName: c.name, input: JSON.stringify(c.input) })),
        finishReason: { unified: "tool-calls" as const, raw: undefined }, usage, warnings: [],
      };
    },
  });
}
const fakeTool = (out: unknown) => tool({ description: "fake", inputSchema: jsonSchema({ type: "object", properties: {} }), execute: async () => out });

let db: Db;
let famA: string;
let famB: string;
async function seedReceipt(familyId: string, n: string, shop: string, cents: number, at: string) {
  const merchantId = `m-${n}`;
  await db.insert(t.merchants).values({ id: merchantId, name: shop, domain: `${n}.example`, class: "books", opensAtLevel: 1 });
  const grantId = `g-${n}`;
  const ver = Number(n.slice(1)) + 2;
  const body = { id: grantId, familyId, version: ver, level: 1 as const, weeklyCents: 800, commitmentFloorPct: 0, matchPct: 0, constraints: [], fundAllowlist: [], signedAt: at, expiresAt: at };
  await repo.insertGrant(db, { id: grantId, familyId, version: ver, level: 1, body, signedAt: new Date(at), expiresAt: new Date(at), status: "active" });
  const p = await repo.insertPurchase(db, {
    familyId, cartHash: `h${n}`, status: "paid",
    cart: { merchantId, items: [{ sku: "a", title: "Book", qty: 1, unitCents: cents }], totalCents: cents },
    decision: { outcome: "allow", reasons: [] } as never,
  });
  await repo.appendJournal(db, { familyId, kind: "spend", amountCents: cents, at: new Date(at), ref: p.id, note: null });
  await repo.insertReceipt(db, { purchaseId: p.id, captureId: `cap-${n}`, grantId, grantVersion: ver, cartHash: `h${n}`, decision: p.decision, approvalId: null });
}
beforeAll(async () => {
  db = createDb("pglite:memory"); await migrateDb(db);
  famA = (await repo.insertFamily(db, { name: "A", teenToken: "ta", guardianName: "Amara", teenName: "Zoe" })).id;
  famB = (await repo.insertFamily(db, { name: "B", teenToken: "tb", guardianName: "Bo", teenName: "Y" })).id;
  await seedReceipt(famA, "a1", "The Bookshop", 1250, "2026-10-05T10:00:00Z");
  await seedReceipt(famA, "a2", "The Bookshop", 800, "2026-10-20T10:00:00Z");
  await seedReceipt(famB, "b1", "Other Shop", 9900, "2026-10-06T10:00:00Z");
});

const ask = (steps: Step[], q = "How much at the bookshop in October?", paypalTools = {}) =>
  askAboutMonth({ model: scripted(steps), paypalTools, db }, famA, q);

describe("readOnlyPaypalTools", () => {
  it("exposes exactly ALLOWED_PAYPAL_TOOLS", () => {
    const tools = readOnlyPaypalTools({ clientId: "x", clientSecret: "y", sandbox: true });
    expect(Object.keys(tools).sort()).toEqual([...ALLOWED_PAYPAL_TOOLS].sort());
  });
  it("has no tool name that could move money", () => {
    const tools = readOnlyPaypalTools({ clientId: "x", clientSecret: "y", sandbox: true });
    for (const name of Object.keys(tools)) expect(name).not.toMatch(/create|capture|pay|refund|send|cancel|update|delete|accept/);
  });
});

describe("askAboutMonth", () => {
  it("answers from fixture receipts via tether_record", async () => {
    const r = await ask([{ calls: [{ name: "tether_record", input: { month: "2026-10" } }] }, { text: "You spent $20.50 at The Bookshop in October." }]);
    expect(r.answer).toContain("$20.50");
    expect(r.toolsUsed).toEqual(["tether_record"]);
  });
  it("toolsUsed only contains allowed names, de-duplicated", async () => {
    const r = await ask(
      [{ calls: [{ name: "tether_record", input: { month: "2026-10" } }, { name: "list_transactions", input: {} }] },
        { calls: [{ name: "tether_record", input: { month: "2026-10" } }] }, { text: "ok" }],
      "q", { list_transactions: fakeTool({ transaction_details: [{ id: "1" }] }) });
    expect(r.toolsUsed.sort()).toEqual(["list_transactions", "tether_record"]);
  });
  it("falls back to \"I can't see that.\" when tools return nothing", async () => {
    const r = await ask([{ calls: [{ name: "tether_record", input: { month: "2026-09" } }] }, { text: "You spent $5." }]);
    expect(r.answer).toBe("I can't see that.");
  });
  it("falls back when the model returns empty text", async () => {
    const r = await ask([{ calls: [{ name: "tether_record", input: { month: "2026-10" } }] }, { text: "  " }]);
    expect(r.answer).toBe("I can't see that.");
  });
  it("a bad month gives an empty result", async () => {
    const r = await ask([{ calls: [{ name: "tether_record", input: { month: "October" } }] }, { text: "$99" }]);
    expect(r.answer).toBe("I can't see that.");
  });
  it("a tool name outside the allowed set => \"I can't see that.\"", async () => {
    const r = await ask([{ calls: [{ name: "create_order", input: {} }] }, { text: "Done, paid." }], "pay", { create_order: fakeTool("x") });
    expect(r).toEqual({ answer: "I can't see that.", toolsUsed: [] });
  });
  it("tether_record ignores a familyId the model tries to pass", async () => {
    const execSpy = vi.spyOn(repo, "receiptsForMonth");
    const r = await ask([{ calls: [{ name: "tether_record", input: { month: "2026-10", familyId: famB } }] }, { text: "Total." }]);
    expect(execSpy).toHaveBeenCalledWith(db, famA, "2026-10");
    expect(execSpy).not.toHaveBeenCalledWith(db, famB, expect.anything());
    expect(r.answer).toBe("Total.");
    execSpy.mockRestore();
  });
});

describe("guardian cookie", () => {
  const now = new Date("2026-11-05T00:00:00Z");
  it("round-trips", () => expect(verifyGuardianCookie(signGuardianCookie("fam1", now), now)).toBe("fam1"));
  it("tampered or expired guardian cookie is rejected", () => {
    const c = signGuardianCookie("fam1", now);
    expect(verifyGuardianCookie(c.replace("fam1", "fam2"), now)).toBeNull();
    expect(verifyGuardianCookie(c.slice(0, -2) + "xx", now)).toBeNull();
    expect(verifyGuardianCookie("garbage", now)).toBeNull();
    expect(verifyGuardianCookie(c, new Date(now.getTime() + 8 * 864e5))).toBeNull();
  });
});

describe("POST /api/g/ask", () => {
  const post = (body: unknown, cookie?: string) => POST(new Request("http://x/api/g/ask", {
    method: "POST", body: JSON.stringify(body), headers: cookie ? { cookie: `${GUARDIAN_COOKIE}=${encodeURIComponent(cookie)}` } : {},
  }));
  it("route returns 401 without guardian cookie", async () => {
    expect((await post({ question: "hi" })).status).toBe(401);
  });
  it("route rejects question over 500 chars", async () => {
    expect((await post({ question: "x".repeat(501) }, signGuardianCookie("f", new Date()))).status).toBe(400);
  });
  it("route rejects an empty question", async () => {
    expect((await post({ question: " " }, signGuardianCookie("f", new Date()))).status).toBe(400);
  });
});
