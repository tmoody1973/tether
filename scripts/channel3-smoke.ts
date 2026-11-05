// Run: pnpm tsx --env-file=.env.local scripts/channel3-smoke.ts
// Exercises all four adapter methods live. Prints no key and no affiliate URLs.
import { Channel3 } from "@channel3/sdk";
import { createChannel3 } from "../src/adapters/channel3/client";

const DOMAINS = ["bestbuy.com", "target.com"];

async function main() {
  const adapter = createChannel3();

  const found = await adapter.search("headphones", DOMAINS);
  console.log("search:", found.length, "results");
  for (const p of found.slice(0, 3)) {
    console.log(
      " ",
      JSON.stringify({
        id: p.id,
        title: p.title,
        priceCents: p.priceCents,
        domain: p.domain,
      }),
    );
  }

  if (found.length === 0) {
    console.log("no search results; skipping retrieve/lookup");
  } else {
    const refreshed = await adapter.retrieve(found[0].id, DOMAINS);
    console.log(
      "retrieve:",
      JSON.stringify(
        refreshed && {
          id: refreshed.id,
          priceCents: refreshed.priceCents,
          domain: refreshed.domain,
        },
      ),
    );

    // Raw search only to get a real product-page URL; the URL itself is never printed.
    const raw = await new Channel3({
      apiKey: process.env.CHANNEL3_API_KEY!,
    }).products.search({
      query: "headphones",
      filters: { website_ids: DOMAINS },
      limit: 5,
    });
    const pageUrl = raw.data
      .flatMap((p) => p.offers ?? [])
      .find((o) => DOMAINS.includes(o.domain))?.url;
    if (!pageUrl) {
      console.log("no offer url; skipping lookup");
    } else {
      const looked = await adapter.lookup(pageUrl, DOMAINS);
      console.log(
        "lookup (domain only):",
        new URL(pageUrl).hostname.replace(/^www\./, ""),
      );
      console.log(
        "lookup result:",
        looked.kind,
        looked.kind === "ok"
          ? JSON.stringify({
              id: looked.product.id,
              priceCents: looked.product.priceCents,
              domain: looked.product.domain,
            })
          : JSON.stringify(looked),
      );
    }
  }

  const shops = await adapter.websites("best buy");
  console.log("websites:", JSON.stringify(shops.slice(0, 3)));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
