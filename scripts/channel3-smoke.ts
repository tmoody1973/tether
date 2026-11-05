// Run: pnpm tsx --env-file=.env.local scripts/channel3-smoke.ts
import { createChannel3 } from "../src/adapters/channel3/client";

async function main() {
  const products = await createChannel3().search("headphones", ["bestbuy.com", "target.com"]);
  for (const p of products.slice(0, 3)) {
    console.log(JSON.stringify({ id: p.id, title: p.title, priceCents: p.priceCents, domain: p.domain }));
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
