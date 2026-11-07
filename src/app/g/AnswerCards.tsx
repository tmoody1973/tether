import type { ReactNode } from "react";
import type { AnswerCard, CheckinCard, InsideCard, InvestmentsCard, NewsCard, PaypalCard, PurchasesCard } from "@/ai/answerCards";
import { formatCents, formatDay, formatMonth } from "@/ui/grantWords";
import { youOwnWords } from "@/ui/investWords";
import { Bar, Money } from "@/ui/money";

// Rendered inside the AskBox (a client component), so it imports only browser-safe modules: the card types are
// erased at build time, and grantWords / money import nothing server-side.

const KINDS = new Set<string>(["purchases", "checkin", "paypal", "investments", "inside", "news"]);
const day = (iso: string) => formatDay(new Date(`${iso}T00:00:00Z`));
const count = (n: number) => (n === 1 ? "1 payment" : `${n} payments`);

function Row({ k, val }: { k: string; val: ReactNode }) {
  return <div className="g-def"><span className="g-def__k">{k}</span><span className="g-def__lead" /><span className="g-def__v">{val}</span></div>;
}

/** The cards under an assistant answer. Their numbers come from the data Tether fetched, never from the model. */
export function AnswerCards({ cards }: { cards: AnswerCard[] }) {
  const known = cards.filter((c) => KINDS.has(c.kind));
  if (known.length === 0) return null;
  return (
    <div className="g-ask__cards">
      {known.map((c, i) => <Card key={i} c={c} />)}
    </div>
  );
}

function Card({ c }: { c: AnswerCard }) {
  switch (c.kind) {
    case "purchases": return <Purchases c={c} />;
    case "checkin": return <CheckIn c={c} />;
    case "paypal": return <Paypal c={c} />;
    case "investments": return <Investments c={c} />;
    case "inside": return <Inside c={c} />;
    case "news": return <News c={c} />;
  }
}

