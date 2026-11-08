import { Suspense } from "react";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import { getLatestGrant } from "@/db/repo";
import { shopsForLevel } from "@/flows/grant";
import { guardianHome } from "@/flows/home";
import { guardianShops } from "@/flows/shops";
import type { Level } from "@/engine/ladder";
import { formatDay } from "@/ui/grantWords";
import { GuardianLoading, GuardianShell, SignedOut } from "@/ui/guardian";
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

const WALLET_KEPT =
  "Rules stopped. PayPal didn't confirm removing the saved wallet — remove Tether in PayPal settings: Settings → Payments → Automatic payments.";

function flash(sp: Record<string, string | string[] | undefined>, zoe: string): { text: string; warn?: boolean } | null {
  if (sp.stopped === "wallet-removed") return { text: `Rules stopped. ${zoe} can't spend until you sign new ones, and PayPal removed your saved wallet.` };
  if (sp.stopped === "wallet-kept") return { text: WALLET_KEPT, warn: true };
  if (sp.stopped === "demo-kept") return { text: `Rules stopped. ${zoe} can't spend until you sign new ones. Demo: your saved PayPal is kept so the next person can try it.` };
  if (sp.stopped === "no-wallet") return { text: `Rules stopped. ${zoe} can't spend until you sign new ones. There was no saved PayPal to remove.` };
  if (typeof sp.level === "string" && /^[123]$/.test(sp.level)) return { text: `${zoe} is now at Level ${sp.level}. Your reason is on the record.` };
  return null;
}

async function Rules({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const familyId = await guardianFamilyId();
  if (!familyId) return <SignedOut />;
  const db = await getDb();
  const now = await clockNow(db, familyId);
  const [h, cur, l1, l2, l3, shops] = await Promise.all([
    guardianHome(db, familyId, now), getLatestGrant(db, familyId), // after a stop she keeps her level
    shopsForLevel(db, familyId, 1, now), shopsForLevel(db, familyId, 2, now), shopsForLevel(db, familyId, 3, now),
    guardianShops(db, familyId, now),
  ]);
  const zoe = h.teenName;
  const note = flash(await searchParams, zoe);
  const stopped = cur?.status === "revoked";
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
        shopsSlot={<ShopsSection teenName={zoe} inForce={shops.inForce} shops={shops.shops} />}
        sideSlot={
          // The teen's link and its reset moved to Settings (decision 028).
          <>
            <section className="g-card g-section g-stopcard" aria-labelledby="stop-h">
              <div className="g-section__head"><h2 id="stop-h">Stop {zoe}&apos;s rules</h2></div>
              {stopped ? (
                <p className="g-muted">Her rules are stopped. Sign new ones on this page when you&apos;re ready.</p>
              ) : (
                <>
                  <p className="g-muted">Ends her rules at once. Nothing more can be charged. You can sign new ones any time.</p>
                  <StopRules teenName={zoe} demo={h.isDemo} />
                </>
              )}
            </section>
          </>
        }
      />
    </GuardianShell>
  );
}
