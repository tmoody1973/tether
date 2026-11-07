// Investing cards for Zoe's fund page, Amara's request page and both investment lists (decision 020, D16's rules):
// facts only, every number computed by code, no daily moves, never red or green.
import type { CompanyFacts, FundInside } from "@/adapters/financialdatasets/client";
import type { Close } from "@/adapters/alpaca/data";
import type { Holding } from "@/flows/holdings";
import { ValueLine } from "@/ui/FiveYearLine";
import { formatCents } from "@/ui/grantWords";
import { closeWords, companyLine, dayMonth, dayMonthYear, herWords, holdingSentence, TOO_SOON_DAYS, tooSoonWords, youOwnWords } from "@/ui/investWords";

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

/** Zoe's page for a stock: what the company is, in plain rows (no ratios, no market cap, no opinions). Nothing when unavailable. */
export function AboutCompanyCard({ facts }: { facts: CompanyFacts | null }) {
  if (!facts) return null;
  const rows: [string, string | null][] = [
    ["Name", facts.name], ["Sector", facts.sector], ["Industry", facts.industry], ["Based in", facts.location],
    ["Employees", facts.employees === null ? null : facts.employees.toLocaleString("en-US")],
  ];
  return (
    <section className="t-card" aria-labelledby="company-h">
      <h2 className="t-card__k" id="company-h">About the company</h2>
      <dl style={{ marginTop: 4 }}>
        {rows.flatMap(([k, v]) => (v ? [<div className="t-row" key={k}><dt className="t-muted">{k}</dt><dd>{v}</dd></div>] : []))}
      </dl>
      <p className="t-muted t-fine" style={{ marginTop: 6 }}>From the company&apos;s SEC filings, via Financial Datasets.</p>
    </section>
  );
}

/** Amara's request page for a stock: what the company is, in one line. Nothing when unavailable. */
export function CompanyLine({ facts }: { facts: CompanyFacts | null }) {
  return facts ? <p className="g-note" style={{ marginTop: 6 }}>{companyLine(facts)}</p> : null;
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

const unit = { fontSize: 15, fontWeight: 600, letterSpacing: 0, color: "var(--ink-3-text)" } as const;

/** Zoe's "Your investments": one card per fund she holds. A line only once there are 5 closes; her own words last. */
export function HoldingCard({ h }: { h: Holding }) {
  const said = herWords(h);
  const put = formatCents(h.putInCents);
  return (
    <section className="t-card" aria-label={`${h.symbol}, how it's doing`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <b style={{ fontSize: 17 }}>{h.symbol}</b><span className="t-muted">since {dayMonthYear(h.since)}</span>
      </div>
      <div className="t-big">{formatCents(h.worthCents)} <span style={unit}>worth today</span></div>
      {h.line && h.marketCents !== null && (
        <>
          <ValueLine fund={h.line.mine} market={h.line.market} base={h.putInCents} label={holdingSentence(h, "teen")} chart="since-bought" />
          <div className="t-legend" style={{ marginTop: 8 }}>
            <span><i />Your {put} in {h.symbol}</span><span><i className="t-legend--market" />Same {put}, whole market</span>
          </div>
          <p className="t-small" style={{ marginTop: 8 }}>{holdingSentence(h, "teen")}</p>
        </>
      )}
      <div className="t-row"><span>You own</span><b>{youOwnWords(h.shares)}</b></div>
      {!h.line && <div className="t-row"><span>You put in</span><b>{put} on {dayMonth(h.since)}</b></div>}
      {h.daysHeld < TOO_SOON_DAYS && <p className="t-hint" style={{ marginTop: 8 }}>{tooSoonWords(h.daysHeld)}</p>}
      {said && <p className="t-quote" style={{ marginTop: 10 }}>{said.lead} <i>&ldquo;{said.quote}&rdquo;</i>{said.tail && ` ${said.tail}`}</p>}
    </section>
  );
}

/** Amara's "Zoe's investments": the same facts in her colours, no quote. */
export function HerHoldingCard({ h }: { h: Holding }) {
  return (
    <div className="g-holding">
      <div className="g-def"><span className="g-def__k">{h.symbol}</span><span className="g-def__lead" /><span className="g-def__v">{formatCents(h.worthCents)}</span></div>
      {h.line && h.marketCents !== null && (
        <ValueLine fund={h.line.mine} market={h.line.market} base={h.putInCents} label={holdingSentence(h, "guardian")} tone="g" chart="since-bought" />
      )}
      <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 6 }}>{holdingSentence(h, "guardian")}</p>
      {h.daysHeld < TOO_SOON_DAYS && <p className="g-note" style={{ marginTop: 4 }}>{tooSoonWords(h.daysHeld)}</p>}
    </div>
  );
}
