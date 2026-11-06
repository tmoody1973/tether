import { Suspense } from "react";
import Link from "next/link";
import { teenSession } from "@/auth/teen";
import { now as clockNow } from "@/clock/clock";
import { askable, openAsk, teenPurchase, teenWeek } from "@/flows/teen";
import { formatCents } from "@/ui/grantWords";
import { PendingButton } from "@/ui/PendingButton";
import { LinkGone, TeenLoading, TeenShell } from "@/ui/teen";
import { askAction } from "../../actions";
import { NotShopping } from "../../NotShopping";

// Mock 4: a request carries her week, not just the ask.
export default function AskPage({ params }: PageProps<"/t/[token]/ask/[purchaseId]">) {
  return (
    <Suspense fallback={<TeenLoading />}>
      <Ask params={params} />
    </Suspense>
  );
}

async function Ask({ params }: { params: Promise<{ token: string; purchaseId: string }> }) {
  const { token, purchaseId } = await params;
  const session = await teenSession(token);
  if (!session) return <LinkGone />;
  const { db, fam } = session;
  const [w, p] = await Promise.all([teenWeek(db, fam.id, await clockNow(db, fam.id)), teenPurchase(db, fam.id, purchaseId)]);
  const g = w.guardianName;
  if (w.state !== "active") return <TeenShell token={token} active="shop" level={w.level} center><NotShopping w={w} /></TeenShell>;
  const kind = p ? askable(p) : null;
  if (!p || !kind) {
    return (
      <TeenShell token={token} active="shop" level={w.level} center>
        <h1 className="t-h2">That one can&apos;t be asked about any more.</h1>
        <Link className="t-btn t-btn--ghost" href={`/t/${token}/shop`}>Back to Shop</Link>
      </TeenShell>
    );
  }
  const already = kind === "request" && await openAsk(db, fam.id, p.id);
  const oneOff = kind === "request" && p.status === "refused"; // R40: over budget, and only that
  const left = formatCents(w.leftCents);
  return (
    <TeenShell token={token} active="shop" level={w.level}>
      <h1 className="t-eyebrow">Ask {g}</h1>
      <div className="t-card"><div className="t-card__k">What</div><div style={{ fontWeight: 650, marginTop: 3 }}>{p.title} · {p.shop}</div></div>
      <div className="t-card"><div className="t-card__k">How much</div><div className="money" style={{ fontSize: 30, fontWeight: 800, marginTop: 3 }}>{formatCents(p.amountCents)}</div></div>
      {already ? (
        <p className="t-flash" role="status">You&apos;ve asked. {g} will see it, with what you have left this week.</p>
      ) : (
        <form action={askAction} className="t-form">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="purchaseId" value={p.id} />
          <label className="t-label" htmlFor="reason">Why (optional)</label>
          <textarea id="reason" name="reason" className="t-input" rows={3} maxLength={200} placeholder="the ones I have are falling apart" />
          <p className="t-small">
            {kind === "request"
              ? <>She&apos;ll see that you have <span className="money">{left}</span> left this week, and your reason.</>
              : <>This one is outside your rules, so {g} can&apos;t OK it in Tether and nothing will be charged. She&apos;ll see you asked, that you have <span className="money">{left}</span> left this week, and your reason.</>}
            {oneOff && w.level && w.level < 3 && <> If she says yes, it goes past your week. This week won&apos;t count toward Level {w.level + 1}.</>}
          </p>
          <PendingButton label="Send" pendingLabel="Sending…" className="t-btn t-btn--primary" />
        </form>
      )}
    </TeenShell>
  );
}
