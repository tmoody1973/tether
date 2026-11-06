import { beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { signGrant } from "@/flows/grant";
import { signGuardianCookie, GUARDIAN_COOKIE } from "@/auth/guardian";
import { DAILY_CAPS, DAILY_CAP_MESSAGE, takeDaily, type UsageKind } from "@/flows/usage";

// Fakes that count every paid call. Once a family is at its daily cap, none of them may be reached.
const calls = { agentModel: 0, runAgent: 0, search: 0, lookup: 0, askModel: 0 };
let testDb: Db;
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), getDb: async () => testDb }));
vi.mock("@/app/t/teenDeps", () => ({
  agentModel: async () => { calls.agentModel++; return {} as never; },
  teenDeps: () => ({ now: async () => new Date(), channel3: { search: async () => { calls.search++; return []; }, lookup: async () => { calls.lookup++; return { kind: "not_a_product" }; }, retrieve: async () => null, websites: async () => [] } }),
}));
vi.mock("@/ai/agent", () => ({ runAgent: async () => { calls.runAgent++; return { proposals: [], toolCalls: 0 }; } }));
vi.mock("@/ai/monthAssistant", () => ({
  askAboutMonth: async () => { calls.askModel++; return { answer: "ok", toolsUsed: [] }; },
  readOnlyPaypalTools: () => ({}), PaypalUnavailableError: class extends Error {},
}));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: () => () => ({}) }));
vi.mock("@/flows/teen", async (orig) => ({ ...(await orig<typeof import("@/flows/teen")>()), shopThrottle: async () => null, proposeCarts: async () => [] }));

import { shopAction } from "@/app/t/[token]/actions";
import { POST as ask } from "@/app/api/g/ask/route";

process.env.TETHER_SIGNING_KEY = "test-key";
process.env.ANTHROPIC_API_KEY = "k"; process.env.PAYPAL_CLIENT_ID = "i"; process.env.PAYPAL_CLIENT_SECRET = "s";
let fam: repo.Family;
beforeAll(async () => {
  testDb = createDb("pglite:memory"); await migrateDb(testDb);
  fam = await repo.insertFamily(testDb, { name: "F", teenToken: "caps-teen-token", guardianName: "Amara", teenName: "Zoe" });
  await testDb.insert(t.merchants).values({ id: "m1", name: "Target", domain: "target.com", class: "general", opensAtLevel: 1, channel3WebsiteId: "target.com" });
  await repo.saveVault(testDb, fam.id, "PT1");
  await signGrant({ db: testDb, now: async () => new Date() }, fam.id, { level: 1 });
});

const exhaust = async (kind: UsageKind) => { while (await takeDaily(testDb, fam.id, kind)); };
const usedOf = async (kind: UsageKind) => {
  let n = 0; // how many more takes succeed is not observable without consuming; read the row instead
  const rows = await testDb.select().from(t.usage);
  n = rows.find((r) => r.familyId === fam.id && r.kind === kind)?.count ?? 0;
  return n;
};
const form = (fields: Record<string, string>) => { const f = new FormData(); f.set("token", "caps-teen-token"); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
const askReq = (q: string) => new Request("http://localhost/api/g/ask", {
  method: "POST", body: JSON.stringify({ question: q }),
  headers: { "content-type": "application/json", cookie: `${GUARDIAN_COOKIE}=${encodeURIComponent(signGuardianCookie(fam.id, new Date()))}` },
});

describe("invalid or unconfigured requests do not consume the daily cap", () => {
  it("empty / over-long agent request", async () => {
    await shopAction({ cards: [] }, form({ mode: "agent", request: "" }));
    await shopAction({ cards: [] }, form({ mode: "agent", request: "x".repeat(300) }));
    await shopAction({ cards: [] }, form({ mode: "link", url: "not a url" }));
    await shopAction({ cards: [] }, form({ mode: "search", query: "" }));
    expect(await usedOf("shop_agent")).toBe(0);
    expect(await usedOf("shop_lookup")).toBe(0);
  });
  it("assistant not configured", async () => {
    const key = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    expect((await ask(askReq("hi"))).status).toBe(502);
    process.env.ANTHROPIC_API_KEY = key;
    expect(await usedOf("month_ask")).toBe(0);
  });
});

describe("at the daily cap no model or Channel3 call is made", () => {
  it("shop agent", async () => {
    await exhaust("shop_agent");
    const r = await shopAction({ cards: [] }, form({ mode: "agent", request: "shoes" }));
    expect(r.error).toBe(DAILY_CAP_MESSAGE);
    expect(calls.runAgent).toBe(0); expect(calls.search).toBe(0);
    expect(await usedOf("shop_agent")).toBe(DAILY_CAPS.shop_agent);
  });
  it("search and link share one cap", async () => {
    await exhaust("shop_lookup");
    expect((await shopAction({ cards: [] }, form({ mode: "search", query: "notebook" }))).error).toBe(DAILY_CAP_MESSAGE);
    expect((await shopAction({ cards: [] }, form({ mode: "link", url: "https://target.com/p/1" }))).error).toBe(DAILY_CAP_MESSAGE);
    expect(calls.search).toBe(0); expect(calls.lookup).toBe(0);
  });
  it("month question", async () => {
    await exhaust("month_ask");
    const res = await ask(askReq("what did Zoe buy?"));
    expect((await res.json()).answer).toBe(DAILY_CAP_MESSAGE);
    expect(calls.askModel).toBe(0);
  });
  it("under the cap the paid call does happen (the fakes are wired)", async () => {
    // a fresh family with no usage
    const f2 = await repo.insertFamily(testDb, { name: "F2", teenToken: "caps-teen-token2", guardianName: "A", teenName: "Z" });
    await repo.saveVault(testDb, f2.id, "PT2");
    await signGrant({ db: testDb, now: async () => new Date() }, f2.id, { level: 1 });
    const f = new FormData(); f.set("token", "caps-teen-token2"); f.set("mode", "search"); f.set("query", "notebook");
    await shopAction({ cards: [] }, f);
    expect(calls.search).toBe(1);
  });
});
