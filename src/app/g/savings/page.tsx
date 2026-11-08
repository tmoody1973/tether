import { Suspense } from "react";
import Link from "next/link";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import * as t from "@/db/schema";
import { guardianHome, needsCount } from "@/flows/home";
import { monthReviewView } from "@/flows/month";
import { formatDay } from "@/ui/grantWords";
import { GuardianLoading, GuardianShell, Money, SignedOut } from "@/ui/guardian";
import { CHANGE_OR_STOP, SAVINGS_INTRO, recordPayment, savingsFacts } from "@/ui/savingsWords";
import { PromisedCard } from "../PromisedCard";
import { goalPrice } from "@/flows/goalPrice";
import { teenGoals } from "@/flows/teenGoals";
import { PRICE_CHECK_FAILED, goalPriceLine, priceStatusLine } from "@/ui/teenWords";
import { paymentDeps } from "../flowDeps";
import { ReleaseCard } from "../ReleaseCard";

// Savings (decision 028): the amount promised to the teen and the goal, the release owed now, payments recorded, and
// what "savings" means on Tether. A promise on the record, never money held, so it gets its own page apart from Investing.
// Changing the amount and stopping are explained on the rules page (decision 029); /g/statement is the closing statement.
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
      {sent && <p className="g-flash" role="status">Payment to {zoe} recorded. Tether can&apos;t see the money move, and the record says so.</p>}

      <div className="g-two">
        <div className="g-stack">
          <PromisedCard teen={zoe} cents={h.savingsCents} goal={h.goal}>
            {h.goal && <Suspense fallback={null}><GoalPriceFact familyId={familyId} teen={zoe} /></Suspense>}
            <p className="g-more"><Link className="g-textlink" href="/g/statement">Statement</Link></p>
          </PromisedCard>

          {review.release && <ReleaseCard zoe={zoe} release={review.release} back="savings" />}

          <section className="g-card" aria-labelledby="past-h">
            <h2 className="g-label" id="past-h">Payments to {zoe}</h2>
            {past.length === 0 ? <p className="g-muted">No payments recorded yet. A release comes when {zoe} moves up a level.</p> : (
              <ul className="g-rows">
                {past.map((r) => (
                  <li key={r.id}>
                    <b><Money cents={r.savedCents + r.matchCents} /></b>{" "}
                    <span className="g-muted"><Money cents={r.savedCents} /> saved + <Money cents={r.matchCents} /> your match · recorded {formatDay(r.confirmedAt!)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="g-note" style={{ marginTop: 8 }}>&ldquo;Recorded&rdquo; is the day you tapped &ldquo;{recordPayment(zoe)}&rdquo;.</p>
          </section>
        </div>

        <section className="g-card" aria-labelledby="means-h">
          <h2 className="g-label" id="means-h">What &ldquo;savings&rdquo; means</h2>
          <p style={{ marginTop: 8 }}>{SAVINGS_INTRO}</p>
          <div className="g-whatifs" style={{ marginTop: 8 }}>
            {savingsFacts(zoe).map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                {f.a.map((line) => <p key={line}>{line}</p>)}
                {f.q === "Investing is different" && <p><Link className="g-textlink" href="/g/invest">See {zoe}&apos;s investing</Link></p>}
              </details>
            ))}
          </div>
          <p className="g-more"><Link className="g-textlink" href="/g/rules">{CHANGE_OR_STOP}</Link></p>
        </section>
      </div>
    </GuardianShell>
  );
}

/** Decision 031: the same goal-price fact Zoe sees, streamed so it never holds up Amara's page. */
async function GoalPriceFact({ familyId, teen }: { familyId: string; teen: string }) {
  const db = await getDb();
  const g = await teenGoals(db, familyId, await clockNow(db, familyId));
  const goal = g.week.goal;
  if (!goal) return null;
  const price = await goalPrice({ db, channel3: paymentDeps(db).channel3 }, familyId, { channel3ProductId: g.goalProductId });
  if (price.state === "none") return null;
  if (price.state === "failed" || price.todayCents === null) return <p className="g-note" data-testid="goal-price">{PRICE_CHECK_FAILED}</p>;
  return (
    <p className="g-note" data-testid="goal-price">
      {goalPriceLine({ todayCents: price.todayCents, pickedCents: goal.targetCents, savedCents: g.week.savingsCents, commitmentCents: g.pendingCents ?? g.commitmentCents, who: teen })}
      {price.status && <> {priceStatusLine(price.status)}</>}
    </p>
  );
}
