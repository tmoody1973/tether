"use client";

import { useActionState } from "react";
import { PendingButton } from "@/ui/PendingButton";
import { ANSWER_MAX, ANSWER_MIN, QUESTIONS } from "@/ui/investQuestions";
import { proposeAction, type ProposeState } from "./actions";

/** D16's "Ask yourself…" questions, answered in her own words: they ARE the proposal Amara reads. */
export function ProposeForm({ token, symbol, guardian }: { token: string; symbol: string; guardian: string }) {
  const [state, action] = useActionState<ProposeState, FormData>(proposeAction, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="t-form t-card" aria-labelledby="ask-h">
      <h2 className="t-label" id="ask-h" style={{ fontSize: 16 }}>Ask yourself</h2>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="symbol" value={symbol} />
      {(Object.keys(QUESTIONS) as (keyof typeof QUESTIONS)[]).map((k) => (
        <div key={k} className="t-form">
          <label className="t-label" htmlFor={`q-${k}`}>{QUESTIONS[k]}</label>
          <textarea id={`q-${k}`} name={k} className="t-input t-textarea" required minLength={ANSWER_MIN} maxLength={ANSWER_MAX} defaultValue={v[k]} />
        </div>
      ))}
      <label className="t-label" htmlFor="q-amount">How much, in dollars?</label>
      <input id="q-amount" name="amount" className="t-input" inputMode="decimal" required pattern="\$?[0-9,]{1,9}(\.[0-9]{1,2})?" placeholder="5.00" defaultValue={v.amount} />
      <p className="t-muted">At least $1.00, and no more than you&apos;ve saved.</p>
      {state.error && <p className="t-flash t-flash--warn" role="alert">{state.error}</p>}
      <PendingButton label={`Propose to ${guardian}`} pendingLabel="Sending…" className="t-btn t-btn--primary" />
    </form>
  );
}
