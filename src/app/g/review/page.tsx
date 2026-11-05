import { Suspense } from "react";
import Link from "next/link";
import { guardianFamilyId } from "@/auth/guardianSession";
import { getDb } from "@/db/client";
import { monthReviewView, type ReviewView } from "@/flows/month";
import { LEVELS, type Level } from "@/engine/ladder";
import { approvalWords, formatCents } from "@/ui/grantWords";
import { GuardianLoading, GuardianShell, Money, SignedOut } from "@/ui/guardian";
import { PendingButton } from "@/ui/PendingButton";
import { confirmReleaseAction } from "../actions";
import { LevelOverride, StopRules } from "./ReviewControls";

// Mock 12: promotion arrives with its evidence, and stays overrulable. PRD v0.6: Amara sends the release herself.
export default function ReviewPage({ searchParams }: PageProps<"/g/review">) {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <Review searchParams={searchParams} />
    </Suspense>
  );
}

const WALLET_KEPT =
  "Rules stopped. PayPal didn't confirm removing the saved wallet — remove Tether in PayPal settings: Settings → Payments → Automatic payments.";

function flash(sp: Record<string, string | string[] | undefined>, zoe: string): { text: string; warn?: boolean } | null {
  if (sp.stopped === "wallet-removed") return { text: `Rules stopped. ${zoe} can't spend until you sign new ones, and PayPal removed your saved wallet.` };
  if (sp.stopped === "wallet-kept") return { text: WALLET_KEPT, warn: true };
  if (sp.stopped === "no-wallet") return { text: `Rules stopped. ${zoe} can't spend until you sign new ones. There was no saved PayPal to remove.` };
  if (sp.sent === "1") return { text: "Recorded as sent by you. Tether can't see the money move, and the record says so." };
  if (typeof sp.level === "string" && /^[123]$/.test(sp.level)) return { text: `${zoe} is now at Level ${sp.level}. Your reason is on the record.` };
  if (sp.promoted === "1") return { text: "The month closed and the review ran." };
  return null;
}

async function Review({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const familyId = await guardianFamilyId();
  if (!familyId) return <SignedOut />;
  const v = await monthReviewView(await getDb(), familyId);
  const zoe = v.teenName;
  const note = flash(await searchParams, zoe);
  const promoted = v.latestChange?.by === "engine" ? v.latestChange : null;

  return (
    <GuardianShell active="review" teenName={zoe}>
      <div className="g-head">
        <h1 className="g-title">Monthly review</h1>
        {v.level && <span className="g-chip g-chip--accent">Level {v.level}</span>}
        {v.stopped && <span className="g-chip g-chip--warn">Rules stopped</span>}
      </div>
      {note && <p className={note.warn ? "g-flash g-flash--warn" : "g-flash"} role="status">{note.text}</p>}

      <div className="g-two">
        <div className="g-stack">
          <section className="g-card">
            {promoted ? (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 750 }}>{zoe} has moved to Level {promoted.toLevel}.</h2>
                <p className="g-muted" style={{ marginTop: 6 }}>This happened automatically, on evidence. You can overrule it below.</p>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 750 }}>{v.level ? `${zoe} is at Level ${v.level}.` : `${zoe} has no rules yet.`}</h2>
                {v.next && <p className="g-muted" style={{ marginTop: 6 }}>{v.next.reason}</p>}
              </>
            )}
          </section>

          <Evidence v={v} />

          {promoted && <WhatChanged from={promoted.fromLevel as Level} to={promoted.toLevel as Level} />}

          {v.release && (
            <section className="g-card" aria-labelledby="release-h" style={{ borderColor: "var(--g-goal)" }}>
              <h2 className="g-label" id="release-h">Release to {zoe}</h2>
              <div className="g-card__figure">
                <Money cents={v.release.savedCents} /> saved + <Money cents={v.release.matchCents} /> your match
                = <Money cents={v.release.savedCents + v.release.matchCents} />
              </div>
              <p className="g-card__sub">
                Send it to {zoe} yourself — Venmo, PayPal or cash. Tether doesn&apos;t move this money. When you&apos;ve sent it, tap below;
                the record will say you confirmed it, because Tether can&apos;t see it move.
              </p>
              <form action={confirmReleaseAction} style={{ marginTop: 12 }}>
                <input type="hidden" name="releaseId" value={v.release.id} />
                <PendingButton label="I've sent it" pendingLabel="Recording…" className="g-btn g-btn--block" />
              </form>
            </section>
          )}
        </div>

        <div className="g-stack">
          {v.level && !v.stopped && (
            <section className="g-card" aria-labelledby="override-h">
              <h2 className="g-label" id="override-h">Overrule her level</h2>
              <LevelOverride teenName={zoe} level={v.level} />
            </section>
          )}
          {v.latestChange && (
            <section className="g-card" style={{ background: "#FBFBF9" }}>
              <h2 className="g-label">Last level change</h2>
              <p style={{ color: "var(--ink-2)" }}>
                Level {v.latestChange.fromLevel || "—"} → {v.latestChange.toLevel}, by {v.latestChange.by === "engine" ? "the rules, on evidence" : "you"}:
                &ldquo;{v.latestChange.reason}&rdquo;
              </p>
            </section>
          )}
          <section className="g-card" aria-labelledby="stop-h">
            <h2 className="g-label" id="stop-h">Stop {zoe}&apos;s rules</h2>
            {v.stopped ? (
              <p style={{ color: "var(--ink-2)" }}>
                Her rules are stopped. <Link className="g-textlink" href="/g/grant">Sign new rules</Link> when you&apos;re ready.
              </p>
            ) : (
              <>
                <p className="g-note" style={{ marginBottom: 10 }}>Ends her rules at once. You can sign new ones any time.</p>
                <StopRules teenName={zoe} />
              </>
            )}
          </section>
        </div>
      </div>
    </GuardianShell>
  );
}

function Evidence({ v }: { v: ReviewView }) {
  const e = v.evidence;
  if (e.weeks === 0) {
    return <section className="g-card"><h2 className="g-label">The evidence</h2><p className="g-muted">No weeks have closed yet.</p></section>;
  }
  const pct = e.allowanceCents > 0 ? Math.round((e.savedCents / e.allowanceCents) * 100) : 0;
  return (
    <section className="g-card" aria-labelledby="evidence-h">
      <h2 className="g-label" id="evidence-h">The evidence</h2>
      <Row k="Weeks inside budget" val={`${e.insideBudget} of ${e.weeks}`} />
      <Row k="Saved" val={<><Money cents={e.savedCents} /> <small>{pct}% of allowance</small></>} />
      <Row k="Commitments kept" val={`${e.kept} of ${e.weeks}`} />
    </section>
  );
}

function Row({ k, val }: { k: string; val: React.ReactNode }) {
  return <div className="g-def"><span className="g-def__k">{k}</span><span className="g-def__lead" /><span className="g-def__v">{val}</span></div>;
}

function WhatChanged({ from, to }: { from: Level; to: Level }) {
  if (!LEVELS[from] || !LEVELS[to]) return null;
  return (
    <div className="g-clause g-clause--gold">
      <span className="g-clause__lbl">What changed</span>
      Weekly limit {formatCents(LEVELS[from].weeklyCents)} → <b>{formatCents(LEVELS[to].weeklyCents)}</b>. {approvalWords(to)}
      {LEVELS[to].investing && " She can now propose investing her savings; you approve each one."}
    </div>
  );
}
