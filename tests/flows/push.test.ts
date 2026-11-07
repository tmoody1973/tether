import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@/db/client";
import * as repo from "@/db/repo";
import * as t from "@/db/schema";
import { pushAlias } from "@/auth/guardian";
import { decideApproval, requestApproval } from "@/flows/approvals";
import { pushRequest, tellAmara } from "@/flows/notify";
import { DAILY_CAPS } from "@/flows/usage";
import type { Quote } from "@/adapters/alpaca/data";

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

process.env.TETHER_SIGNING_KEY = "test-key";

let db: Db;
beforeAll(async () => { db = createDb("pglite:memory"); await migrateDb(db); });

let n = 0;
async function familyWithShopAsk(domain = "etsy.com") {
  n++;
  const fam = await repo.insertFamily(db, { name: "F", teenToken: `push-${n}`, guardianName: "Amara", teenName: "Zoe" });
  const now = async () => new Date();
  const { approvalId } = await requestApproval({ db, now }, fam.id, "shop", domain, null, "gifts");
  return { familyId: fam.id, approvalId, now };
}

const ok = () => vi.fn<FetchFn>(async () => new Response(JSON.stringify({ id: "n1" }), { status: 200 }));
const cfg = { appId: "app", restKey: "k" };
const opts = (fetchImpl: typeof fetch, realNow?: number) => ({ cfg, baseUrl: "https://tether.example", fetchImpl, realNow });

