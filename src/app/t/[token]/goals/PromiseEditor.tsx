"use client";

import { useActionState, useState } from "react";
import { formatCents } from "@/ui/grantWords";
import { PendingButton } from "@/ui/PendingButton";
import { promiseAction, type PromiseState } from "./actions";

const STEP = 100; // $1

/** Mock 3's "Your rule": −/+ in $1 steps. Below Amara's floor it says the minimum and can't be saved. */
export function PromiseEditor({ token, chosenCents, inForceCents, floorCents, maxCents, pending, canChange }: {
  token: string; chosenCents: number; inForceCents: number; floorCents: number; maxCents: number; pending: boolean; canChange: boolean;
}) {
  const [cents, setCents] = useState(chosenCents);
  const [state, action] = useActionState<PromiseState, FormData>(promiseAction, {});
  const below = cents < floorCents;
  const changed = cents !== chosenCents;
  return (
    <form action={action} aria-labelledby="promise-h">
      <h2 className="t-eyebrow" id="promise-h" style={{ marginBottom: 7 }}>Your rule</h2>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="cents" value={cents} />
      <div className="t-stepper">
        <div>
          <div className="t-stepper__k">I&apos;ll save each week</div>
          <div className="t-stepper__val" aria-live="polite">{formatCents(cents)}</div>
        </div>
        {canChange && (
          <div className="t-stepper__ctrl">
            <button type="button" className="t-step" aria-label="Save $1 less each week" disabled={cents <= 0} onClick={() => setCents((c) => Math.max(0, c - STEP))}>−</button>
            <button type="button" className="t-step" aria-label="Save $1 more each week" disabled={cents + STEP > maxCents} onClick={() => setCents((c) => Math.min(maxCents, c + STEP))}>+</button>
          </div>
        )}
      </div>
      {below && <p className="t-flash t-flash--warn" role="alert" style={{ marginTop: 10 }}>At least {formatCents(floorCents)} a week</p>}
      {!below && state.error && <p className="t-flash t-flash--warn" role="alert" style={{ marginTop: 10 }}>{state.error}</p>}
      {changed && !below && (
        <div style={{ marginTop: 10 }}><PendingButton label="Save my promise" pendingLabel="Saving…" className="t-btn t-btn--primary" /></div>
      )}
      {!changed && pending && (
        <p className="t-small" role="status" style={{ marginTop: 10 }}>
          <span className="t-chip t-chip--needs">From next week</span> This week you&apos;re still on {formatCents(inForceCents)}.
        </p>
      )}
    </form>
  );
}
