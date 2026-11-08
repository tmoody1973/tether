import { Suspense } from "react";
import { INVESTING_FROM } from "@/engine/ladder";
import Link from "next/link";
import { pageHoldings } from "@/app/g/flowDeps";
import { HerInvestments } from "./HerInvestments";
import { eq } from "drizzle-orm";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import * as t from "@/db/schema";
import { STAND_IN_LABEL } from "@/adapters/alpaca/broker";
import { guardianHome } from "@/flows/home";
import { allowedFunds } from "@/flows/teenInvest";
import { formatCents } from "@/ui/grantWords";
import { GuardianLoading, GuardianShell, SignedOut } from "@/ui/guardian";
import { FundFactsLine } from "./FundFacts";
import { Seam } from "@/ui/Seam";

// Amara's investing list (funds and stocks): Tether recommends nothing. One is on it because she signed it into her rules or approved Zoe's proposal.
export default function InvestPage() {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <Invest />
    </Suspense>
  );
}

async function Invest() {
  const familyId = await guardianFamilyId();
  if (!familyId) return <SignedOut />;
  const db = await getDb();
  const [h, funds] = await Promise.all([
    guardianHome(db, familyId, await clockNow(db, familyId)), // expires stale asks first (M3), so the list below is current
    allowedFunds(db, familyId), // her signed rules plus the funds she approved since
  ]);
  const investments = await db.select().from(t.investments).where(eq(t.investments.familyId, familyId));
  const zoe = h.teenName;
  const proposals = h.needsYou.flatMap((n) => (n.kind === "approval" && (n.subject === "fund" || n.subject === "investment") ? [n] : []));
  const custodial = process.env.ALPACA_CUSTODIAL_ENABLED === "true";

  return (
    <GuardianShell active="invest" teenName={zoe} needs={h.firstRun?.some((s) => !s.done) ? h.firstRun.filter((s) => !s.done).length : h.needsYou.length}>
      <h1 className="g-title">Investing</h1>
      {!custodial && <div className="g-card"><Seam>{STAND_IN_LABEL}</Seam></div>}

      <div className="g-two">
        <div className="g-stack">
          <section className="g-card" aria-labelledby="funds-h">
            <h2 className="g-label" id="funds-h">Your investing list</h2>
            {funds.length === 0 ? (
              <p className="g-muted">
                Nothing on it yet. When {zoe} finds a fund or stock she wants, she proposes it and you decide. Tether suggests nothing.
              </p>
            ) : (
              <ul className="g-needs">
                {funds.map((symbol) => (
                  <li key={symbol} style={{ padding: "12px 2px" }}>
                    <b>{symbol}</b>
                    <FundFactsLine symbol={symbol} />
                  </li>
                ))}
              </ul>
            )}
            <p className="g-note" style={{ marginTop: 10 }}>Facts from Alpaca&apos;s market data, in fixed sentences. No ranking, no advice.</p>
          </section>

          {proposals.length > 0 && (
            <section className="g-card" aria-labelledby="props-h">
              <h2 className="g-label" id="props-h">Waiting for you</h2>
              <ul className="g-needs">
                {proposals.map((p) => (
                  <li key={p.id}><Link href={`/g/requests/${p.id}`}>
                    <span>{p.subject === "fund"
                      ? `${zoe} proposes adding ${p.symbol ?? "a fund or stock"} to your investing list`
                      : `${zoe} proposes investing ${p.amountCents !== undefined ? formatCents(p.amountCents) : ""} in ${p.symbol ?? "a fund or stock"}`}</span>
                  </Link></li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="g-card" aria-labelledby="inv-h">
          <h2 className="g-label" id="inv-h">{zoe}&apos;s investments</h2>
          {investments.length === 0 ? <p className="g-muted">None yet. Investing opens at Level {INVESTING_FROM}, and each one needs your OK.</p> : (
            <HerInvestments investments={investments} holdings={pageHoldings(db, familyId)} zoe={zoe} />
          )}
        </section>
      </div>
    </GuardianShell>
  );
}
