// Decision 030: the adapter carries the chosen offer's condition and the product's photo, never an offer URL.
import { describe, expect, it, vi } from "vitest";
import { createChannel3, type Channel3Like } from "@/adapters/channel3/client";

const sdkWith = (raw: Record<string, unknown>) => ({
  products: { search: vi.fn(async () => ({ data: [raw] })), lookup: vi.fn(), retrieve: vi.fn(async () => raw) },
  websites: { search: vi.fn() },
}) as unknown as Channel3Like;
const offer = (price: number, condition?: string | null) =>
  ({ url: "https://aff.example/x", domain: "target.com", price: { price, currency: "USD" }, availability: "InStock", condition });

describe("channel3 photo and condition (030)", () => {
  it("cheapest in-stock offer's condition; the main photo, cleaned when available", async () => {
    const [p] = await createChannel3(sdkWith({
      id: "p", title: "Lamp", offers: [offer(20, "new"), offer(12, "used")],
      images: [{ url: "https://shop.example/a.jpg" }, { url: "https://shop.example/main.jpg", cleaned_url: "https://cdn.trychannel3.com/main.png", is_main_image: true }],
    })).search("q", ["target.com"]);
    expect(p).toMatchObject({ priceCents: 1200, condition: "used", imageUrl: "https://cdn.trychannel3.com/main.png" });
    expect(JSON.stringify(p)).not.toContain("aff.example");
  });

  it("no stated condition reads 'unknown'; only https photos get through; none is fine", async () => {
    const a = createChannel3(sdkWith({ id: "p", title: "Lamp", offers: [offer(9, null)], images: [{ url: "http://shop.example/a.jpg" }] }));
    expect(await a.retrieve("p", ["target.com"])).toEqual({ id: "p", title: "Lamp", priceCents: 900, domain: "target.com", available: true, condition: "unknown" });
    const b = createChannel3(sdkWith({ id: "p", title: "Lamp", offers: [offer(9, "new")], images: [{ url: "javascript:alert(1)" }] }));
    expect((await b.retrieve("p", ["target.com"]))!.imageUrl).toBeUndefined();
  });
});
