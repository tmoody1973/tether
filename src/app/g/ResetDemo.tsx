"use client";

import { FamilyField } from "@/ui/FamilyField";
import { useState } from "react";
import { PendingButton } from "@/ui/PendingButton";
import { resetDemoAction } from "./actions";

/** Reset demo (D11), with a confirm step: puts the shared demo family back as it was set up. */
export function ResetDemo() {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="g-btn g-btn--ghost g-btn--block" style={{ marginTop: 12 }} onClick={() => setConfirming(true)}>
        Reset demo
      </button>
    );
  }
  return (
    <form action={resetDemoAction} style={{ marginTop: 12 }} role="group" aria-label="Confirm demo reset">
      <FamilyField />
      <p style={{ marginBottom: 10, fontWeight: 600 }}>
        Reset the demo? The clock, rules and requests go back to how they were set up. PayPal charges made since then stay
        on the record but stop counting toward this week.
      </p>
      <div className="g-btnrow">
        <PendingButton label="Yes, reset the demo" pendingLabel="Resetting…" className="g-btn" />
        <button type="button" className="g-btn g-btn--ghost" onClick={() => setConfirming(false)}>Keep it</button>
      </div>
    </form>
  );
}
