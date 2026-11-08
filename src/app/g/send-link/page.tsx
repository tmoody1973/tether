import { Suspense } from "react";
import Link from "next/link";
import { guardianFamilyId } from "@/auth/guardianSession";
import { now as clockNow } from "@/clock/clock";
import { getDb } from "@/db/client";
import { guardianHome, needsCount } from "@/flows/home";
import { GuardianLoading, GuardianShell, SignedOut } from "@/ui/guardian";
import { PendingButton } from "@/ui/PendingButton";
import { QrCode } from "@/ui/QrCode";
import "@/ui/start.css";
import { appBaseUrl } from "../connect-paypal/setup";
import { ResetLink } from "../ResetLink";
import { TeenLink } from "../TeenLink";
import { linkSentAction } from "./actions";

// Step 3 of the first-run checklist (mockup 04a/04b): the teen's link to copy, or a QR code to scan across the table.
export default function SendLinkPage() {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <SendLink />
    </Suspense>
  );
}

async function SendLink() {
  const familyId = await guardianFamilyId();
  if (!familyId) return <SignedOut />;
  const db = await getDb();
  const h = await guardianHome(db, familyId, await clockNow(db, familyId));
  const teen = h.teenName;
  const url = `${appBaseUrl()}/t/${h.teenToken}`;
  return (
    <GuardianShell active={null} teenName={teen} needs={needsCount(h)} familyId={familyId}>
      <Link className="g-back" href="/g">‹ Home</Link>
      <div className="g-head g-head--base">
        <h1 className="g-title">Send {teen} the link</h1>
        {h.firstRun && <span className="g-sub">Step 3 of 3</span>}
      </div>
      <div className="g-two">
        <div className="g-stack">
          <section className="g-card" aria-label={`${teen}'s link`}>
            <TeenLink url={url} teenName={teen} startOpen />
          </section>
          <section className="g-card">
            <ResetLink teenName={teen} />
          </section>
        </div>
        <div className="g-stack">
          <section className="g-card s-qr" aria-labelledby="qr-h">
            <h2 className="g-label" id="qr-h">Or scan it with {teen}&apos;s phone</h2>
            <QrCode text={url} label={`QR code for ${teen}'s link`} />
            <p className="g-note">Point {teen}&apos;s phone camera at this. It opens the link.</p>
          </section>
          <form action={linkSentAction}>
            <PendingButton label="Done" pendingLabel="Saving…" className="g-btn g-btn--block" />
          </form>
        </div>
      </div>
    </GuardianShell>
  );
}
