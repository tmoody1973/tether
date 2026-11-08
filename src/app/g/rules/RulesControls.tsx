"use client";

import { FamilyField } from "@/ui/FamilyField";
import { useState } from "react";
import { STOP_CONFIRM, STOP_CONFIRM_DEMO } from "@/ui/grantWords";
import { revokeAction } from "../actions";

/** Stop Zoe's rules, with the same plain confirm step as signing. */
export function StopRules({ teenName, demo }: { teenName: string; demo: boolean }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="g-btn g-btn--warn g-btn--block" onClick={() => setConfirming(true)}>
        Stop {teenName}&apos;s rules
      </button>
    );
  }
  return (
    <form action={revokeAction} role="group" aria-label="Confirm stop">
      <FamilyField />
      <p style={{ marginBottom: 6, fontWeight: 600 }}>Stop {teenName}&apos;s rules now?</p>
      <p style={{ marginBottom: 10 }}>{demo ? STOP_CONFIRM_DEMO : STOP_CONFIRM}</p>
      <div className="g-btnrow">
        <button type="submit" className="g-btn" autoFocus>Yes, stop them</button>
        <button type="button" className="g-btn g-btn--ghost" onClick={() => setConfirming(false)}>Keep them</button>
      </div>
    </form>
  );
}
