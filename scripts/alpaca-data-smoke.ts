/* Live SANDBOX smoke (NOT run in CI): set -a; source .env.local; set +a; pnpm tsx scripts/alpaca-data-smoke.ts
   Prints search results and the two VTI sentences only, never keys or tokens. */
import { alpacaFromEnv } from "../src/adapters/alpaca/broker";
import { alpacaMarket, compareSentence, oneYearLine } from "../src/adapters/alpaca/data";

async function main() {
  const dataBase = `${process.env.ALPACA_DATA_BASE_URL ?? "https://data.sandbox.alpaca.markets"}`;
  const market = alpacaMarket(alpacaFromEnv(), dataBase);
  const hits = await market.searchAssets("vanguard total");
  console.log("search:", hits.slice(0, 3).map((h) => `${h.symbol} (${h.exchange})`).join(", "), `of ${hits.length}`);
  const asOf = new Date();
  console.log(oneYearLine(await market.changeOver("VTI", 1, asOf)));
  console.log(compareSentence(await market.marketCompare("VTI", asOf)));
}
main().catch((e) => {
  console.log("FAILED:", e instanceof Error ? e.message.slice(0, 300) : "unknown");
  process.exit(1);
});
