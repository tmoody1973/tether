"use client";

import { useState } from "react";
import { resetTeenLinkAction } from "./actions";

/** Reset Zoe's link, with the same plain confirm step as signing: the old link dies at once. */
export function ResetLink({ teenName }: { teenName: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <div style={{ marginTop: 12 }}>
        <button type="button" className="g-btn g-btn--ghost g-btn--block" onClick={() => setConfirming(true)}>
          Reset {teenName}&apos;s link
        </button>
        <p className="g-note" style={{ marginTop: 6 }}>If her link gets shared, reset it: the old one stops working at once.</p>
      </div>
    );
  }
  return (
    <form action={resetTeenLinkAction} style={{ marginTop: 12 }} role="group" aria-label="Confirm reset">
      <p style={{ marginBottom: 10, fontWeight: 600 }}>
        Reset {teenName}&apos;s link? Her current link stops working now, and you&apos;ll need to send her the new one.
      </p>
      <div className="g-btnrow">
        <button type="submit" className="g-btn" autoFocus>Yes, reset</button>
        <button type="button" className="g-btn g-btn--ghost" onClick={() => setConfirming(false)}>Keep it</button>
      </div>
    </form>
  );
}
