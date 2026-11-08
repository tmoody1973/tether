import { Suspense } from "react";
import Link from "next/link";
import { teenSession } from "@/auth/teen";
import { now as clockNow } from "@/clock/clock";
import type { Db } from "@/db/client";
import { brokerFromEnv, STAND_IN_LABEL } from "@/adapters/alpaca/broker";
import { marketFromEnv, oneYearLine, type AssetHit } from "@/adapters/alpaca/data";
import { isLeveragedProduct } from "@/engine/invest";
import { resumeInvestments } from "@/flows/invest";
import { availableSavingsCents } from "@/ledger/ledger";
import { teenWeek } from "@/flows/teen";
import { teenInvestments } from "@/flows/teenInvest";
import { formatCents } from "@/ui/grantWords";
import { LinkGone, TeenLoading, TeenShell } from "@/ui/teen";
import { teenDeps } from "../../teenDeps";
import { pageHoldings } from "@/app/g/flowDeps";
import { YourInvestments, type FreshInvestments } from "./YourInvestments";
import { investGate, UNAVAILABLE } from "./Gate";
import { INVESTING_OFF_LINE, investingOffWords } from "@/ui/teenWords";
import { Seam } from "@/ui/Seam";

// F17 / D13: the whole market, ordered by match to what she typed (never popularity). No movers, no daily moves.
// Each result's only action is "Look closer" (leveraged and inverse products say they're not available instead);
// proposing happens on the fund page, with her own answers.
export default function InvestPage({ params, searchParams }: PageProps<"/t/[token]/invest">) {
  return (
    <Suspense fallback={<TeenLoading />}>
      <Invest params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const RESULTS = 8;

async function Invest({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const session = await teenSession(token);
  if (!session) return <LinkGone />;
  const { db, fam } = session;
  const w = await teenWeek(db, fam.id, await clockNow(db, fam.id));
  const gate = investGate(token, w, true); // decision 030: with investing off this page still shows her investments
  if (gate) return gate;
  const available = await availableSavingsCents(db, fam.id);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";

  return (
    <TeenShell token={token} active="invest" level={w.level}>
      <div>
        <h1 className="t-eyebrow">Invest</h1>
        <p className="t-h2" style={{ marginTop: 6 }}>Search the whole market</p>
        <p className="t-small" style={{ marginTop: 4 }}>You have <b className="money">{formatCents(available)}</b> available to invest{available !== w.savingsCents && <> (<span className="money">{formatCents(w.savingsCents)}</span> saved, some of it on its way to you as your release)</>}. You propose, {w.guardianName} decides. Tether recommends nothing.</p>
      </div>
      {w.investingOff ? (
        <div className="t-card" role="status"><b>{investingOffWords(w.guardianName)}.</b> <span className="t-small">{INVESTING_OFF_LINE}</span></div>
      ) : (
        <>
          <form action={`/t/${token}/invest`} method="get" className="t-form" role="search">
            <label className="t-label" htmlFor="invest-q">A fund or company</label>
            <input id="invest-q" name="q" type="search" className="t-input" maxLength={60} defaultValue={q} required />
            <button type="submit" className="t-btn t-btn--ghost">Search</button>
          </form>
          {q && <Results token={token} q={q} />}
        </>
      )}
      <Investments db={db} familyId={fam.id} guardian={w.guardianName} />
    </TeenShell>
  );
}

async function Results({ token, q }: { token: string; q: string }) {
  let hits: { a: AssetHit; line: string | null }[];
  try {
    const market = marketFromEnv();
    const found = (await market.searchAssets(q)).slice(0, RESULTS);
    const asOf = new Date();
    const years = await Promise.allSettled(found.map((a) => market.changeOver(a.symbol, 1, asOf)));
    hits = found.map((a, i) => { const y = years[i]; return { a, line: y.status === "fulfilled" ? oneYearLine(y.value) : null }; });
  } catch (err) {
    console.error("invest search unavailable", err instanceof Error ? err.message : err);
    return <p className="t-flash t-flash--warn" role="status">{UNAVAILABLE}</p>;
  }
  if (hits.length === 0) return <p className="t-flash" role="status">Nothing matched that. Try a name or a symbol, like VTI.</p>;
  return (
    <section aria-label="Results">
      <ul className="t-results" style={{ listStyle: "none" }}>
        {hits.map(({ a, line }) => (
          <li key={a.symbol}>
            <article className="t-card t-result" aria-label={`${a.name} (${a.symbol})`}>
              <div className="t-result__top"><span className="t-result__title">{a.name}</span><span className="t-muted">{a.symbol}</span></div>
              <div className="t-result__shop">1 year: {line ?? UNAVAILABLE}</div>
              {isLeveragedProduct(a.name)
                ? <span className="t-chip">Not available on Tether</span>
                : <Link className="t-btn t-btn--ghost" href={`/t/${token}/invest/${encodeURIComponent(a.symbol)}`}>Look closer</Link>}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Investments({ db, familyId, guardian }: { db: Db; familyId: string; guardian: string }) {
  const rows = await teenInvestments(db, familyId); // the database only: shown at once, whatever Alpaca is doing
  const custodial = process.env.ALPACA_CUSTODIAL_ENABLED === "true";
  return (
    <section aria-labelledby="mine-h">
      <h2 className="t-eyebrow" id="mine-h" style={{ marginBottom: 4 }}>Your investments</h2>
      {rows.length === 0 ? (
        <div className="t-card"><p className="t-small">None yet. Each one needs {guardian}&apos;s OK.</p></div>
      ) : (
        <YourInvestments rows={rows} fresh={freshInvestments(db, familyId)} guardian={guardian} />
      )}
      {!custodial && <div style={{ marginTop: 10 }}><Seam center>{STAND_IN_LABEL}</Seam></div>}
    </section>
  );
}

/** Best effort: a queued order may have filled since, then her holdings. A broker outage never fails it. */
async function freshInvestments(db: Db, familyId: string): Promise<FreshInvestments> {
  try {
    const d = teenDeps(db);
    await resumeInvestments({ db, now: d.now, secret: d.secret, alpaca: brokerFromEnv() }, familyId);
  } catch (err) {
    console.error("resumeInvestments skipped", err instanceof Error ? err.message : err);
  }
  const [rows, holdings] = await Promise.all([teenInvestments(db, familyId), pageHoldings(db, familyId)]);
  return { rows, holdings };
}
