import { Channel3, type Channel3Api } from "@channel3/sdk";
import { isE2eLocal } from "@/adapters/paypal/http";
import type { Cents, ItemCondition } from "@/engine/types";

export interface Product {
  id: string;
  title: string;
  priceCents: Cents;
  domain: string;
  category?: string;
  available: boolean;
  /** Only set by lookup: the URL the teen pasted. Offer URLs are affiliate-tracked and never exposed. */
  sourceUrl?: string;
  /** Decision 030: the chosen offer's condition ("unknown" when Channel3 doesn't say). Always set by this adapter. */
  condition?: ItemCondition;
  /** Decision 030: the product's main photo (Channel3's cleaned image when there is one), https only. Never an offer URL. */
  imageUrl?: string;
}

export interface Channel3Adapter {
  search(query: string, allowedDomains: string[], limit?: number): Promise<Product[]>;
  lookup(url: string, allowedDomains: string[]): Promise<LookupResult>;
  /** Free endpoint; used for the settle-time price re-check. */
  retrieve(productId: string, allowedDomains: string[]): Promise<Product | null>;
  websites(query: string): Promise<{ domain: string; name: string }[]>;
  /** Shops that sell what `query` means: product search across every shop, products counted per shop, most first. */
  shopsSelling(query: string, limit?: number): Promise<{ domain: string; products: number }[]>;
}

// The SDK's own field types (decision 030: don't guess field names). Condition is "new" | "used" | null in SDK 4.8;
// "refurbished" is deprecated there and arrives as null, so Tether can only say "Used" or "Condition not stated".
interface RawOffer {
  domain: string;
  price?: { price: number; currency: string } | null;
  availability?: string;
  condition?: Channel3Api.ProductOffer["condition"];
}
interface RawProduct {
  id: string;
  title: string;
  category?: { slug: string } | null;
  offers?: RawOffer[];
  images?: Pick<Channel3Api.ProductImage, "url" | "cleaned_url" | "is_main_image">[];
}

/** The slice of the @channel3/sdk client that we call; the real client must satisfy it (checked at compile time below). */
export interface Channel3Like {
  products: {
    search(req: { query: string; filters?: { website_ids: string[] }; limit: number }): Promise<{ data: RawProduct[] }>;
    lookup(req: { url: string }): Promise<{ product: RawProduct }>;
    retrieve(req: { product_id: string; website_ids: string[] }): Promise<RawProduct>;
  };
  websites: {
    search(req: { query: string }): Promise<{ websites: { url: string; name?: string | null }[] }>;
  };
}

export type LookupResult =
  | { kind: "ok"; product: Product }
  | { kind: "not_a_product" }
  | { kind: "unavailable" }
  | { kind: "shop_not_allowed"; domains: string[] };

const DEFAULT_LIMIT = 10;
const SELLING_LIMIT = 30; // 30 products gave a useful spread of shops in real calls (1–10 s)
// 422 not a product page, 404 gone, 500 extraction failed, 504 timeout (per Channel3 lookup docs).
const LOOKUP_MISS = new Set([404, 422, 500, 504]);

function statusOf(e: unknown): number | undefined {
  const s = (e as { statusCode?: unknown; status?: unknown } | null);
  const n = s?.statusCode ?? s?.status;
  return typeof n === "number" ? n : undefined;
}

/** https only: an image URL is shown in Zoe's and Amara's browsers, so nothing else (no data:, no http:) gets through. */
const httpsUrl = (u: string | null | undefined): string | undefined => {
  if (!u || u.length > 2000) return undefined;
  try { return new URL(u).protocol === "https:" ? u : undefined; } catch { return undefined; }
};

/** The main photo, else the first; Channel3's cleaned (square, background-removed) version when it has one. */
function photoOf(raw: RawProduct): string | undefined {
  const img = raw.images?.find((i) => i.is_main_image) ?? raw.images?.[0];
  return httpsUrl(img?.cleaned_url) ?? httpsUrl(img?.url);
}

