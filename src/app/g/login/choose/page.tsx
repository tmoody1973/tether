import { Suspense } from "react";
import Image from "next/image";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { START_COOKIE, openStart } from "@/auth/start";
import { getDb } from "@/db/client";
import { ownedFamilies } from "@/flows/start";
import { GuardianLoading, SignedOut } from "@/ui/guardian";
import "@/ui/start.css";

// "Which teen?": this PayPal owns more than one family. Each button posts to /g/login/choose/open, which re-checks ownership.
export default function ChoosePage() {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <Choose />
    </Suspense>
  );
}

async function Choose() {
  await connection();
  const who = openStart((await cookies()).get(START_COOKIE)?.value, new Date());
  if (!who) return <SignedOut login="expired" />;
  const families = await ownedFamilies(await getDb(), who.sub);
  return (
    <div className="g-app">
      <main className="g-gate">
        <div className="g-card s-card">
          <div className="g-brand" style={{ justifyContent: "center" }}><Image className="g-brand__logo" src="/brand/tether-horizontal-color.svg" alt="Tether" width={106} height={32} priority /></div>
          <h1>Which teen?</h1>
          <p>Your PayPal has more than one family on Tether.</p>
          <ul className="s-choices">
            {families.map((f) => (
              <li key={f.id}>
                <form method="post" action="/g/login/choose/open">
                  <input type="hidden" name="familyId" value={f.id} />
                  <button type="submit" className="g-btn g-btn--ghost g-btn--block">{f.teenName}</button>
                </form>
              </li>
            ))}
          </ul>
          {families.length === 0 && <p className="g-note">None of them can be opened any more. <a className="g-textlink" href="/g/login/paypal">Log in with PayPal</a> to start again.</p>}
        </div>
      </main>
    </div>
  );
}
