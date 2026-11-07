// Investing cards for Zoe's fund page, Amara's request page and both investment lists (decision 020, D16's rules):
// facts only, every number computed by code, no daily moves, never red or green.
import type { FundInside } from "@/adapters/financialdatasets/client";
import type { Close } from "@/adapters/alpaca/data";
import { formatCents } from "@/ui/grantWords";
import { closeWords } from "@/ui/investWords";

const pct1 = (p: number) => `${p.toFixed(1)}%`;
const filingDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Zoe's fund page: what one share costs at the latest close. Nothing without a price. */
export function ShareCostCard({ close }: { close: Close | null }) {
  if (!close) return null;
  return (
    <section className="t-card" aria-labelledby="share-h">
      <h2 className="t-card__k" id="share-h">One share costs</h2>
      <div className="t-big">{formatCents(close.cents)}</div>
      <p className="t-small">{closeWords(close.day)}</p>
    </section>
  );
}

/** Zoe's fund page: the fund's biggest holdings, each with a thin bar scaled to the largest. Nothing when unavailable. */
export function InsideCard({ inside }: { inside: FundInside | null }) {
  if (!inside) return null;
  const max = inside.rows[0]?.pct || 1;
  return (
    <section className="t-card" aria-labelledby="inside-h">
      <h2 className="t-card__k" id="inside-h">What&apos;s inside</h2>
      <p className="t-small" style={{ marginTop: 4 }}>Its biggest holdings, by share of the fund:</p>
      <ul className="t-hl">
        {inside.rows.map((r) => (
          <li key={r.name}>
            <span>{r.name}</span>
            <span className="t-hl__bar" aria-hidden="true"><i style={{ width: `${(r.pct / max) * 100}%` }} /></span>
            <span className="t-hl__pct">{pct1(r.pct)}</span>
          </li>
        ))}
      </ul>
      <p className="t-small" style={{ marginTop: 8 }}>
        These are {Math.round(inside.topPct)}% of the fund. The rest is spread over many more companies.
      </p>
      <p className="t-muted t-fine" style={{ marginTop: 6 }}>From the fund&apos;s filing for {filingDay.format(inside.asOf)}, via Financial Datasets.</p>
    </section>
  );
}

/** Amara's request page: the same facts Zoe saw, compact. Nothing when unavailable. */
export function InsideLineCard({ symbol, inside }: { symbol: string; inside: FundInside | null }) {
  if (!inside) return null;
  const first = inside.rows.slice(0, 5).map((r) => `${r.name} ${pct1(r.pct)}`).join(", ");
  return (
    <section className="g-card" aria-labelledby="inside-h">
      <h2 className="g-label" id="inside-h">What&apos;s inside {symbol}</h2>
      <p style={{ color: "var(--ink-2)", fontSize: 14 }}>
        {first}{inside.rows.length > 5 ? "…" : "."} The top ten are {Math.round(inside.topPct)}% of the fund.
      </p>
    </section>
  );
}
