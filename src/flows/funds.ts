import type { AlpacaMarket } from "@/adapters/alpaca/data";
import type { FundFacts } from "@/ai/fundWords";

/** Alpaca's facts for one fund on Amara's list; price lines are left out (not guessed) when history is missing. */
export async function fundFacts(market: AlpacaMarket, symbol: string, asOf: Date): Promise<FundFacts | null> {
  const hit = (await market.searchAssets(symbol)).find((a) => a.symbol === symbol);
  if (!hit) return null;
  const [one, cmp] = await Promise.allSettled([market.changeOver(symbol, 1, asOf), market.marketCompare(symbol, asOf)]);
  return {
    ...hit,
    ...(one.status === "fulfilled" ? { oneYear: one.value } : {}),
    ...(cmp.status === "fulfilled" ? { compare: cmp.value } : {}),
  };
}
