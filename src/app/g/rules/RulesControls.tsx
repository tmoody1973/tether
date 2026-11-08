"use client";

import { FamilyField } from "@/ui/FamilyField";
import { useState } from "react";
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
      <p style={{ marginBottom: 10, fontWeight: 600 }}>
        Stop {teenName}&apos;s rules now? She can&apos;t spend anything until you sign new ones{demo
          ? ". Demo: your saved PayPal is kept so the next person can try it."
          : ", and Tether asks PayPal to remove your saved wallet."}
      </p>
      <div className="g-btnrow">
        <button type="submit" className="g-btn" autoFocus>Yes, stop them</button>
        <button type="button" className="g-btn g-btn--ghost" onClick={() => setConfirming(false)}>Keep them</button>
      </div>
    </form>
  );
}
