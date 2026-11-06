import { Suspense } from "react";
import Link from "next/link";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import { guardianHome } from "@/flows/home";
import { requestView, type RequestView } from "@/flows/request";
import { formatCents, formatDay } from "@/ui/grantWords";
import { Bar, GuardianLoading, GuardianShell, Money, SignedOut } from "@/ui/guardian";
import { FundFactsLine } from "../../invest/FundFacts";
import { decideRequestAction } from "../../actions";
import { DecideButtons } from "./DecideButtons";
import { Seam } from "@/ui/Seam";

// Mock 10: one tap, with the budget consequence shown first. Requests arrive as a deep link, not a place.
export default function RequestPage({ params }: PageProps<"/g/requests/[id]">) {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <Request params={params} />
    </Suspense>
  );
}

async function Request({ params }: { params: Promise<{ id: string }> }) {
  const familyId = await guardianFamilyId();
  if (!familyId) return <SignedOut />;
  const { id } = await params;
  const db = await getDb();
  const now = await clockNow(db, familyId);
  // In order, not in parallel: guardianHome expires stale asks first (as on Home), then this request is read.
  const h = await guardianHome(db, familyId, now);
  const v = await requestView(db, familyId, id, now);
  const zoe = h.teenName;
  return (
    <GuardianShell active="home" teenName={zoe} needs={h.needsYou.length}>
      <Link className="g-back" href="/g">‹ Home</Link>
      {v ? <Open v={v} /> : <Closed />}
    </GuardianShell>
  );
}

/** The same calm page for decided, expired, unknown and other families' requests: it never says which. */
function Closed() {
  return (
    <div className="g-request">
      <div className="g-quiet" role="status">
        <div className="g-quiet__big">This request has closed.</div>
        <p>It was already answered, or it ran out of time. Nothing more is needed from you.</p>
      </div>
      <Link className="g-btn g-btn--ghost" href="/g">Back to home</Link>
    </div>
  );
}

function title(v: RequestView): string {
  const zoe = v.teenName;
  if (v.purchase) return `${zoe} is asking for ${formatCents(v.purchase.amountCents)} at ${v.purchase.shop}`;
  if (v.investment) return `${zoe} proposes investing ${formatCents(v.investment.amountCents)} in ${v.investment.symbol}`;
  if (v.fund) return `${zoe} proposes adding ${v.fund.symbol} to your fund list`;
  return `${zoe} suggests a new shop: ${v.shop?.domain}`;
}

function approveLabel(v: RequestView): string {
  if (v.purchase) return `Approve ${formatCents(v.purchase.amountCents)}`;
  if (v.investment) return `Approve ${formatCents(v.investment.amountCents)}`;
  return v.fund ? `Add ${v.fund.symbol}` : "Add this shop";
}

function Consequence({ v }: { v: RequestView }) {
  if (v.purchase) {
    const { leftCents, overCents, amountCents } = v.purchase;
    const after = leftCents - amountCents;
    return (
      <section className="g-card" aria-label="What this does to her week">
        <p style={{ color: "var(--ink-2)" }}>
          She has <b><Money cents={leftCents} /></b> left this week.{" "}
          {overCents > 0
            ? <>This would use the rest and <b><Money cents={overCents} /></b> more.</>
            : <>This would leave <b><Money cents={after} /></b>.</>}
        </p>
        <Bar value={Math.min(amountCents, leftCents)} max={Math.max(leftCents, amountCents)}
          label={`${formatCents(amountCents)} against ${formatCents(leftCents)} left this week`} />
        <div className="g-barlabels">
          <span>{formatCents(leftCents)} available</span>
          {overCents > 0 && <span className="g-over">{formatCents(overCents)} over</span>}
        </div>
        {v.purchase.liftsBudget && overCents > 0 && (
          <p style={{ color: "var(--ink-2)", marginTop: 6 }}>A one-off: this week won&apos;t count toward her next level.</p>
        )}
        <p className="g-note" style={{ marginTop: 6 }}>
          {v.purchase.items.map((i) => `${i.qty > 1 ? `${i.qty} × ` : ""}${i.title}`).join(", ")}
        </p>
      </section>
    );
  }
  if (v.investment) {
    return (
      <section className="g-card" aria-label="What this does to her savings">
        <p style={{ color: "var(--ink-2)" }}>
          She has <b><Money cents={v.investment.savingsCents} /></b> available to invest. This moves <b><Money cents={v.investment.amountCents} /></b> into
          her investing account. Once it&apos;s there it belongs to her and can&apos;t be taken back.
        </p>
        <FundFactsLine symbol={v.investment.symbol} />
      </section>
    );
  }
  if (v.fund) {
    return (
      <section className="g-card" aria-label="What adding this fund means">
        <p style={{ color: "var(--ink-2)" }}>
          Adding <b>{v.fund.symbol}</b> lets {v.teenName} propose investing in it. Nothing is bought now, and each investment still comes to you.
        </p>
        <FundFactsLine symbol={v.fund.symbol} />
      </section>
    );
  }
  return (
    <section className="g-card" aria-label="What adding this shop means">
      <p style={{ color: "var(--ink-2)" }}>
        Adding <b>{v.shop?.domain}</b> lets {v.teenName} buy there inside her rules. Your rules get a new version; nothing else changes.
      </p>
    </section>
  );
}

function Open({ v }: { v: RequestView }) {
  const w = v.lastWeeks;
  return (
    <div className="g-request">
      <div>
        <div className="g-eyebrow">Request</div>
        <h1 className="g-request__title">{title(v)}</h1>
      </div>

      <Consequence v={v} />

      {(v.reason || v.answers.length > 0) && (
        <section className="g-card">
          <h2 className="g-label">{v.answers.length ? "Her answers" : "Her reason"}</h2>
          {v.reason && <p className="g-reason">&ldquo;{v.reason}&rdquo;</p>}
          {v.answers.map(([q, a]) => (
            <p key={q} style={{ marginTop: 6 }}><span className="g-muted">{q}</span><br /><span className="g-reason">&ldquo;{a}&rdquo;</span></p>
          ))}
        </section>
      )}

      <section className="g-card" style={{ background: "#FBFBF9" }}>
        <p style={{ color: "var(--ink-2)" }}>
          {w.count === 0
            ? `This is ${v.teenName}'s first week with Tether.`
            : <>Her last {w.count === 1 ? "week" : `${w.count} weeks`}: <b>inside budget {w.insideBudget} of {w.count}</b>, savings kept {w.kept} of {w.count}.</>}
        </p>
      </section>

      <form action={decideRequestAction} style={{ display: "grid", gap: 9 }}>
        <input type="hidden" name="approvalId" value={v.id} />
        <DecideButtons approveLabel={approveLabel(v)} />
        {v.purchase && <Seam center kinds={["sandbox"]} />}
        <p className="g-note" style={{ textAlign: "center" }}>
          Open until {formatDay(v.expiresAt)}.{" "}
          {v.purchase && <Link className="g-textlink" href="/g/rules">or change her rules instead</Link>}
        </p>
      </form>
    </div>
  );
}
