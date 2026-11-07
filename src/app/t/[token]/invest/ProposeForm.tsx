"use client";

import { useActionState, useState } from "react";
import { PendingButton } from "@/ui/PendingButton";
import { parseDollars } from "@/ui/grantWords";
import { ANSWER_MAX, ANSWER_MIN, QUESTIONS } from "@/ui/investQuestions";
import { shareLine, shareWords } from "@/ui/investWords";
import { proposeAction, type ProposeState } from "./actions";

/**
 * D16's "Ask yourself…" questions, answered in her own words: they ARE the proposal Amara reads.
 * She asks in dollars; `price` (the latest close, cents) turns what she types into a share count as she types.
 */
export function ProposeForm({ token, symbol, guardian, price, fractionable }: {
  token: string; symbol: string; guardian: string; price: number | null; fractionable: boolean;
}) {
  const [state, action] = useActionState<ProposeState, FormData>(proposeAction, {});
  const v = state.values ?? {};
  const [amount, setAmount] = useState(v.amount ?? "");
  const cents = parseDollars(amount);
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
      <input id="q-amount" name="amount" className="t-input" inputMode="decimal" required pattern="\$?[0-9,]{1,9}(\.[0-9]{1,2})?" placeholder="5.00" defaultValue={v.amount} onChange={(e) => setAmount(e.target.value)} />
      <div aria-live="polite">
        {price !== null && fractionable && cents !== null && cents > 0 && <p className="t-hint">{shareLine(cents, price, symbol)}</p>}
      </div>
      {price !== null && !fractionable && <p className="t-hint">{shareWords(0, price, false, symbol)}</p>}
      <p className="t-muted">
        At least $1.00, and no more than you&apos;ve saved.{fractionable && " The exact slice is set when the market fills the order."}
      </p>
      {state.error && <p className="t-flash t-flash--warn" role="alert">{state.error}</p>}
      <PendingButton label={`Propose to ${guardian}`} pendingLabel="Sending…" className="t-btn t-btn--primary" />
    </form>
  );
}
