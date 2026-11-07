import { Suspense } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import * as t from "@/db/schema";
import { STAND_IN_LABEL } from "@/adapters/alpaca/broker";
import { guardianHome } from "@/flows/home";
import { allowedFunds } from "@/flows/teenInvest";
import { formatCents } from "@/ui/grantWords";
import { INVEST_STATUS } from "@/ui/investWords";
import { GuardianLoading, GuardianShell, Money, SignedOut } from "@/ui/guardian";
import { FundFactsLine } from "./FundFacts";
import { Seam } from "@/ui/Seam";

// Amara's fund list: Tether recommends nothing. A fund is on it because she signed it into her rules or approved Zoe's proposal.
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
    <GuardianShell active="rules" teenName={zoe}>
      <h1 className="g-title">Investing</h1>
      {!custodial && <div className="g-card"><Seam>{STAND_IN_LABEL}</Seam></div>}

      <div className="g-two">
        <div className="g-stack">
          <section className="g-card" aria-labelledby="funds-h">
            <h2 className="g-label" id="funds-h">Your fund list</h2>
            {funds.length === 0 ? (
              <p className="g-muted">
                No funds yet. When {zoe} finds one she wants, she proposes it and you decide. Tether suggests nothing.
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
                      ? `${zoe} proposes adding ${p.symbol ?? "a fund"}`
                      : `${zoe} proposes investing ${p.amountCents !== undefined ? formatCents(p.amountCents) : ""} in ${p.symbol ?? "a fund"}`}</span>
                  </Link></li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="g-card" aria-labelledby="inv-h">
          <h2 className="g-label" id="inv-h">{zoe}&apos;s investments</h2>
          {investments.length === 0 ? <p className="g-muted">None yet. Investing opens at Level 3, and each one needs your OK.</p> : (
            <ul className="g-needs">
              {investments.map((i) => (
                <li key={i.id} style={{ padding: "10px 2px" }}>
                  <b><Money cents={i.amountCents} /> in {i.symbol}</b>
                  <small style={{ display: "block", color: "var(--ink-2)" }}>{i.status === "expired" ? `Asked too long ago — ${zoe} can ask again.` : INVEST_STATUS[i.status]}</small>
                  {i.receiptNote && <small style={{ display: "block", color: "var(--ink-3-text)" }}>{i.receiptNote}</small>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </GuardianShell>
  );
}
