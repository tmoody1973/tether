import { Suspense } from "react";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { teenSession } from "@/auth/teen";
import { now as clockNow } from "@/clock/clock";
import * as t from "@/db/schema";
import { compareHeading, compareSentence, marketFromEnv, NotEnoughHistoryError, oneYearLine, type AssetHit, type FiveYear } from "@/adapters/alpaca/data";
import { companyFacts, fundInside } from "@/adapters/financialdatasets/client";
import { fundWords } from "@/ai/fundWords";
import { isLeveragedProduct, LEVERAGED_TEXT } from "@/engine/invest";
import { takeDaily } from "@/flows/usage";
import { teenWeek } from "@/flows/teen";
import { fundStatus, isSymbol } from "@/flows/teenInvest";
import { FiveYearLine } from "@/ui/FiveYearLine";
import { AboutCompanyCard, InsideCard, ShareCostCard } from "@/ui/InvestCards";
import { pennyLine } from "@/ui/investWords";
import { TeenLoading, TeenShell, LinkGone } from "@/ui/teen";
import { explainLlm } from "../../../teenDeps";
import { investGate, UNAVAILABLE } from "../Gate";
import { ProposeForm } from "../ProposeForm";

// D16 fund page (a fund or a stock): facts (what one share costs, what's inside or what the company is), the one-year line, ONE fixed 5-year line against the
// whole market, then her own answers.
// No 1D/1W/1M controls, no daily moves, no "good fit" verdicts, no links out.
export default function FundPage({ params, searchParams }: PageProps<"/t/[token]/invest/[symbol]">) {
  return (
    <Suspense fallback={<TeenLoading />}>
      <Fund params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Fund({ params, searchParams }: { params: Promise<{ token: string; symbol: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token, symbol: raw } = await params;
  const session = await teenSession(token);
  if (!session) return <LinkGone />;
  const { db, fam } = session;
  const now = await clockNow(db, fam.id);
  const w = await teenWeek(db, fam.id, now);
  const gate = investGate(token, w);
  if (gate) return gate;
  const g = w.guardianName;
  const symbol = decoded(raw).toUpperCase();
  const back = <Link className="t-btn t-btn--ghost" href={`/t/${token}/invest`}>Back to search</Link>;
  const calm = (text: string) => (
    <TeenShell token={token} active="invest" level={w.level} center><h1 className="t-h2">{text}</h1>{back}</TeenShell>
  );
  if (!isSymbol(symbol)) return calm("We couldn't find that one.");

  const market = (() => { try { return marketFromEnv(); } catch { return null; } })();
  let hit: AssetHit | undefined;
  try {
    if (!market) throw new Error("Alpaca is not configured here");
    hit = (await market.searchAssets(symbol)).find((a) => a.symbol === symbol);
  } catch (err) {
    console.error("fund page: market unavailable", err instanceof Error ? err.message : err);
    return calm(UNAVAILABLE);
  }
  if (!hit || !market) return calm("We couldn't find that one.");

  const asOf = new Date();
  const [close, one, five, about, status] = await Promise.all([
    market.latestClose(symbol),
    market.changeOver(symbol, 1, asOf).then((c) => oneYearLine(c), () => null),
    // "young": under a year of trading, so there's no longer comparison to draw (R42).
    market.fiveYear(symbol, asOf).catch((e): FiveYear | "young" | null => (e instanceof NotEnoughHistoryError ? "young" : null)),
    fundWords(explainLlm(), { name: hit.name, symbol: hit.symbol, exchange: hit.exchange, fractionable: hit.fractionable },
      () => takeDaily(db, fam.id, "fund_words")),
    fundStatus(db, fam.id, symbol, now),
  ]);
  const sp = await searchParams;
  const sentInvestment = sp.sent === "investment" && (await db.select({ id: t.investments.id }).from(t.investments)
    .where(and(eq(t.investments.familyId, fam.id), eq(t.investments.symbol, symbol), eq(t.investments.status, "proposed"))).limit(1)).length > 0;
  const sentFund = sp.sent === "fund" && status === "asked"; // the flash follows what's stored, not the URL
  const leveraged = isLeveragedProduct(hit.name);
  const penny = pennyLine(close?.cents ?? null);

  return (
    <TeenShell token={token} active="invest" level={w.level}>
      <div>
        <div className="t-eyebrow">Look closer</div>
        <h1 className="t-h2" style={{ marginTop: 6 }}>{hit.name}</h1>
        <p className="t-muted">{hit.symbol} · {hit.exchange}</p>
      </div>
      {sentFund && <p className="t-flash" role="status">Sent. {g} will see your answers. If she adds {symbol} to her investing list, you can propose an amount.</p>}
      {sentInvestment && <p className="t-flash" role="status">Sent. {g} will see your answers and decide.</p>}

      <ShareCostCard close={close} />
      {penny && <p className="t-small">{penny}</p>}
      <section className="t-card" aria-label="What it is"><p className="t-small">{about}</p></section>
      {/* Streams in on its own: Financial Datasets being slow, down or capped never holds up the page. */}
      {/* At most one paid call: fundInside only asks for covered funds, companyFacts never does. */}
      <Suspense fallback={null}><WhatsInside symbol={symbol} familyId={fam.id} name={hit.name} /></Suspense>
      <Suspense fallback={null}><AboutCompany symbol={symbol} familyId={fam.id} name={hit.name} /></Suspense>

      <section className="t-card" aria-labelledby="year-h">
        <h2 className="t-card__k" id="year-h">One year</h2>
        <p className="t-small" style={{ marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{one ?? UNAVAILABLE}</p>
      </section>

      <section className="t-card" aria-labelledby="five-h">
        <h2 className="t-card__k" id="five-h" style={{ marginBottom: 8 }}>{five && five !== "young" ? compareHeading(five.compare) : "Five years"}</h2>
        {five === "young" ? (
          <p className="t-small">{symbol} has traded for less than a year, so there&apos;s no longer comparison yet.</p>
        ) : five ? (
          <>
            <FiveYearLine fund={five.lines.thisFund} market={five.lines.market} label={compareSentence(five.compare)} />
            <div className="t-legend" style={{ marginTop: 8 }}><span><i />{symbol}</span><span><i className="t-legend--market" />The whole market (SPY)</span></div>
            <p className="t-small" style={{ marginTop: 8, fontVariantNumeric: "tabular-nums" }}>{compareSentence(five.compare)}</p>
          </>
        ) : <p className="t-small">{UNAVAILABLE}</p>}
      </section>

      {leveraged ? (
        <div className="t-card"><p className="t-small">{LEVERAGED_TEXT}</p></div>
      ) : status === "asked" ? (
        <div className="t-card"><p className="t-small">You asked {g} to add {symbol} to her investing list. She&apos;ll decide.</p></div>
      ) : (
        <>
          <p className="t-small">
            {status === "allowed"
              ? `${symbol} is on ${g}'s investing list. Propose an amount and she decides.`
              : `${symbol} isn't on ${g}'s investing list yet. Proposing asks her to add it, with your answers.`}
          </p>
          <ProposeForm token={token} symbol={symbol} guardian={g} price={close?.cents ?? null} fractionable={hit.fractionable} />
        </>
      )}
      {back}
    </TeenShell>
  );
}

/** One paid Financial Datasets call per render at most (cached a week); companies and failures show nothing. */
async function WhatsInside({ symbol, familyId, name }: { symbol: string; familyId: string; name: string }) {
  return <InsideCard inside={await fundInside(symbol, familyId, name)} />;
}

/** A stock's plain facts (cached a week); funds, leveraged products, uncovered tickers and failures show nothing. */
async function AboutCompany({ symbol, familyId, name }: { symbol: string; familyId: string; name: string }) {
  return <AboutCompanyCard facts={await companyFacts(symbol, familyId, name)} />;
}

/** Next has normally decoded the segment already; a stray "%" must never become a 500. */
function decoded(raw: string): string {
  try { return decodeURIComponent(raw); } catch { return raw; }
}
