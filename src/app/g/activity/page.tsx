import { Suspense } from "react";
import { needsCount } from "@/flows/home";
import Link from "next/link";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import { paypalFromEnv } from "@/adapters/paypal/http";
import { guardianRecord, type RecordGrant, type RecordReceipt, type RecordView } from "@/flows/record";
import { monthReviewView, type ReviewView } from "@/flows/month";
import { FLAG_WORDS, MONTH_RE, reconcileMonth, type Reconciliation } from "@/flows/reconcile";
import { resumePayingPurchases } from "@/flows/purchase";
import { INVESTING_FROM, LEVELS, type Level } from "@/engine/ladder";
import { TOKEN_TTL_MS } from "@/engine/token";
import { checkWords, herReason, hiddenNote, monthEnd, shownReceipts } from "@/ui/activityWords";
import { approvalWords, formatCents, formatDay, formatMonth, formatWhen } from "@/ui/grantWords";
import { INVEST_STATUS } from "@/ui/investWords";
import { Bar, GuardianLoading, GuardianShell, Money, SignedOut } from "@/ui/guardian";
import { Seam } from "@/ui/Seam";
import { ReleaseCard } from "../ReleaseCard";
import { paymentDeps } from "../flowDeps";
import { AskBox } from "../AskBox";
import { ItemsLine, PaymentRow } from "../PaymentRow";

// What Zoe bought, how her month is going, and the proof behind every payment (Record + Review, merged). Guardian-only.
export default function ActivityPage({ searchParams }: PageProps<"/g/activity">) {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <Activity searchParams={searchParams} />
    </Suspense>
  );
}

const shiftMonth = (month: string, by: number): string => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

function flash(sp: Record<string, string | string[] | undefined>): string | null {
  if (sp.sent === "1") return "Recorded as sent by you. Tether can't see the money move, and the record says so.";
  if (sp.promoted === "1") return "The month closed and the check-in ran.";
  return null;
}

