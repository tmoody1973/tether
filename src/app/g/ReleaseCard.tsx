import type { ReviewView } from "@/flows/month";
import { Money } from "@/ui/guardian";
import { PendingButton } from "@/ui/PendingButton";
import { Seam } from "@/ui/Seam";
import { confirmReleaseAction } from "./actions";

/** "Release to Zoe": what's owed now, sent by Amara herself. On Activity and Savings; `back` = where "I've sent it" returns. */
export function ReleaseCard({ zoe, release, back = "activity" }: {
  zoe: string; release: NonNullable<ReviewView["release"]>; back?: "activity" | "savings";
}) {
  return (
    <section className="g-card" aria-labelledby="release-h" style={{ borderColor: "var(--g-goal)" }}>
      <h2 className="g-label" id="release-h">Release to {zoe}</h2>
      <div className="g-card__figure">
        <Money cents={release.savedCents} /> saved + <Money cents={release.matchCents} /> your match
        = <Money cents={release.savedCents + release.matchCents} />
      </div>
      <p className="g-card__sub">Send it to {zoe} yourself — Venmo, PayPal or cash — then tap below.</p>
      <div style={{ marginTop: 8 }}><Seam kinds={["release"]} /></div>
      <form action={confirmReleaseAction} style={{ marginTop: 12 }}>
        <input type="hidden" name="releaseId" value={release.id} />
        <input type="hidden" name="back" value={back} />
        <PendingButton label="I've sent it" pendingLabel="Recording…" className="g-btn g-btn--block" />
      </form>
    </section>
  );
}
