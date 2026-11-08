import { Suspense } from "react";
import Link from "next/link";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import { getFamily, getLatestGrant } from "@/db/repo";
import { nextMonday, shopsForLevel, thisWeeksCents } from "@/flows/grant";
import { asOf } from "@/engine/ladder";
import { guardianHome } from "@/flows/home";
import { guardianShops } from "@/flows/shops";
import type { Level } from "@/engine/ladder";
import { formatDay, stoppedWords, weekChangeWords } from "@/ui/grantWords";
import { RetirementNotice } from "@/ui/RetirementNotice";
import { GuardianLoading, GuardianShell, SignedOut } from "@/ui/guardian";
import { appBaseUrl } from "../connect-paypal/setup";
import { ResetLink } from "../ResetLink";
import { TeenLink } from "../TeenLink";
import { GrantEditor } from "./GrantEditor";
import { StopRules } from "./RulesControls";
import { ShopsSection } from "./ShopsSection";

const WEEK_MS = 7 * 86_400_000;

// The consent surface: no AI, no suggestions, no chat. Reads like a contract. Every change confirms first.
export default function RulesPage({ searchParams }: PageProps<"/g/rules">) {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <Rules searchParams={searchParams} />
    </Suspense>
  );
}

function flash(sp: Record<string, string | string[] | undefined>, zoe: string): { text: string; warn?: boolean } | null {
  const stopped = typeof sp.stopped === "string" ? stoppedWords(sp.stopped, zoe) : null; // Stop now lands on /g/statement
  if (stopped) return stopped;
  if (typeof sp.level === "string" && /^[123]$/.test(sp.level)) return { text: `${zoe} is now at Level ${sp.level}. Your reason is on the record.` };
  if (sp.link === "reset") return { text: "The old link has stopped working. Send the new one." };
  return null;
}

async function Rules({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const familyId = await guardianFamilyId();
  if (!familyId) return <SignedOut />;
  const db = await getDb();
  const now = await clockNow(db, familyId);
  const [h, cur, l1, l2, l3, shops, fam] = await Promise.all([
    guardianHome(db, familyId, now), getLatestGrant(db, familyId), // after a stop she keeps her level
    shopsForLevel(db, familyId, 1, now), shopsForLevel(db, familyId, 2, now), shopsForLevel(db, familyId, 3, now),
    guardianShops(db, familyId, now), getFamily(db, familyId),
  ]);
  const zoe = h.teenName;
  const note = flash(await searchParams, zoe);
  const stopped = cur?.status === "revoked";
  const startsOn = nextMonday(now);
  const thisWeek = thisWeeksCents(cur, now); // this week's allowance under the rules covering it (null: none do)
  // A weekly change signed this week that waits for Monday (decision 029).
  const waiting = cur && thisWeek !== null && asOf(cur.body, now).weeklyCents !== cur.body.weeklyCents
    ? weekChangeWords({ teenName: zoe, fromCents: thisWeek, toCents: cur.body.weeklyCents, spentCents: h.spentThisWeekCents, promisedCents: 0, startsOn }).later
    : null;
  const sub = shops.inForce && h.expiresAt
    ? `In force until ${formatDay(h.expiresAt)}. Every change asks you to confirm, then applies at once.`
    : stopped ? "Stopped. Sign new rules below when you're ready." : `Not in force. Sign them below so ${zoe} can spend.`;

  return (
    <GuardianShell active="rules" teenName={zoe} needs={h.needsYou.length}>
      <div className="g-head g-head--base">
        <h1 className="g-title">{zoe}&apos;s rules</h1>
        {cur && <span className="g-chip">Version {cur.version}</span>}
        {stopped && <span className="g-chip g-chip--warn">Rules stopped</span>}
        <span className="g-sub">{sub}</span>
      </div>
      {note && <p className={note.warn ? "g-flash g-flash--warn" : "g-flash"} role="status">{note.text}</p>}
      {waiting && <p className="g-flash" data-testid="weekly-waits">{waiting}</p>}
      <RetirementNotice removesAt={h.removesAt} statementLink />

      <GrantEditor
        teenName={zoe}
        currentLevel={cur ? (cur.level as Level) : null}
        floorPct={cur?.body.commitmentFloorPct ?? 10}
        matchPct={cur?.body.matchPct ?? 100}
        inForce={shops.inForce}
        inForceUntil={h.expiresAt?.toISOString() ?? null}
        shops={{ 1: l1, 2: l2, 3: l3 }}
        expiresAt={new Date(now.getTime() + WEEK_MS).toISOString()}
        paypalSaved={h.paypalSaved}
        week={{ thisWeekCents: thisWeek, spentCents: h.spentThisWeekCents, startsOn: startsOn.toISOString(), commitmentCents: fam?.commitmentCents ?? 0 }}
        shopsSlot={<ShopsSection teenName={zoe} inForce={shops.inForce} shops={shops.shops} />}
        sideSlot={
          <>
            <section className="g-card g-section g-stopcard" aria-labelledby="stop-h">
              <div className="g-section__head"><h2 id="stop-h">Stop {zoe}&apos;s rules</h2></div>
              {stopped ? (
                <p className="g-muted">Her rules are stopped. Sign new ones on this page when you&apos;re ready. <Link className="g-textlink" href="/g/statement">See what you&apos;ve promised her</Link>.</p>
              ) : (
                <>
                  <p className="g-muted">Ends her rules at once. Nothing more can be charged. This week still counts as promised. You can sign new ones any time.</p>
                  <StopRules teenName={zoe} demo={h.isDemo} />
                </>
              )}
            </section>
            <section className="g-card" aria-labelledby="link-h">
              <h2 className="g-label" id="link-h" style={{ display: "block", marginBottom: 8 }}>{zoe}&apos;s way in</h2>
              <TeenLink url={`${appBaseUrl()}/t/${h.teenToken}`} teenName={zoe} />
              <ResetLink teenName={zoe} />
            </section>
          </>
        }
      />
    </GuardianShell>
  );
}
