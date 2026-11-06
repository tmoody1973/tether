"use client";

import { useActionState, useState } from "react";
import type { Level } from "@/engine/ladder";
import { revokeAction, setLevelAction, type LevelState } from "../actions";

/** Amara can overrule any level, either way, but only with a reason: it goes on the record. */
export function LevelOverride({ teenName, level }: { teenName: string; level: Level }) {
  const [state, formAction, pending] = useActionState<LevelState, FormData>(setLevelAction, {});
  const options = ([1, 2, 3] as Level[]).filter((l) => l !== level);
  return (
    <form action={formAction} noValidate style={{ display: "grid", gap: 10 }}>
      <fieldset className="g-fieldset">
        <legend className="g-def__k" style={{ marginBottom: 8 }}>Move {teenName} to</legend>
        <div className="g-choice">
          {options.map((l) => (
            <label key={l}><input type="radio" name="level" value={l} /> Level {l}</label>
          ))}
        </div>
      </fieldset>
      <label className="g-def__k" htmlFor="override-reason">Why? It goes on the record.</label>
      <textarea id="override-reason" name="reason" className="g-textarea" maxLength={500} aria-required="true"
        aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? "override-error" : undefined} />
      {state.error && <p id="override-error" className="g-error" role="alert">{state.error}</p>}
      <button type="submit" className="g-btn g-btn--ghost" disabled={pending}>{pending ? "Changing…" : "Change her level"}</button>
    </form>
  );
}

/** Stop Zoe's rules, with the same plain confirm step as signing. */
export function StopRules({ teenName }: { teenName: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="g-btn g-btn--ghost g-btn--block" onClick={() => setConfirming(true)}>
        Stop {teenName}&apos;s rules
      </button>
    );
  }
  return (
    <form action={revokeAction} role="group" aria-label="Confirm stop">
      <p style={{ marginBottom: 10, fontWeight: 600 }}>
        Stop {teenName}&apos;s rules now? She can&apos;t spend anything until you sign new ones, and Tether asks PayPal to remove your saved wallet.
      </p>
      <div className="g-btnrow">
        <button type="submit" className="g-btn" autoFocus>Yes, stop them</button>
        <button type="button" className="g-btn g-btn--ghost" onClick={() => setConfirming(false)}>Keep them</button>
      </div>
    </form>
  );
}
