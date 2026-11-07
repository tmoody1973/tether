import { Suspense, use } from "react";
import type { Holding } from "@/flows/holdings";
import type { TeenInvestment } from "@/flows/teenInvest";
import { HoldingCard } from "@/ui/InvestCards";
import { Money } from "@/ui/teen";
import { investStatusWords } from "@/ui/teenWords";

/** After the broker has been asked about queued orders: her rows as they now stand, and her holdings. */
export interface FreshInvestments { rows: TeenInvestment[]; holdings: Holding[] }

/**
 * "Your investments" never waits on Alpaca (I1): `rows` (read from the database before any broker call) render at
 * once; when `fresh` resolves, one card per fund she holds sits above the rows it doesn't cover.
 */
export function YourInvestments({ rows, fresh, guardian }: { rows: TeenInvestment[]; fresh: Promise<FreshInvestments>; guardian: string }) {
  return (
    <Suspense fallback={<div style={{ display: "grid", gap: 12 }}><Rows rows={rows} guardian={guardian} /></div>}>
      <WithCards fresh={fresh} guardian={guardian} />
    </Suspense>
  );
}

function WithCards({ fresh, guardian }: { fresh: Promise<FreshInvestments>; guardian: string }) {
  const { rows, holdings } = use(fresh);
  const inCards = new Set(holdings.flatMap((h) => h.investmentIds));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {holdings.map((h) => <HoldingCard key={h.symbol} h={h} />)}
      <Rows rows={rows.filter((r) => !inCards.has(r.id))} guardian={guardian} />
    </div>
  );
}

function Rows({ rows, guardian }: { rows: TeenInvestment[]; guardian: string }) {
  if (rows.length === 0) return null;
  return (
    <ul className="t-card t-card--tight" style={{ listStyle: "none" }}>
      {rows.map((r) => (
        <li key={r.id} className="t-row">
          <span className="t-row__who">{r.symbol}<small>{investStatusWords(r.status, guardian, r.declined)}{r.receiptNote ? ` · ${r.receiptNote}` : ""}</small></span>
          <span className="t-row__amt"><Money cents={r.amountCents} /></span>
        </li>
      ))}
    </ul>
  );
}
