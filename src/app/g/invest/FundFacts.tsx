import { Suspense } from "react";
import { connection } from "next/server";
import { marketFromEnv } from "@/adapters/alpaca/data";
import { fundWords } from "@/ai/fundWords";
import { fundFacts } from "@/flows/funds";

/** Alpaca's facts for one fund in fixed template sentences (no model call per row). Streams in; never blocks the page. */
export function FundFactsLine({ symbol }: { symbol: string }) {
  return (
    <Suspense fallback={<p className="g-note">Looking up {symbol}…</p>}>
      <Facts symbol={symbol} />
    </Suspense>
  );
}

async function Facts({ symbol }: { symbol: string }) {
  await connection(); // market data is read at request time, never prerendered
  let text: string | null = null;
  try {
    const facts = await fundFacts(marketFromEnv(), symbol, new Date());
    text = facts ? await fundWords(null, facts) : null;
  } catch (err) {
    console.error("fund facts unavailable", symbol, err instanceof Error ? err.message : err);
  }
  return <p className="g-note" style={{ marginTop: 6 }}>{text ?? `Facts for ${symbol} aren't available right now.`}</p>;
}