/** Cheapest in-stock USD offer from an allowed shop, or null. Offer URLs are deliberately dropped. */
function toProduct(raw: RawProduct, allowed: string[]): Product | null {
  const best = (raw.offers ?? [])
    .flatMap((o) =>
      o.price && Number.isFinite(o.price.price) && o.price.currency === "USD" &&
      allowed.includes(o.domain) && o.availability === "InStock"
        ? [{ domain: o.domain, price: o.price.price, condition: o.condition }]
        : [],
    )
    .sort((a, b) => a.price - b.price)[0];
  if (!best) return null;
  const imageUrl = photoOf(raw);
  return {
    id: raw.id,
    title: raw.title,
    priceCents: Math.round(best.price * 100),
    domain: best.domain,
    ...(raw.category?.slug ? { category: raw.category.slug } : {}),
    available: true, // ponytail: only InStock offers are kept, so always true
    condition: best.condition === "new" || best.condition === "used" ? best.condition : "unknown",
    ...(imageUrl ? { imageUrl } : {}),
  };
}

function bareDomain(url: string): string {
  return url.replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0];
}

export function createChannel3(sdk?: Channel3Like): Channel3Adapter {
  let client = sdk;
  if (!client) {
    const apiKey = process.env.CHANNEL3_API_KEY;
    if (!apiKey) throw new Error("CHANNEL3_API_KEY is not set; add it to .env.local");
    // e2e only: the local fake Channel3 (same TETHER_E2E gate as PayPal's); otherwise the SDK's own default.
    const fake = process.env.CHANNEL3_BASE_URL;
    const baseUrl = fake && isE2eLocal(new URL(fake)) ? fake : undefined;
    const real: Channel3Like = new Channel3({ apiKey, ...(baseUrl ? { baseUrl } : {}) }); // no cast: compile-time check against the real SDK
    client = real;
  }
  const c = client;

  return {
    async search(query, allowedDomains, limit = DEFAULT_LIMIT) {
      const page = await c.products.search({ query, filters: { website_ids: allowedDomains }, limit });
      return page.data.flatMap((r) => toProduct(r, allowedDomains) ?? []);
    },

    async lookup(url, allowedDomains): Promise<LookupResult> {
      try {
        const { product } = await c.products.lookup({ url });
        const p = toProduct(product, allowedDomains);
        if (p) return { kind: "ok", product: { ...p, sourceUrl: url } };
        const domains = [...new Set((product.offers ?? []).map((o) => o.domain))];
        // An allowed shop sells it but no offer qualifies (out of stock / non-USD / bad price).
        if (domains.some((d) => allowedDomains.includes(d))) return { kind: "unavailable" };
        return { kind: "shop_not_allowed", domains };
      } catch (e) {
        const s = statusOf(e);
        if (s !== undefined && LOOKUP_MISS.has(s)) return { kind: "not_a_product" };
        throw e;
      }
    },

    async retrieve(productId, allowedDomains) {
      try {
        return toProduct(await c.products.retrieve({ product_id: productId, website_ids: allowedDomains }), allowedDomains);
      } catch (e) {
        if (statusOf(e) === 404) return null;
        throw e;
      }
    },

    async websites(query) {
      const { websites } = await c.websites.search({ query });
      return websites.map((w) => {
        const domain = bareDomain(w.url);
        return { domain, name: w.name || domain };
      });
    },

    async shopsSelling(query, limit = SELLING_LIMIT) {
      const page = await c.products.search({ query, limit }); // no website filter: every shop Channel3 indexes
      const counts = new Map<string, number>();
      for (const r of page.data) {
        for (const d of new Set((r.offers ?? []).map((o) => bareDomain(o.domain)))) counts.set(d, (counts.get(d) ?? 0) + 1);
      }
      return [...counts].map(([domain, products]) => ({ domain, products })).sort((a, b) => b.products - a.products);
    },
  };
}
