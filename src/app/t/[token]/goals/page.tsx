import { Suspense } from "react";
import { teenSession } from "@/auth/teen";
import { now as clockNow } from "@/clock/clock";
import { GOAL_TITLE_MAX, teenGoals } from "@/flows/teenGoals";
import { formatCents, matchWords } from "@/ui/grantWords";
import { PendingButton } from "@/ui/PendingButton";
import { Bar, LinkGone, Money, TeenLoading, TeenShell } from "@/ui/teen";
import { SAVINGS_LABEL, savingsPromisedLine, weeksToGoal } from "@/ui/teenWords";
import { goalAction } from "./actions";
import { PromiseEditor } from "./PromiseEditor";

// Mock 3 (adapted): the one number is weeks to goal (D12). Savings is what Amara has promised; nothing is set aside (D1/D3, 029).
export default function GoalsPage({ params, searchParams }: PageProps<"/t/[token]/goals">) {
  return (
    <Suspense fallback={<TeenLoading />}>
      <Goals params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const GOAL_FLASH: Record<string, { text: string; warn?: boolean }> = {
  saved: { text: "Saved your goal." },
  title: { text: `Give your goal a name, up to ${GOAL_TITLE_MAX} characters.`, warn: true },
  target: { text: "Say how much it costs, between $1 and $10,000.", warn: true },
};

async function Goals({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const session = await teenSession(token);
  if (!session) return <LinkGone />;
  const { db, fam } = session;
  const g = await teenGoals(db, fam.id, await clockNow(db, fam.id));
  const w = g.week;
  const sp = await searchParams;
  const flash = typeof sp.goal === "string" ? GOAL_FLASH[sp.goal] : undefined;
  const chosen = g.pendingCents ?? g.commitmentCents; // what she promised from now on
  const weeks = w.goal ? weeksToGoal(w.goal.targetCents, w.savingsCents, chosen) : null;
  const pct = w.goal ? Math.min(100, Math.round((w.savingsCents / w.goal.targetCents) * 100)) : 0;

  return (
    <TeenShell token={token} active="goals" level={w.level}>
      {w.goal ? (
        <div>
          <div className="t-eyebrow">Goals</div>
          <div className="t-hero money">{weeks === null ? "—" : weeks}</div>
          <div className="t-hero-sub">
            {weeks === 0 ? `You've saved enough for ${w.goal.title}.` : weeks === null ? "Set a weekly promise to count the weeks." : `${weeks === 1 ? "week" : "weeks"} to ${w.goal.title}`}
          </div>
        </div>
      ) : (
        <div>
          <h1 className="t-eyebrow">Goals</h1>
          <p className="t-h2" style={{ marginTop: 6 }}>What are you saving for?</p>
        </div>
      )}
      {flash && <p className={flash.warn ? "t-flash t-flash--warn" : "t-flash"} role="status">{flash.text}</p>}

      {w.goal && (
        <section className="t-card" aria-label="Your goal">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <h1 className="t-h2">{w.goal.title}</h1>
            <span className="t-muted" style={{ fontWeight: 650 }}>of <Money cents={w.goal.targetCents} /></span>
          </div>
          <Bar value={w.savingsCents} max={w.goal.targetCents} label={`${SAVINGS_LABEL}: ${formatCents(w.savingsCents)} of ${formatCents(w.goal.targetCents)}`} gold />
          <div className="t-barlabels"><span>{SAVINGS_LABEL} <Money cents={w.savingsCents} /></span><span>{pct}%</span></div>
          <p className="t-small" style={{ marginTop: 10 }}>{savingsPromisedLine(w.guardianName)}</p>
        </section>
      )}
      {!w.goal && (
        <section className="t-card" aria-label={SAVINGS_LABEL}>
          <p className="t-small"><b>{SAVINGS_LABEL}</b> <b><Money cents={w.savingsCents} /></b></p>
          <p className="t-small" style={{ marginTop: 6 }}>{savingsPromisedLine(w.guardianName)}</p>
        </section>
      )}

      <div className="t-card">
        <p className="t-small">
          <b className="money">{formatCents(chosen)} a week</b> from you
          {g.matchPct > 0 ? <> · when you move up a level, {w.guardianName} matches what you saved, <b>{matchWords(g.matchPct)}</b></> : null}
        </p>
      </div>

      <div>
        <PromiseEditor
          token={token} chosenCents={chosen} inForceCents={g.commitmentCents} floorCents={g.floorCents}
          maxCents={g.weeklyCents} pending={g.pendingCents !== null && g.pendingCents !== g.commitmentCents} canChange={w.state === "active"}
        />
        <p className="t-hint" style={{ marginTop: 10 }}>
          Keeping this promise helps you level up. Breaking it won&apos;t block anything — it just pauses your progress.
        </p>
      </div>

      {w.goal ? (
        <details className="t-card">
          <summary>Change your goal</summary>
          <GoalForm token={token} goal={w.goal} />
        </details>
      ) : (
        <section className="t-card" aria-label="Name your goal"><GoalForm token={token} goal={null} /></section>
      )}
    </TeenShell>
  );
}

function GoalForm({ token, goal }: { token: string; goal: { title: string; targetCents: number } | null }) {
  return (
    <form action={goalAction} className="t-form" style={{ marginTop: goal ? 10 : 0 }}>
      <input type="hidden" name="token" value={token} />
      <label className="t-label" htmlFor="goal-title">What it is</label>
      <input id="goal-title" name="title" className="t-input" maxLength={GOAL_TITLE_MAX} required defaultValue={goal?.title} placeholder="Headphones" />
      <label className="t-label" htmlFor="goal-target">How much it costs, in dollars</label>
      <input id="goal-target" name="target" className="t-input" inputMode="decimal" required pattern="\$?[0-9,]{1,9}(\.[0-9]{1,2})?"
        defaultValue={goal ? (goal.targetCents / 100).toFixed(2) : undefined} placeholder="89.00" />
      <PendingButton label={goal ? "Save changes" : "Save my goal"} pendingLabel="Saving…" className="t-btn t-btn--primary" />
    </form>
  );
}
