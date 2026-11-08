"use client";

// Decision 030: one tap pauses Zoe's spending, one tap resumes it. Not Stop: the rules, the saved PayPal and the week
// stay as they are; while paused every purchase comes to Amara as an ask. Reusable on Home or Settings.
import { useState } from "react";
import { FamilyField } from "@/ui/FamilyField";
import { PendingButton } from "@/ui/PendingButton";
import { pauseConfirmWords, pausedNoteWords } from "@/ui/grantWords";
import { pauseAction } from "./consentActions";

export function PauseControl({ teenName, pausedAt }: { teenName: string; pausedAt: string | null }) {
  const [confirming, setConfirming] = useState(false);
  if (pausedAt) {
    return (
      <form action={pauseAction} className="g-pause">
        <FamilyField />
        <input type="hidden" name="paused" value="0" />
        <p className="g-flash" role="status">{pausedNoteWords(teenName, new Date(pausedAt))}</p>
        <PendingButton label={`Resume ${teenName}'s spending`} pendingLabel="Resuming…" className="g-btn g-btn--block" />
      </form>
    );
  }
  if (!confirming) {
    return <button type="button" className="g-btn g-btn--ghost g-btn--block" onClick={() => setConfirming(true)}>Pause {teenName}&apos;s spending</button>;
  }
  return (
    <form action={pauseAction} role="group" aria-label="Confirm pause" className="g-pause">
      <FamilyField />
      <input type="hidden" name="paused" value="1" />
      <p style={{ fontWeight: 600 }}>{pauseConfirmWords(teenName)}</p>
      <div className="g-btnrow">
        <PendingButton label="Yes, pause" pendingLabel="Pausing…" className="g-btn" />
        <button type="button" className="g-btn g-btn--ghost" onClick={() => setConfirming(false)}>Keep spending on</button>
      </div>
    </form>
  );
}
