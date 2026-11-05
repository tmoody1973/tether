import { Suspense } from "react";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import { getLatestGrant } from "@/db/repo";
import { shopsForLevel } from "@/flows/grant";
import { guardianHome } from "@/flows/home";
import type { Level } from "@/engine/ladder";
import { GuardianLoading, GuardianShell, Money, SignedOut } from "@/ui/guardian";
import { GrantEditor } from "./GrantEditor";

const WEEK_MS = 7 * 86_400_000;

// The consent surface: no AI, no suggestions, no chat. Reads like a contract.
export default function GrantPage() {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <Grant />
    </Suspense>
  );
}

async function Grant() {
  const familyId = await guardianFamilyId();
  if (!familyId) return <SignedOut />;
  const db = await getDb();
  const now = await clockNow(db, familyId);
  const [h, cur, l1, l2, l3] = await Promise.all([
    guardianHome(db, familyId, now), getLatestGrant(db, familyId), // after a stop she keeps her level
    shopsForLevel(db, familyId, 1, now), shopsForLevel(db, familyId, 2, now), shopsForLevel(db, familyId, 3, now),
  ]);
  return (
    <GuardianShell active="grant" teenName={h.teenName} side={
      <>
        <div className="g-side__head">This week</div>
        <div className="g-side__note">
          Spent <b><Money cents={h.spentThisWeekCents} /></b> of <Money cents={h.weeklyCents} /><br />
          {h.level ? `Level ${h.level}` : "No rules in force"}
        </div>
      </>
    }>
      <h1 className="g-title">Grant {h.teenName} authority</h1>
      <GrantEditor
        teenName={h.teenName}
        currentLevel={cur ? (cur.level as Level) : null}
        floorPct={cur?.body.commitmentFloorPct ?? 10}
        matchPct={cur?.body.matchPct ?? 100}
        shops={{ 1: l1, 2: l2, 3: l3 }}
        expiresAt={new Date(now.getTime() + WEEK_MS).toISOString()}
        paypalSaved={h.paypalSaved}
      />
    </GuardianShell>
  );
}
