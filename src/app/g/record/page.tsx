import { Suspense } from "react";
import Link from "next/link";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import { paypalFromEnv } from "@/adapters/paypal/http";
import { guardianRecord, type RecordGrant, type RecordReceipt, type RecordView } from "@/flows/record";
import { FLAG_WORDS, LAG_NOTE, MONTH_RE, reconcileMonth, type Reconciliation } from "@/flows/reconcile";
import { formatCents, formatDay, formatMonth, formatWhen } from "@/ui/grantWords";
import { INVEST_STATUS } from "@/ui/investWords";
import { Bar, GuardianLoading, GuardianShell, Money, SignedOut } from "@/ui/guardian";
import { resumePayingPurchases } from "@/flows/purchase";
import { paymentDeps } from "../flowDeps";
import { AskBox } from "./AskBox";

// Mocks 11 + 14: dashboard on top, audit trail below, the proof behind every payment. Guardian-only.
export default function RecordPage({ searchParams }: PageProps<"/g/record">) {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <Record searchParams={searchParams} />
    </Suspense>
  );
}

const shiftMonth = (month: string, by: number): string => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

async function Record({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const familyId = await guardianFamilyId();
  if (!familyId) return <SignedOut />;
  const db = await getDb();
  const now = await clockNow(db, familyId);
  const thisMonth = now.toISOString().slice(0, 7);
  const asked = (await searchParams).month;
  const month = typeof asked === "string" && MONTH_RE.test(asked) && asked <= thisMonth ? asked : thisMonth;
  await resumePayingPurchases(paymentDeps(db), familyId); // R37: settle any PayPal outcome that was unknown
  const r = await guardianRecord(db, familyId, month, now);
  const h = r.home;
  const approvals = h.needsYou.filter((n) => n.kind === "approval").length;

  return (
    <GuardianShell active="record" teenName={h.teenName} side={
      <>
        <div className="g-side__head">Open</div>
        <div className="g-side__note">{approvals === 0 ? "Nothing waiting" : `${approvals} waiting for you`}</div>
      </>
    }>
      <div>
        <h1 className="g-title">The record</h1>
        <p className="g-muted" style={{ marginTop: 4 }}>Everything you&apos;ve authorised, and the proof behind each payment.</p>
      </div>

      <div className="g-grid4">
        <Stat k="This week" n={<Money cents={h.spentThisWeekCents} />} sub={`of ${formatCents(h.weeklyCents)}`} />
        <Stat k="Level" n={h.level ?? "—"} sub={h.grantVersion ? `Rules v${h.grantVersion}` : "no rules in force"} />
        <Stat k="Saved" n={<Money cents={h.savingsCents} />} sub={h.goal ? `of ${formatCents(h.goal.targetCents)} goal` : "stays in your PayPal"} />
        <Stat k="Needs you" n={approvals} sub={approvals === 0 ? "nothing pending" : <Link className="g-textlink" href="/g">see what&apos;s waiting</Link>} />
      </div>

      <div className="g-record">
        <div className="g-stack">
          <Payments r={r} thisMonth={thisMonth} />
          <Grants grants={r.grants} />
        </div>
        <div className="g-stack">
          <section className="g-card" aria-labelledby="recon-h">
            <h2 className="g-label" id="recon-h">Checked against PayPal</h2>
            <Suspense fallback={<p className="g-note">Checking {formatMonth(month)} against PayPal…</p>}>
              <Reconcile familyId={familyId} month={month} />
            </Suspense>
          </section>
          <section className="g-card" aria-labelledby="ask-h">
            <h2 className="g-label" id="ask-h">Ask about the month</h2>
            <AskBox />
          </section>
          <WeeklySpend weeks={r.weeks} />
          {r.investments.length > 0 && (
            <section className="g-card" aria-labelledby="inv-h">
              <h2 className="g-label" id="inv-h">Investments</h2>
              <ul className="g-needs">
                {r.investments.map((i) => (
                  <li key={i.id} style={{ padding: "10px 0" }}>
                    <b><Money cents={i.amountCents} /> in {i.symbol}</b>
                    <small style={{ display: "block", color: "var(--ink-2)" }}>{INVEST_STATUS[i.status]}</small>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </GuardianShell>
  );
}

function Stat({ k, n, sub }: { k: string; n: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="g-stat">
      <div className="g-stat__k">{k}</div>
      <div className="g-stat__n">{n}</div>
      <div className="g-stat__sub">{sub}</div>
    </div>
  );
}

function Payments({ r, thisMonth }: { r: RecordView; thisMonth: string }) {
  const prev = shiftMonth(r.month, -1), next = shiftMonth(r.month, 1);
  return (
    <section className="g-card" aria-labelledby="pay-h">
      <div className="g-head" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <h2 className="g-label" id="pay-h">Payments · {formatMonth(r.month)}</h2>
        <nav aria-label="Month" className="g-head" style={{ gap: 14 }}>
          <Link className="g-textlink" href={`/g/record?month=${prev}`}>‹ {formatMonth(prev)}</Link>
          {r.month < thisMonth && <Link className="g-textlink" href={`/g/record?month=${next}`}>{formatMonth(next)} ›</Link>}
        </nav>
      </div>
      {r.receipts.length === 0 && r.unreceipted.length === 0 ? (
        <p className="g-muted">No payments in {formatMonth(r.month)}.</p>
      ) : (
        <table className="g-table g-table--cards">
          <thead><tr><th style={{ width: 110 }}>When</th><th style={{ width: 150 }}>Shop</th><th>Allowed by</th><th style={{ width: 150 }}>Proof</th></tr></thead>
          <tbody>
            {r.unreceipted.map((u) => (
              <tr key={u.purchaseId}>
                <td>{formatWhen(u.at)}</td>
                <td><b>{u.shop}</b><Money cents={u.amountCents} /></td>
                <td colSpan={2}>
                  {u.needsCheck
                    ? <><span className="g-chip g-chip--warn">Checking with PayPal</span> <span className="g-muted">PayPal hasn&apos;t shown this payment yet; nothing will be charged twice.</span></>
                    : <><span className="g-chip">Paying… no receipt yet</span> <span className="g-muted">Tether is checking with PayPal.</span></>}
                </td>
              </tr>
            ))}
            {r.receipts.map((p) => <PaymentRow key={p.captureId} p={p} />)}
          </tbody>
        </table>
      )}
      <p className="g-note" style={{ marginTop: 10 }}>Every payment keeps its permission slip attached — exportable if a charge is ever questioned.</p>
    </section>
  );
}

/** A payment row, and under it the evidence packet as an expandable full-width row (UX plan §1280). */
function PaymentRow({ p }: { p: RecordReceipt }) {
  return (
    <>
      <tr className="g-row--main">
        <td>{formatWhen(p.at)}</td>
        <td><b>{p.shop}</b><Money cents={p.amountCents} />{p.status === "paying" && <> · <span className="g-chip">Paying…</span></>}</td>
        <td>{p.amaraApproved ? <>You approved it · Rules v{p.ruleVersion}</> : <>Within Rules v{p.ruleVersion}</>}</td>
        <td className="g-proof"><span className="g-muted">PayPal capture</span><br /><code>{p.captureId}</code></td>
      </tr>
      <tr>
        <td colSpan={4} style={{ paddingTop: 0 }}>
          <details className="g-slip">
            <summary>View permission slip</summary>
            <div className="g-slip__body">
              <div className="g-clause"><span className="g-clause__lbl">Rules v{p.ruleVersion}, as signed</span>{p.slip.clause}</div>
              Cart fingerprint: <code>{p.slip.cartHash}</code><br />
              Single-use slip issued {formatWhen(p.slip.issuedAt)}, valid until {formatWhen(p.slip.expiresAt)}
              {p.approvalId && <><br />Your approval: <code>{p.approvalId}</code></>}
            </div>
          </details>
        </td>
      </tr>
    </>
  );
}

const STATUS_CHIP: Record<RecordGrant["status"], { text: string; cls: string }> = {
  active: { text: "Active", cls: "g-chip g-chip--accent" },
  ended: { text: "Ended", cls: "g-chip" },
  stopped: { text: "Stopped", cls: "g-chip g-chip--warn" },
};

function Grants({ grants }: { grants: RecordGrant[] }) {
  return (
    <section className="g-card" aria-labelledby="grants-h">
      <h2 className="g-label" id="grants-h">Grants</h2>
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
    </section>
  );
}

/** Guardian-only (D12): one bar per closed week, spending against that week's allowance. */
function WeeklySpend({ weeks }: { weeks: RecordView["weeks"] }) {
  if (weeks.length === 0) return null;
  return (
    <section className="g-card" aria-labelledby="weeks-h">
      <h2 className="g-label" id="weeks-h">Weekly spending</h2>
      <ul className="g-weekbars">
        {weeks.map((w) => (
          <li key={w.weekKey}>
            <span>{w.weekKey.replace(/^\d{4}-/, "")}</span>
            <Bar value={w.spentCents} max={w.allowanceCents} label={`${w.weekKey}: ${formatCents(w.spentCents)} of ${formatCents(w.allowanceCents)}`} />
            <span>{formatCents(w.spentCents)} of {formatCents(w.allowanceCents)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Reconcile({ familyId, month }: { familyId: string; month: string }) {
  let rec: Reconciliation;
  try {
    rec = await reconcileMonth({ db: await getDb(), paypal: paypalFromEnv() }, familyId, month);
  } catch (err) {
    console.error("reconcile: PayPal check failed", err instanceof Error ? err.message : err);
    return <p className="g-muted">Couldn&apos;t reach PayPal to check this month. Your receipts are unchanged; try again later.</p>;
  }
  if (rec.flags.length === 0) {
    return (
      <p style={{ color: "var(--ink-2)" }}>
        {rec.receiptsChecked === 0 ? "No payments to check this month." : `All ${rec.receiptsChecked} payments match PayPal's own list.`}
      </p>
    );
  }
  return (
    <ul className="g-flags">
      {rec.flags.map((f) => (
        <li key={`${f.kind}-${f.captureId}`}>
          <span className="g-chip g-chip--warn">{FLAG_WORDS[f.kind]}</span>
          <div style={{ marginTop: 6 }}>
            <b><Money cents={f.amountCents} /></b>{"shop" in f && <> at {f.shop}</>} · <code className="g-code">{f.captureId}</code>
          </div>
          {f.kind === "unconfirmed" && <p className="g-note">{LAG_NOTE}</p>}
        </li>
      ))}
    </ul>
  );
}
