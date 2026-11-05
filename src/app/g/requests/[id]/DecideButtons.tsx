"use client";

import { useFormStatus } from "react-dom";

/** Approve / decline, both disabled while the one tap is being carried out (it may be charging PayPal). */
export function DecideButtons({ approveLabel }: { approveLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <div className="g-btnrow">
      <button type="submit" name="result" value="approved" className="g-btn" disabled={pending}>
        {pending ? "Working…" : approveLabel}
      </button>
      <button type="submit" name="result" value="declined" className="g-btn g-btn--ghost" disabled={pending}>Not this time</button>
    </div>
  );
}
