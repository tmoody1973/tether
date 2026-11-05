import { Channel3 } from "@channel3/sdk";
import type { Cents } from "@/engine/types";

export interface Product {
  id: string;
  title: string;
  priceCents: Cents;
  domain: string;
  category?: string;
  available: boolean;
  /** Only set by lookup: the URL the teen pasted. Offer URLs are affiliate-tracked and never exposed. */
  sourceUrl?: string;
}

export interface Channel3Adapter {
  search(query: string, allowedDomains: string[], limit?: number): Promise<Product[]>;
  lookup(url: string, allowedDomains: string[]): Promise<LookupResult>;
  /** Free endpoint; used for the settle-time price re-check. */
  retrieve(productId: string, allowedDomains: string[]): Promise<Product | null>;
  websites(query: string): Promise<{ domain: string; name: string }[]>;
}

interface RawOffer {
  domain: string;
  price?: { price: number; currency: string } | null;
  availability?: string;
}
interface RawProduct {
  id: string;
  title: string;
  category?: { slug: string } | null;
  offers?: RawOffer[];
}

/** The slice of the @channel3/sdk client that we call; the real client must satisfy it (checked at compile time below). */
export interface Channel3Like {
  products: {
    search(req: { query: string; filters: { website_ids: string[] }; limit: number }): Promise<{ data: RawProduct[] }>;
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
// 422 not a product page, 404 gone, 500 extraction failed, 504 timeout (per Channel3 lookup docs).
const LOOKUP_MISS = new Set([404, 422, 500, 504]);

function statusOf(e: unknown): number | undefined {
  const s = (e as { statusCode?: unknown; status?: unknown } | null);
  const n = s?.statusCode ?? s?.status;
  return typeof n === "number" ? n : undefined;
}

/** Cheapest in-stock USD offer from an allowed shop, or null. Offer URLs are deliberately dropped. */
function toProduct(raw: RawProduct, allowed: string[]): Product | null {
  const best = (raw.offers ?? [])
    .flatMap((o) =>
      o.price && Number.isFinite(o.price.price) && o.price.currency === "USD" &&
      allowed.includes(o.domain) && o.availability === "InStock"
        ? [{ domain: o.domain, price: o.price.price }]
        : [],
    )
    .sort((a, b) => a.price - b.price)[0];
  if (!best) return null;
  return {
    id: raw.id,
    title: raw.title,
    priceCents: Math.round(best.price * 100),
    domain: best.domain,
    ...(raw.category?.slug ? { category: raw.category.slug } : {}),
    available: true, // ponytail: only InStock offers are kept, so always true
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
    const real: Channel3Like = new Channel3({ apiKey }); // no cast: compile-time check against the real SDK
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
  };
}
