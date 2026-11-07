import type { ReactNode } from "react";
import type { AnswerCard, CheckinCard, PaypalCard, PurchasesCard } from "@/ai/answerCards";
import { formatCents, formatDay, formatMonth } from "@/ui/grantWords";
import { Bar, Money } from "@/ui/money";

// Rendered inside the AskBox (a client component), so it imports only browser-safe modules: the card types are
// erased at build time, and grantWords / money import nothing server-side.

const KINDS = new Set<string>(["purchases", "checkin", "paypal"]);
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
      {known.map((c, i) => c.kind === "purchases" ? <Purchases key={i} c={c} />
        : c.kind === "checkin" ? <CheckIn key={i} c={c} /> : <Paypal key={i} c={c} />)}
    </div>
  );
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