// ponytail: the same classes as PaymentRow (Activity's rows); PaymentRow itself imports server-only words, so it isn't reused here.
function Purchases({ c }: { c: PurchasesCard }) {
  const month = formatMonth(c.month);
  return (
    <section className="g-card g-card--inset" aria-label={`${month} purchases`}>
      <div className="g-section__head">
        <h3 className="g-label">{month} purchases</h3>
        {c.rows.length > 0 && <span className="g-muted">{count(c.rows.length)} · {formatCents(c.totalCents)}</span>}
      </div>
      {c.rows.length === 0 ? <p className="g-muted">No payments in {month}.</p> : (
        <ul className="g-rows">
          {c.rows.map((r, i) => (
            <li key={i}>
              <div className="g-row">
                <span className="g-row__date">{day(r.date)}</span>
                <span>
                  <span className="g-row__shop">{r.shop}</span>
                  {r.items && <span className="g-row__items">{r.items}</span>}
                  <span className="g-row__how">{r.allowedBy}</span>
                </span>
                <span className="g-row__amt"><Money cents={r.amountCents} /></span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {c.hiddenNote && <p className="g-note">{c.hiddenNote}</p>}
    </section>
  );
}

function CheckIn({ c }: { c: CheckinCard }) {
  const month = formatMonth(c.month);
  const { week: w, weeks } = c;
  return (
    <section className="g-card g-card--inset" aria-label={`${month} check-in`}>
      <h3 className="g-label">{month} check-in</h3>
      <div className="g-card__figure">{c.level ? `Level ${c.level}` : "No rules yet"}</div>
      {c.rulesStopped
        ? <p className="g-card__sub">Spending is stopped. This week: <Money cents={w.spentCents} /> spent.</p>
        : <p className="g-card__sub">This week: <Money cents={w.spentCents} /> spent · <Money cents={w.leftCents} /> left of <Money cents={w.allowanceCents} /></p>}
      <Bar value={w.spentCents} max={w.allowanceCents} label={`${formatCents(w.spentCents)} spent of ${formatCents(w.allowanceCents)} this week`} />
      {weeks.count === 0 ? <p className="g-muted">No weeks have closed yet.</p> : (
        <>
          <Row k="Weeks inside budget" val={`${weeks.insideBudget} of ${weeks.count}`} />
          <Row k="Kept her savings promise" val={`${weeks.kept} of ${weeks.count}`} />
          <Row k="Saved" val={<Money cents={weeks.savedCents} />} />
        </>
      )}
      {c.nextCheckin && <Row k="Check-in runs" val={day(c.nextCheckin)} />}
      {weeks.count > 0 && <p className="g-note">Weeks shown: {weeks.covers}.</p>}
    </section>
  );
}

function Paypal({ c }: { c: PaypalCard }) {
  const month = formatMonth(c.month);
  const allMatch = c.receiptsChecked > 0 && c.flags.length === 0;
  return (
    <section className="g-card g-card--inset" aria-label={`${month}: Tether and PayPal`}>
      <h3 className="g-label">{month} · Tether and PayPal</h3>
      <p className={allMatch ? "g-ok" : undefined}>
        {c.receiptsChecked === 0 ? `No receipts to check in ${month}.` : `${c.matched} of ${c.receiptsChecked} receipts match PayPal`}
      </p>
      {c.flags.length > 0 && (
        <ul className="g-flags" style={{ marginTop: 8 }}>
          {c.flags.map((f, i) => (
            <li key={i}>
              <span className="g-chip g-chip--warn">{f.label}</span>
              <div style={{ marginTop: 6 }}>{f.shop && <span>{f.shop} </span>}<b><Money cents={f.amountCents} /></b></div>
            </li>
          ))}
        </ul>
      )}
      {c.note && <p className="g-note" style={{ marginTop: 6 }}>{c.note}</p>}
      {c.setAsideNote && <p className="g-note" style={{ marginTop: 6 }}>{c.setAsideNote}</p>}
    </section>
  );
}

function Investments({ c }: { c: InvestmentsCard }) {
  const title = `${c.teen}'s investments`;
  return (
    <section className="g-card g-card--inset" aria-label={title}>
      <h3 className="g-label">{title}</h3>
      {c.rows.map((r) => (
        <div key={r.symbol} className="g-holding">
          <div className="g-def">
            <span className="g-def__k">{r.symbol}</span><span className="g-def__lead" />
            <span className="g-def__v"><Money cents={r.worthCents} /><small>{youOwnWords(r.shares)} · put in {formatCents(r.putInCents)}</small></span>
          </div>
          {r.marketCents !== null && (
            <p className="g-note">The same {formatCents(r.putInCents)} in the whole market: {formatCents(r.marketCents)}.</p>
          )}
        </div>
      ))}
    </section>
  );
}

const pct1 = (p: number) => `${p.toFixed(1)}%`;
const filingDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The same facts as Zoe's "What's inside" card, in Amara's colours: thin bars scaled to the largest holding. */
function Inside({ c }: { c: InsideCard }) {
  const max = c.rows[0]?.pct || 1;
  return (
    <section className="g-card g-card--inset" aria-label={`What's inside ${c.symbol}`}>
      <h3 className="g-label">What&apos;s inside {c.symbol}</h3>
      <ul className="g-hl">
        {c.rows.map((r) => (
          <li key={r.name}>
            <span>{r.name}</span>
            <span className="g-hl__bar" aria-hidden="true"><i style={{ width: `${(r.pct / max) * 100}%` }} /></span>
            <span className="g-hl__pct">{pct1(r.pct)}</span>
          </li>
        ))}
      </ul>
      <p className="g-note">From the fund&apos;s filing for {filingDay.format(new Date(`${c.asOf}T00:00:00Z`))}, via Financial Datasets.</p>
    </section>
  );
}

// ponytail: buildCards already drops non-http(s) links; this second check guards the one place a link is drawn.
const linkable = (url: string | null): url is string => !!url && /^https?:\/\//i.test(url);

function News({ c }: { c: NewsCard }) {
  const title = c.ticker ? `News about ${c.ticker}` : "Market news";
  return (
    <section className="g-card g-card--inset" aria-label={title}>
      <h3 className="g-label">{title}</h3>
      <ul className="g-news">
        {c.articles.map((a, i) => (
          <li key={i}>
            {linkable(a.url) ? <a href={a.url} target="_blank" rel="noopener noreferrer">{a.title}</a> : <span>{a.title}</span>}
            <span className="g-news__by">{a.date ? `${a.source} · ${day(a.date)}` : a.source}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