describe("pushAlias", () => {
  it("is deterministic per family, differs across families, and is never the family id", () => {
    expect(pushAlias("fam-a")).toBe(pushAlias("fam-a"));
    expect(pushAlias("fam-a")).not.toBe(pushAlias("fam-b"));
    expect(pushAlias("fam-a")).not.toContain("fam-a");
    expect(pushAlias("fam-a")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes with the server secret (it is a keyed hash, not a plain one)", () => {
    const a = pushAlias("fam-a");
    process.env.TETHER_SIGNING_KEY = "another-key";
    expect(pushAlias("fam-a")).not.toBe(a);
    process.env.TETHER_SIGNING_KEY = "test-key";
  });
});

describe("pushRequest", () => {
  it("sends the request page's own words, to the family's alias, linking to the request", async () => {
    const s = await familyWithShopAsk();
    const f = ok();
    expect(await pushRequest({ db, now: s.now }, s.familyId, s.approvalId, opts(f as unknown as typeof fetch))).toBe("sent");
    expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toMatchObject({
      include_aliases: { external_id: [pushAlias(s.familyId)] }, headings: { en: "Tether" },
      contents: { en: "Zoe suggests a new shop: etsy.com" }, url: `https://tether.example/g/requests/${s.approvalId}`,
    });
  });

  it("never carries her token, a guardian key or the family id", async () => {
    const s = await familyWithShopAsk();
    const f = ok();
    await pushRequest({ db, now: s.now }, s.familyId, s.approvalId, opts(f as unknown as typeof fetch));
    const body = String(f.mock.calls[0][1]?.body);
    const fam = await repo.getFamily(db, s.familyId);
    expect(body).not.toContain(fam!.teenToken);
    expect(body).not.toContain(fam!.guardianToken);
    expect(body).not.toContain(s.familyId);
  });

  it("push off (no config) ⇒ no fetch and nothing counted", async () => {
    const s = await familyWithShopAsk();
    const f = ok();
    expect(await pushRequest({ db, now: s.now }, s.familyId, s.approvalId, { ...opts(f as unknown as typeof fetch), cfg: null })).toBe("off");
    expect(f).not.toHaveBeenCalled();
    expect(await db.select().from(t.usage).where(and(eq(t.usage.familyId, s.familyId), eq(t.usage.kind, "push")))).toEqual([]);
  });

  it("a request already answered by the time the push runs is not sent", async () => {
    const s = await familyWithShopAsk();
    await decideApproval({ db, now: s.now }, s.approvalId, "declined", s.familyId);
    const f = ok();
    expect(await pushRequest({ db, now: s.now }, s.familyId, s.approvalId, opts(f as unknown as typeof fetch))).toBe("closed");
    expect(f).not.toHaveBeenCalled();
  });

  it(`stops at ${DAILY_CAPS.push} pushes per family per day`, async () => {
    expect(DAILY_CAPS.push).toBe(200);
    const s = await familyWithShopAsk();
    const f = ok();
    const day = Date.parse("2026-11-06T10:00:00Z");
    for (let i = 0; i < DAILY_CAPS.push; i++) expect(await pushRequest({ db, now: s.now }, s.familyId, s.approvalId, opts(f as unknown as typeof fetch, day))).toBe("sent");
    expect(await pushRequest({ db, now: s.now }, s.familyId, s.approvalId, opts(f as unknown as typeof fetch, day))).toBe("capped");
    expect(f).toHaveBeenCalledTimes(DAILY_CAPS.push);
  });

  it("a OneSignal that throws resolves as failed: the push never throws", async () => {
    const s = await familyWithShopAsk();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = vi.fn(async () => { throw new Error("down"); });
    await expect(pushRequest({ db, now: s.now }, s.familyId, s.approvalId, opts(boom as unknown as typeof fetch))).resolves.toBe("failed");
    await expect(pushRequest({ db, now: s.now }, "no-such-family", s.approvalId, opts(ok() as unknown as typeof fetch))).resolves.not.toBe("sent");
    err.mockRestore();
  });
});

describe("pushRequest: an investment says how much of a share", () => {
  async function familyWithInvestmentAsk() {
    n++;
    const fam = await repo.insertFamily(db, { name: "F", teenToken: `push-inv-${n}`, guardianName: "Amara", teenName: "Zoe" });
    const now = async () => new Date();
    const investmentId = crypto.randomUUID();
    await db.insert(t.investments).values({ id: investmentId, familyId: fam.id, symbol: "VTI", amountCents: 500, answers: {}, status: "proposed" });
    const { approvalId } = await requestApproval({ db, now }, fam.id, "investment", investmentId, null);
    return { familyId: fam.id, approvalId, now };
  }
  const priced = (q: Promise<Quote | null>) => async () => q;
  const VTI = { cents: 36186, day: new Date("2026-11-06T05:00:00Z"), fractionable: true };
  const pushed = async (s: Awaited<ReturnType<typeof familyWithInvestmentAsk>>, quote?: (symbol: string) => Promise<Quote | null>) => {
    const f = ok();
    expect(await pushRequest({ db, now: s.now }, s.familyId, s.approvalId, { ...opts(f as unknown as typeof fetch), quote, quoteTimeoutMs: 50 })).toBe("sent");
    return JSON.parse(String(f.mock.calls[0][1]?.body)).contents.en as string;
  };

  it("a price in time adds the second line", async () => {
    const s = await familyWithInvestmentAsk();
    expect(await pushed(s, priced(Promise.resolve(VTI)))).toBe("Zoe proposes investing $5.00 in VTI\nAbout 0.0138 of a share. Tap to decide.");
  });

  it("no price in time, a failed price, or a whole-shares-only asset: exactly today's push", async () => {
    const today = "Zoe proposes investing $5.00 in VTI";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await pushed(await familyWithInvestmentAsk(), () => new Promise((r) => setTimeout(() => r(VTI), 500)))).toBe(today);
    expect(await pushed(await familyWithInvestmentAsk(), () => Promise.reject(new Error("alpaca down")))).toBe(today);
    expect(await pushed(await familyWithInvestmentAsk(), priced(Promise.resolve(null)))).toBe(today);
    expect(await pushed(await familyWithInvestmentAsk(), priced(Promise.resolve({ ...VTI, fractionable: false })))).toBe(today);
    expect(await pushed(await familyWithInvestmentAsk())).toBe(today); // no price source at all
    err.mockRestore();
  });

  it("the price gets at most 2 s of its own, so the push still goes within about 7 s", async () => {
    const after = (ms: number) => () => new Promise<Quote>((r) => setTimeout(() => r(VTI), ms));
    const send = async (quote: (symbol: string) => Promise<Quote | null>) => {
      const s = await familyWithInvestmentAsk();
      const f = ok();
      await pushRequest({ db, now: s.now }, s.familyId, s.approvalId, { ...opts(f as unknown as typeof fetch), quote }); // default budget
      return JSON.parse(String(f.mock.calls[0][1]?.body)).contents.en as string;
    };
    expect(await send(after(1_900))).toContain("About 0.0138 of a share.");
    expect(await send(after(2_100))).toBe("Zoe proposes investing $5.00 in VTI");
  });

  it("a shop ask never looks up a price", async () => {
    const s = await familyWithShopAsk();
    const quote = vi.fn(async () => VTI);
    const f = ok();
    await pushRequest({ db, now: s.now }, s.familyId, s.approvalId, { ...opts(f as unknown as typeof fetch), quote });
    expect(quote).not.toHaveBeenCalled();
  });
});

describe("tellAmara", () => {
  it("schedules once; a notify that throws is logged, never thrown into the ask", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const calls: string[] = [];
    tellAmara({ notify: (_f, a) => { calls.push(a); } }, "f", "a1");
    expect(calls).toEqual(["a1"]);
    expect(() => tellAmara({ notify: () => { throw new Error("after() outside a request"); } }, "f", "a2")).not.toThrow();
    expect(err).toHaveBeenCalled();
    expect(() => tellAmara({}, "f", "a3")).not.toThrow(); // push off: no notify dep at all
    err.mockRestore();
  });
});
