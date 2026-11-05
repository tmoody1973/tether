import { describe, expect, it, vi } from "vitest";
import { createChannel3 } from "@/adapters/channel3/client";

const offer = (domain: string, price: number, extra: Record<string, unknown> = {}): { url: string; domain: string; price: { price: number; currency: string }; availability: string } => ({
  url: `https://aff.example/${domain}`,
  domain,
  price: { price, currency: "USD" },
  availability: "InStock",
  ...extra,
});
const prod = (id: string, offers: ReturnType<typeof offer>[]) => ({
  id,
  title: `Title ${id}`,
  category: { slug: "over-ear-headphones" },
  ratings: { average: 4.5 },
  offers,
});

/* eslint-disable @typescript-eslint/no-unused-vars -- params exist so mock.calls is typed */
function fakeSdk(over: Record<string, unknown> = {}) {
  const search = vi.fn(async (_req?: unknown) => ({ data: [prod("p1", [offer("bestbuy.com", 49.99)])] }));
  const lookup = vi.fn(async (_req?: unknown) => ({ product: prod("p1", [offer("bestbuy.com", 49.99)]) }));
  const retrieve = vi.fn(async (_req?: unknown) => prod("p1", [offer("bestbuy.com", 49.99)]));
  const wsearch = vi.fn(async (_req?: unknown) => ({
    websites: [{ id: "w1", url: "https://www.nike.com/us/en", best_commission_rate: 9 }],
  }));
  const sdk = {
    products: { search, lookup, retrieve },
    websites: { search: wsearch },
    ...over,
  };
  return { sdk, search, lookup, retrieve, wsearch };
}
/* eslint-enable @typescript-eslint/no-unused-vars */
const err = (statusCode: number) => Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });

describe("channel3 adapter", () => {
  it("search sends website_ids filter with the allowed domains", async () => {
    const f = fakeSdk();
    await createChannel3(f.sdk).search("headphones", ["bestbuy.com", "target.com"]);
    const req = f.search.mock.calls[0][0] as { filters: { website_ids: string[] }; limit: number };
    expect(req.filters.website_ids).toEqual(["bestbuy.com", "target.com"]);
    expect(req.limit).toBe(10);
  });

  it("no request options include an x-user-id header", async () => {
    const f = fakeSdk();
    const a = createChannel3(f.sdk);
    await a.search("q", ["bestbuy.com"]);
    await a.lookup("https://bestbuy.com/x", ["bestbuy.com"]);
    await a.retrieve("p1", ["bestbuy.com"]);
    await a.websites("nike");
    const all = JSON.stringify([f.search, f.lookup, f.retrieve, f.wsearch].map((m) => m.mock.calls));
    expect(all.toLowerCase()).not.toContain("x-user-id");
  });

  it("49.99 → 4999", async () => {
    const [p] = await createChannel3(fakeSdk().sdk).search("q", ["bestbuy.com"]);
    expect(p).toEqual({
      id: "p1", title: "Title p1", priceCents: 4999, domain: "bestbuy.com",
      category: "over-ear-headphones", available: true,
    });
    expect(JSON.stringify(p)).not.toContain("aff.example");
  });

  it("picks the cheapest InStock allowed offer when several shops offer it", async () => {
    const f = fakeSdk();
    f.search.mockResolvedValue({
      data: [prod("p1", [
        offer("cdw.com", 10), // not allowed
        offer("target.com", 30, { availability: "OutOfStock" }),
        offer("target.com", 45),
        offer("bestbuy.com", 40),
      ])],
    });
    const [p] = await createChannel3(f.sdk).search("q", ["bestbuy.com", "target.com"]);
    expect(p.domain).toBe("bestbuy.com");
    expect(p.priceCents).toBe(4000);
  });

  it("product with no allowed offer is dropped", async () => {
    const f = fakeSdk();
    f.search.mockResolvedValue({ data: [prod("p1", [offer("cdw.com", 10)])] });
    const a = createChannel3(f.sdk);
    expect(await a.search("q", ["bestbuy.com"])).toEqual([]);
  });

  it("non-USD offers ignored", async () => {
    const f = fakeSdk();
    f.search.mockResolvedValue({
      data: [prod("p1", [{ ...offer("bestbuy.com", 5), price: { price: 5, currency: "EUR" } }])],
    });
    expect(await createChannel3(f.sdk).search("q", ["bestbuy.com"])).toEqual([]);
  });

  it("lookup returns not_a_product on 422", async () => {
    const f = fakeSdk();
    f.lookup.mockRejectedValue(err(422));
    expect(await createChannel3(f.sdk).lookup("https://x.com/a", ["bestbuy.com"])).toEqual({ kind: "not_a_product" });
  });

  it("lookup reports shop_not_allowed with the offer domains", async () => {
    const f = fakeSdk();
    f.lookup.mockResolvedValue({ product: prod("p1", [offer("cdw.com", 10), offer("macys.com", 12)]) });
    expect(await createChannel3(f.sdk).lookup("https://cdw.com/a", ["bestbuy.com"])).toEqual({
      kind: "shop_not_allowed",
      domains: ["cdw.com", "macys.com"],
    });
  });

  it("malformed offers are skipped, not thrown or NaN", async () => {
    const f = fakeSdk();
    f.search.mockResolvedValue({
      data: [
        prod("p1", [
          { url: "u", domain: "bestbuy.com", availability: "InStock" } as never,
          { ...offer("bestbuy.com", 1), price: { price: NaN, currency: "USD" } },
          offer("bestbuy.com", 20),
        ]),
        prod("p2", [{ url: "u", domain: "bestbuy.com", availability: "InStock" } as never]),
      ],
    });
    const out = await createChannel3(f.sdk).search("q", ["bestbuy.com"]);
    expect(out.map((p) => [p.id, p.priceCents])).toEqual([["p1", 2000]]);
  });

  it("lookup rethrows unexpected errors", async () => {
    const f = fakeSdk();
    f.lookup.mockRejectedValue(new Error("boom"));
    await expect(createChannel3(f.sdk).lookup("https://x.com/a", ["bestbuy.com"])).rejects.toThrow("boom");
  });

  it("lookup sets sourceUrl", async () => {
    const url = "https://www.bestbuy.com/site/abc";
    const r = await createChannel3(fakeSdk().sdk).lookup(url, ["bestbuy.com"]);
    expect(r.kind === "ok" && r.product.sourceUrl).toBe(url);
  });

  it("retrieve returns null on 404 and passes website_ids", async () => {
    const f = fakeSdk();
    const a = createChannel3(f.sdk);
    expect((await a.retrieve("p1", ["bestbuy.com"]))?.priceCents).toBe(4999);
    expect(f.retrieve.mock.calls[0][0]).toEqual({ product_id: "p1", website_ids: ["bestbuy.com"] });
    f.retrieve.mockRejectedValue(err(404));
    expect(await a.retrieve("nope", ["bestbuy.com"])).toBeNull();
  });

  it("websites strips protocol and www", async () => {
    expect(await createChannel3(fakeSdk().sdk).websites("nike")).toEqual([{ domain: "nike.com", name: "nike.com" }]);
  });

  it("missing CHANNEL3_API_KEY throws a clear error", () => {
    const saved = process.env.CHANNEL3_API_KEY;
    delete process.env.CHANNEL3_API_KEY;
    try {
      expect(() => createChannel3()).toThrow(/CHANNEL3_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.CHANNEL3_API_KEY = saved;
    }
  });
});