async function Activity({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const familyId = await guardianFamilyId();
  if (!familyId) return <SignedOut />;
  const db = await getDb();
  const now = await clockNow(db, familyId);
  const thisMonth = now.toISOString().slice(0, 7);
  const sp = await searchParams;
  const month = typeof sp.month === "string" && MONTH_RE.test(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;
  await resumePayingPurchases(paymentDeps(db), familyId); // R37: settle any PayPal outcome that was unknown
  const [r, v] = await Promise.all([guardianRecord(db, familyId, month, now), monthReviewView(db, familyId)]);
  const zoe = r.home.teenName;
  const note = flash(sp);

  return (
    <GuardianShell active="activity" teenName={zoe} needs={needsCount(r.home)} familyId={familyId}>
      <div className="g-head g-head--base">
        <h1 className="g-title">Activity</h1>
        <span className="g-sub">What {zoe} bought, how her month is going, and the proof behind every payment.</span>
      </div>
      {note && <p className="g-flash" role="status">{note}</p>}

      <div className="g-two">
        <div className="g-stack">
          <Suspense fallback={<Purchases r={r} thisMonth={thisMonth} rec="checking" />}>
            <CheckedPurchases r={r} thisMonth={thisMonth} familyId={familyId} />
          </Suspense>
          <RulesHistory grants={r.grants} />
          <Seam kinds={["sandbox"]} />
        </div>
        <div className="g-stack">
          <CheckIn v={v} r={r} now={now} />
          {v.release && <ReleaseCard zoe={zoe} release={v.release} />}
          <section className="g-card" aria-labelledby="ask-h">
            <h2 className="g-label" id="ask-h">Ask about the month</h2>
            <AskBox />
          </section>
          <Investments r={r} />
        </div>
      </div>
    </GuardianShell>
  );
}

async function CheckedPurchases({ r, thisMonth, familyId }: { r: RecordView; thisMonth: string; familyId: string }) {
  let rec: Reconciliation | "down";
  try {
    rec = await reconcileMonth({ db: await getDb(), paypal: paypalFromEnv() }, familyId, r.month);
  } catch (err) {
    console.error("reconcile: PayPal check failed", err instanceof Error ? err.message : err);
    rec = "down";
  }
  return <Purchases r={r} thisMonth={thisMonth} rec={rec} />;
}

function Purchases({ r, thisMonth, rec }: { r: RecordView; thisMonth: string; rec: Reconciliation | "checking" | "down" }) {
  const prev = shiftMonth(r.month, -1), next = shiftMonth(r.month, 1);
  const { shown, hidden } = shownReceipts(r.receipts);
  const total = shown.reduce((s, p) => s + p.amountCents, 0);
  const orphans = typeof rec === "object" ? rec.flags.filter((f) => f.kind === "paypal_only") : [];
  const setAside = new Set(r.receipts.filter((x) => x.setAside).map((x) => x.captureId));
  const hiddenLine = hiddenNote(hidden, typeof rec === "object" ? rec.flags.filter((f) => setAside.has(f.captureId)).length : 0);
  return (
    <section className="g-card" aria-labelledby="pay-h">
      <div className="g-section__head g-section__head--label">
        <h2 className="g-label" id="pay-h">{formatMonth(r.month)} purchases</h2>
        <span className="g-muted">{shown.length === 1 ? "1 payment" : `${shown.length} payments`} · {formatCents(total)}</span>
      </div>
      <nav aria-label="Month" className="g-head" style={{ gap: 14, marginTop: 4 }}>
        <Link className="g-textlink" href={`/g/activity?month=${prev}`}>‹ {formatMonth(prev)}</Link>
        {r.month < thisMonth && <Link className="g-textlink" href={`/g/activity?month=${next}`}>{formatMonth(next)} ›</Link>}
      </nav>
      {shown.length === 0 && r.unreceipted.length === 0 ? (
        <p className="g-muted" style={{ marginTop: 8 }}>No payments in {formatMonth(r.month)}.</p>
      ) : (
        <ul className="g-rows" style={{ marginTop: 6 }}>
          {r.unreceipted.map((u) => (
            <li key={u.purchaseId}>
              <div className="g-row">
                <span className="g-row__date">{formatDay(u.at)}</span>
                <span><span className="g-row__shop">{u.shop}</span>
                  <ItemsLine items={u.items} />
                  <span className="g-row__how">{u.needsCheck
                    ? "Checking with PayPal. PayPal hasn't shown this payment yet; nothing will be charged twice."
                    : "Paying… no receipt yet. Tether is checking with PayPal."}</span></span>
                <span className="g-row__amt"><Money cents={u.amountCents} /></span>
              </div>
            </li>
          ))}
          {shown.slice().reverse().map((p) => <PaymentRow key={p.captureId} p={p} proof={<Proof p={p} rec={rec} />} />)}
        </ul>
      )}
      {orphans.length > 0 && (
        <ul className="g-flags" style={{ marginTop: 10 }} aria-label="PayPal charges Tether has no receipt for">
          {orphans.map((f) => (
            <li key={f.captureId}>
              <span className="g-chip g-chip--warn">{FLAG_WORDS[f.kind]}</span>
              <div style={{ marginTop: 6 }}><b><Money cents={f.amountCents} /></b> · <code className="g-code">{f.captureId}</code></div>
            </li>
          ))}
        </ul>
      )}
      {orphans.length > 0 && r.unreceipted.length > 0 && (
        <p className="g-note" style={{ marginTop: 6 }}>A payment above that is still settling can show here too, until its receipt arrives.</p>
      )}
      {hiddenLine && <p className="g-note" style={{ marginTop: 8 }}>{hiddenLine}</p>}
      <p className="g-note" style={{ marginTop: 8 }}>
        Each payment keeps its PayPal ID, the single-use permission slip, and the rules version that allowed it. Open &ldquo;Proof&rdquo; on any row.
      </p>
    </section>
  );
}

/** The evidence packet behind one payment, folded under its row. No secrets. */
function Proof({ p, rec }: { p: RecordReceipt; rec: Reconciliation | "checking" | "down" }) {
  const check = checkWords(rec, p.captureId);
  return (
    <details className="g-proof">
      <summary>Proof<span className="g-sr"> for {formatCents(p.amountCents)} at {p.shop}, {formatDay(p.at)}</span></summary>
      <dl className="g-proofbox">
        <dt>PayPal ID</dt><dd><code>{p.captureId}</code></dd>
        <dt>Allowed by</dt><dd>Rules v{p.ruleVersion}, signed by you{p.amaraApproved && <>, and you approved it{p.approvalId && <> (<code>{p.approvalId}</code>)</>}</>}</dd>
        <dt>Permission slip</dt>
        <dd>
          Single use, this cart only, valid {TOKEN_TTL_MS / 60_000} minutes.<br />
          Issued {formatWhen(p.slip.issuedAt)}, valid until {formatWhen(p.slip.expiresAt)}.<br />
          Cart fingerprint: <code>{p.slip.cartHash}</code>
        </dd>
        <dt>Checked against PayPal</dt><dd className={check.ok ? "g-ok" : check.waiting ? "g-muted" : "g-warntext"}>{check.text}</dd>
        <dd className="g-proofbox__wide"><div className="g-clause"><span className="g-clause__lbl">Rules v{p.ruleVersion}, as signed</span>{p.slip.clause}</div></dd>
      </dl>
    </details>
  );
}

function CheckIn({ v, r, now }: { v: ReviewView; r: RecordView; now: Date }) {
  const zoe = v.teenName;
  const promoted = v.latestChange?.by === "engine" ? v.latestChange : null;
  const e = v.evidence;
  const pct = e.allowanceCents > 0 ? Math.round((e.savedCents / e.allowanceCents) * 100) : 0;
  const headline = promoted ? `${zoe} has moved to Level ${promoted.toLevel}.`
    : v.stopped ? "Her rules are stopped." : v.level ? `${zoe} is at Level ${v.level}.` : `${zoe} has no rules yet.`;
  return (
    <section className="g-card" aria-labelledby="checkin-h">
      <h2 className="g-label" id="checkin-h">{formatMonth(now.toISOString().slice(0, 7))} check-in</h2>
      <div style={{ fontWeight: 700, fontSize: 16 }}>{headline}</div>
      <p className="g-muted" style={{ margin: "2px 0 10px" }}>
        {promoted
          ? <>This happened automatically, on evidence. You can change her level in <Link className="g-textlink" href="/g/rules">{zoe}&apos;s rules</Link>.</>
          : <>{v.next && e.weeks > 0 && `${herReason(v.next.reason)} `}The check-in runs at month end, {formatDay(monthEnd(now))}.</>}
      </p>
      {promoted && <WhatChanged from={promoted.fromLevel as Level} to={promoted.toLevel as Level} />}
      {e.weeks === 0 ? <p className="g-muted">No weeks have closed yet.</p> : (
        <>
          <Row k="Weeks inside budget" val={`${e.insideBudget} of ${e.weeks}`} />
          <Row k="Saved" val={<><Money cents={e.savedCents} /> <small>{pct}% of her money</small></>} />
          <Row k="Kept her savings promise" val={`${e.kept} of ${e.weeks}`} />
        </>
      )}
      {r.weeks.length > 0 && (
        <ul className="g-weekbars" style={{ marginTop: 10 }} aria-label="Spent each week">
          {r.weeks.map((w) => (
            <li key={w.weekKey}>
              <span>{w.weekKey.replace(/^\d{4}-/, "")}</span>
              <Bar value={w.spentCents} max={w.allowanceCents} label={`${w.weekKey}: ${formatCents(w.spentCents)} of ${formatCents(w.allowanceCents)}`} />
              <span>{formatCents(w.spentCents)} of {formatCents(w.allowanceCents)}</span>
            </li>
          ))}
        </ul>
      )}
      {v.latestChange && (
        <p className="g-note" style={{ marginTop: 10 }}>
          Last level change: Level {v.latestChange.fromLevel || "—"} → {v.latestChange.toLevel}, by {v.latestChange.by === "engine" ? "the rules, on evidence" : "you"}:{" "}
          &ldquo;{herReason(v.latestChange.reason)}&rdquo;
        </p>
      )}
    </section>
  );
}

function Investments({ r }: { r: RecordView }) {
  const open = r.home.level !== null && LEVELS[r.home.level].investing;
  return (
    <section className="g-card" aria-labelledby="inv-h">
      <h2 className="g-label" id="inv-h">Investments</h2>
      {r.investments.length > 0 ? (
        <ul className="g-needs">
          {r.investments.map((i) => (
            <li key={i.id} style={{ padding: "10px 0" }}>
              <b><Money cents={i.amountCents} /> in {i.symbol}</b>
              <small style={{ display: "block", color: "var(--ink-2)" }}>{INVEST_STATUS[i.status]}</small>
            </li>
          ))}
        </ul>
      ) : <p className="g-muted">{open ? "None yet." : `Opens at Level ${INVESTING_FROM}. ${r.home.teenName} proposes a fund or stock, you approve, and the order goes to her investing account.`}</p>}
      {open && <p className="g-more"><Link className="g-textlink" href="/g/invest">Investing</Link></p>}
    </section>
  );
}

function Row({ k, val }: { k: string; val: React.ReactNode }) {
  return <div className="g-def"><span className="g-def__k">{k}</span><span className="g-def__lead" /><span className="g-def__v">{val}</span></div>;
}

function WhatChanged({ from, to }: { from: Level; to: Level }) {
  if (!LEVELS[from] || !LEVELS[to]) return null;
  return (
    <div className="g-clause g-clause--gold" style={{ marginBottom: 10 }}>
      <span className="g-clause__lbl">What changed</span>
      Weekly limit {formatCents(LEVELS[from].weeklyCents)} → <b>{formatCents(LEVELS[to].weeklyCents)}</b>. {approvalWords(to)}
      {LEVELS[to].investing && !LEVELS[from].investing && " She can now propose investing her savings; you approve each one."}
    </div>
  );
}

const STATUS_CHIP: Record<RecordGrant["status"], { text: string; cls: string }> = {
  active: { text: "Active", cls: "g-chip g-chip--accent" },
  ended: { text: "Ended", cls: "g-chip" },
  stopped: { text: "Stopped", cls: "g-chip g-chip--warn" },
};

function RulesHistory({ grants }: { grants: RecordGrant[] }) {
  return (
    <details className="g-card g-history">
      <summary>Rules history <span className="g-muted">· {grants.length === 1 ? "1 version" : `${grants.length} versions`}</span></summary>
      <p className="g-note" style={{ marginBottom: 8 }}>Every signing and every change makes a new version. The payments above name the version that allowed them.</p>
      {grants.length === 0 ? <p className="g-muted">No rules signed yet.</p> : (
        <table className="g-table g-table--cards">
          <thead><tr><th style={{ width: 150 }}>Period</th><th>Rules</th><th style={{ width: 90 }}>Status</th></tr></thead>
          <tbody>
            {grants.map((g) => (
              <tr key={g.version}>
                <td><b>{formatDay(g.signedAt)} – {formatDay(g.expiresAt)}</b>Rules v{g.version} · Level {g.level}</td>
                <td>{formatCents(g.weeklyCents)}/week · {g.shops.length ? g.shops.join(", ") : "no shops"}</td>
                <td><span className={STATUS_CHIP[g.status].cls}>{STATUS_CHIP[g.status].text}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}
