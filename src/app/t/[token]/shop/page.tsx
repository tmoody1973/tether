import { Suspense } from "react";
import { teenSession } from "@/auth/teen";
import { now as clockNow } from "@/clock/clock";
import { teenWeek } from "@/flows/teen";
import { formatCents } from "@/ui/grantWords";
import { LinkGone, TeenLoading, TeenShell } from "@/ui/teen";
import { NotShopping } from "../NotShopping";
import { ShopForms } from "./ShopForms";

// F5 / F5b: find something, only inside the shops Amara allowed; every result is labelled by the rule engine.
export default function ShopPage({ params }: PageProps<"/t/[token]/shop">) {
  return (
    <Suspense fallback={<TeenLoading />}>
      <Shop params={params} />
    </Suspense>
  );
}

async function Shop({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await teenSession(token);
  if (!session) return <LinkGone />;
  const { db, fam } = session;
  const w = await teenWeek(db, fam.id, await clockNow(db, fam.id));
  if (w.state !== "active") {
    return (
      <TeenShell token={token} active="shop" center>
        {w.state === "ended"
          ? <><h1 className="t-h2">Your week&apos;s finished.</h1><p className="t-small">Shopping opens again when {w.guardianName} renews your rules.</p></>
          : <NotShopping w={w} />}
      </TeenShell>
    );
  }
  return (
    <TeenShell token={token} active="shop">
      <div>
        <h1 className="t-eyebrow">Shop</h1>
        <p className="t-small" style={{ marginTop: 4 }}><b className="money">{formatCents(w.leftCents)}</b> left this week</p>
      </div>
      <ShopForms token={token} guardian={w.guardianName} />
    </TeenShell>
  );
}
