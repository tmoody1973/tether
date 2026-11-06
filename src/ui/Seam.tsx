import type { ReactNode } from "react";

/** The honesty list, verbatim from the design doc §11: what the demo simulates, said on screen where it applies. */
export const SEAMS = {
  sandbox: "Sandbox only; no real money moves.",
  family: "The family relationship is simulated — PayPal has no notion of it.",
  merchant: "Every charge goes to one stand-in merchant.",
  release: "Savings release is a parent action in Venmo; Tether records it as parent-confirmed.",
  gate2: "Gate 2 thresholds are initial, not calibrated against labelled data.",
  hmac: "Signatures are HMAC with a shared secret, not production key custody.",
  clock: "Demo clock: time is fast-forwarded for the demo.",
} as const;

export type SeamKind = keyof typeof SEAMS;

/** Quiet information, not a warning: one small muted line. `children` adds a sentence of the page's own. */
export function Seam({ kinds = [], children, center }: { kinds?: SeamKind[]; children?: ReactNode; center?: boolean }) {
  return (
    <p className={center ? "seam seam--center" : "seam"} role="note">
      {kinds.map((k) => SEAMS[k]).join(" ")}{kinds.length > 0 && children ? " " : null}{children}
    </p>
  );
}
