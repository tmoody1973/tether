import { Suspense } from "react";
import Link from "next/link";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import { closingStatement, type Statement } from "@/flows/statement";
import { mondayOfKey } from "@/flows/week";
import { formatCents, formatDay, stoppedWords } from "@/ui/grantWords";
import { GuardianLoading, GuardianShell, Money, SignedOut } from "@/ui/guardian";
import { RetirementNotice } from "@/ui/RetirementNotice";
import { PrintButton } from "./PrintButton";
import "./statement.css";

// Decision 029: what Tether has recorded as promised to Zoe, and what is left to pay. Guardian-only, printable.
export default function StatementPage({ searchParams }: PageProps<"/g/statement">) {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <StatementView searchParams={searchParams} />
    </Suspense>
  );
}

async function StatementView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const familyId = await guardianFamilyId();
  if (!familyId) return <SignedOut />;
  const db = await getDb();
  const s = await closingStatement(db, familyId, await clockNow(db, familyId));
  const zoe = s.teenName;
  const how = (await searchParams).stopped;
  const note = typeof how === "string" ? stoppedWords(how, zoe) : null;

  return (
    <GuardianShell active={null} teenName={zoe} familyId={familyId}>
      <div className="g-head g-head--base">
        <h1 className="g-title">Statement for {zoe}</h1>
        <span className="g-sub">What Tether has recorded as promised to {zoe}, as of {formatDay(s.now)}. Tether tracks it; the money isn&apos;t set aside.</span>
      </div>
      {note && <p className={note.warn ? "g-flash g-flash--warn" : "g-flash"} role="status">{note.text}</p>}
      <RetirementNotice removesAt={s.removesAt} />
      <div className="g-btnrow g-noprint">
        <PrintButton />
        <Link className="g-btn g-btn--ghost" href="/g/rules">{zoe}&apos;s rules</Link>
      </div>

      <section className="g-card g-statement" aria-labelledby="remaining-h">
        <h2 className="g-label" id="remaining-h">{owedLabel(s)}</h2>
        <div className="g-statement__total"><span>You owe {zoe}</span><Money cents={s.owedCents} /></div>
        <p className="g-muted" style={{ marginTop: 6 }}>{owedParts(s)}</p>
        <p className="g-note" style={{ marginTop: 4 }}>
          Savings recorded so far: {formatCents(s.recordedCents)} from closed weeks − {formatCents(s.paidCents)} paid to {zoe} − {formatCents(s.investedCents)} moved
          to investing = {formatCents(s.remainingCents)}, the figure {zoe} sees.
        </p>
      </section>

      <CurrentWeek s={s} />
      <ClosedWeeks s={s} />
      <Payments s={s} />

      <section className="g-card g-statement" aria-labelledby="inv-h">
        <h2 className="g-label" id="inv-h">Moved to investing</h2>
        <p>{s.investedCents > 0
          ? <><Money cents={s.investedCents} /> of {zoe}&apos;s savings went into her investing account, so it left savings.</>
          : "Nothing has moved to investing."}</p>
      </section>
    </GuardianShell>
  );
}

/** The headline in parts: "$X saved + $Y your match + $Z this week", leaving out parts that are zero-by-definition. */
function owedParts(s: Statement): string {
  const parts = [`${formatCents(s.remainingCents)} saved`];
  if (s.waiting) parts.push(`${formatCents(s.waiting.matchCents)} your match on the release waiting to be paid`);
  if (s.current.state !== "none") parts.push(`${formatCents(s.current.addsCents)} this week, when it closes on ${formatDay(s.current.closesAt)}`);
  return `${parts.join(" + ")}.`;
}

/** After a stop the total is final; while rules are in force this week can still change as she spends. */
const owedLabel = (s: Statement): string =>
  s.current.state === "stopped" ? `Promised to ${s.teenName}, counting this week`
    : s.current.state === "in_force" ? `Promised to ${s.teenName}, counting this week so far` : `Still promised to ${s.teenName}`;

function CurrentWeek({ s }: { s: Statement }) {
  const c = s.current;
  const zoe = s.teenName;
  const how = c.state === "stopped" && c.stoppedAt ? `Rules stopped on ${formatDay(c.stoppedAt)}. This week still counts as promised.`
    : c.state === "in_force" ? "Rules in force. This week counts as promised."
    : "No rules cover this week, so it adds nothing.";
  return (
    <section className="g-card g-statement" aria-labelledby="week-h">
      <h2 className="g-label" id="week-h">This week, closing {formatDay(c.closesAt)}</h2>
      <p style={{ fontWeight: 650 }}>{how}</p>
      {c.state !== "none" && (
        <p className="g-muted" style={{ marginTop: 4 }}>
          {formatCents(c.allowanceCents)} this week − {formatCents(c.spentCents)} {zoe} spent = {formatCents(c.addsCents)} recorded when it closes.
        </p>
      )}
    </section>
  );
}

function ClosedWeeks({ s }: { s: Statement }) {
  return (
    <section className="g-card g-statement" aria-labelledby="weeks-h">
      <h2 className="g-label" id="weeks-h">Recorded so far (closed weeks)</h2>
      {s.weeks.length === 0 ? <p className="g-muted">No weeks have closed yet.</p> : (
        <table className="g-table">
          <thead><tr><th scope="col">Week of</th><th scope="col" className="g-num">Allowance</th><th scope="col" className="g-num">Spent</th><th scope="col" className="g-num">Recorded</th></tr></thead>
          <tbody>
            {s.weeks.map((w) => (
              <tr key={w.weekKey}>
                <td>{formatDay(mondayOfKey(w.weekKey))}{w.stopped && " · rules stopped"}</td>
                <td className="g-num">{formatCents(w.allowanceCents)}</td>
                <td className="g-num">{formatCents(w.spentCents)}</td>
                <td className="g-num">{formatCents(w.addedCents)}</td>
              </tr>
            ))}
            <tr><td><b>Total</b></td><td /><td /><td className="g-num"><b>{formatCents(s.recordedCents)}</b></td></tr>
          </tbody>
        </table>
      )}
    </section>
  );
}

function Payments({ s }: { s: Statement }) {
  const zoe = s.teenName;
  return (
    <section className="g-card g-statement" aria-labelledby="paid-h">
      <h2 className="g-label" id="paid-h">Payments to {zoe} you recorded</h2>
      {s.payments.length === 0 ? <p className="g-muted">None yet.</p> : (
        <table className="g-table">
          <thead><tr><th scope="col">Recorded</th><th scope="col" className="g-num">Savings</th><th scope="col" className="g-num">Your match</th></tr></thead>
          <tbody>
            {s.payments.map((p, i) => (
              <tr key={i}><td>{formatDay(p.at)}</td><td className="g-num">{formatCents(p.savedCents)}</td><td className="g-num">{formatCents(p.matchCents)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {s.waiting && (
        <p className="g-muted" style={{ marginTop: 8 }}>
          Waiting for you to pay and record: {formatCents(s.waiting.savedCents)} savings + {formatCents(s.waiting.matchCents)} your match. The savings part is still inside the remaining amount; the match is on top.
        </p>
      )}
      <p className="g-note" style={{ marginTop: 8 }}>You pay {zoe} yourself; Tether can&apos;t see those payments, only that you recorded them.</p>
    </section>
  );
}
