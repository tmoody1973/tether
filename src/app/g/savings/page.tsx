import { Suspense } from "react";
import Link from "next/link";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import * as t from "@/db/schema";
import { guardianHome, needsCount } from "@/flows/home";
import { monthReviewView } from "@/flows/month";
import { formatCents, formatDay } from "@/ui/grantWords";
import { Bar, GuardianLoading, GuardianShell, Money, SignedOut } from "@/ui/guardian";
import { savingsFacts, savingsSub } from "@/ui/savingsWords";
import { ReleaseCard } from "../ReleaseCard";

// Savings (decision 028): the teen's savings figure and goal, the release owed now, past releases, and what "savings"
// means on Tether. A promise kept on the record, not money moved, so it gets its own page apart from Investing.
export default function SavingsPage({ searchParams }: PageProps<"/g/savings">) {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <Savings searchParams={searchParams} />
    </Suspense>
  );
}

async function Savings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const familyId = await guardianFamilyId();
  if (!familyId) return <SignedOut />;
  const db = await getDb();
  const [h, review, past] = await Promise.all([
    guardianHome(db, familyId, await clockNow(db, familyId)),
    monthReviewView(db, familyId), // the release owed now, the same read model Activity uses
    db.select().from(t.releases).where(and(eq(t.releases.familyId, familyId), isNotNull(t.releases.confirmedAt)))
      .orderBy(desc(t.releases.confirmedAt)).limit(12),
  ]);
  const zoe = h.teenName;
  const sent = (await searchParams).sent === "1";

  return (
    <GuardianShell active="savings" teenName={zoe} needs={needsCount(h)} familyId={familyId}>
      <h1 className="g-title">{zoe}&apos;s savings</h1>
      {sent && <p className="g-flash" role="status">Recorded as sent by you. Tether can&apos;t see the money move, and the record says so.</p>}

      <div className="g-two">
        <div className="g-stack">
          <section className="g-card" aria-labelledby="saved-h">
            <h2 className="g-label" id="saved-h">{h.goal ? `${zoe}'s savings goal` : "Saved so far"}</h2>
            {h.goal && <div className="g-goal__name">{h.goal.title}</div>}
            <div className="g-figure" style={{ fontSize: 19 }}>
              <Money cents={h.savingsCents} /> <small>{h.goal ? <>of <Money cents={h.goal.targetCents} /> saved</> : "saved"}</small>
            </div>
            {h.goal && <Bar goal value={h.savingsCents} max={h.goal.targetCents}
              label={`${formatCents(h.savingsCents)} saved of ${formatCents(h.goal.targetCents)}`} />}
            <div className="g-card__sub">{savingsSub(zoe)}</div>
          </section>

          {review.release && <ReleaseCard zoe={zoe} release={review.release} back="savings" />}

          <section className="g-card" aria-labelledby="past-h">
            <h2 className="g-label" id="past-h">Paid out to {zoe}</h2>
            {past.length === 0 ? <p className="g-muted">Nothing paid out yet. A release comes when {zoe} moves up a level.</p> : (
              <ul className="g-rows">
                {past.map((r) => (
                  <li key={r.id}>
                    <b><Money cents={r.savedCents + r.matchCents} /></b>{" "}
                    <span className="g-muted"><Money cents={r.savedCents} /> saved + <Money cents={r.matchCents} /> your match · sent {formatDay(r.confirmedAt!)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="g-note" style={{ marginTop: 8 }}>&ldquo;Sent&rdquo; is the day you tapped &ldquo;I&apos;ve sent it&rdquo;.</p>
          </section>
        </div>

        <section className="g-card" aria-labelledby="means-h">
          <h2 className="g-label" id="means-h">What &ldquo;savings&rdquo; means</h2>
          <div className="g-whatifs">
            {savingsFacts(zoe, { demo: h.isDemo }).map((f, i) => (
              <details key={f.q} open={i === 0}>
                <summary>{f.q}</summary>
                {f.a.map((line) => <p key={line}>{line}</p>)}
                {f.q === "Investing is different" && <p><Link className="g-textlink" href="/g/invest">See {zoe}&apos;s investing</Link></p>}
              </details>
            ))}
          </div>
        </section>
      </div>
    </GuardianShell>
  );
}
