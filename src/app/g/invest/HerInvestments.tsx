import { Suspense, use } from "react";
import type * as t from "@/db/schema";
import type { Holding } from "@/flows/holdings";
import { HerHoldingCard } from "@/ui/InvestCards";
import { INVEST_STATUS } from "@/ui/investWords";
import { Money } from "@/ui/guardian";

type Investment = typeof t.investments.$inferSelect;

/**
 * "Zoe's investments" never waits on Alpaca (I1): today's rows (database only) render at once, and one card per fund
 * she holds replaces the rows it covers when `holdings` resolves.
 */
export function HerInvestments({ investments, holdings, zoe }: { investments: Investment[]; holdings: Promise<Holding[]>; zoe: string }) {
  return (
    <Suspense fallback={<Rows rows={investments} zoe={zoe} />}>
      <WithCards investments={investments} holdings={holdings} zoe={zoe} />
    </Suspense>
  );
}

function WithCards({ investments, holdings, zoe }: { investments: Investment[]; holdings: Promise<Holding[]>; zoe: string }) {
  const held = use(holdings);
  const inCards = new Set(held.flatMap((h) => h.investmentIds));
  return (
    <>
      {held.map((h) => <HerHoldingCard key={h.symbol} h={h} />)}
      <Rows rows={investments.filter((i) => !inCards.has(i.id))} zoe={zoe} />
    </>
  );
}

function Rows({ rows, zoe }: { rows: Investment[]; zoe: string }) {
  if (rows.length === 0) return null;
  return (
    <ul className="g-needs">
      {rows.map((i) => (
        <li key={i.id} style={{ padding: "10px 2px" }}>
          <b><Money cents={i.amountCents} /> in {i.symbol}</b>
          <small style={{ display: "block", color: "var(--ink-2)" }}>{i.status === "expired" ? `Asked too long ago — ${zoe} can ask again.` : INVEST_STATUS[i.status]}</small>
          {i.receiptNote && <small style={{ display: "block", color: "var(--ink-3-text)" }}>{i.receiptNote}</small>}
        </li>
      ))}
    </ul>
  );
}
