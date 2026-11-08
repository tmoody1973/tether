import { Suspense } from "react";
import Image from "next/image";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { START_COOKIE, openStart } from "@/auth/start";
import { GuardianLoading } from "@/ui/guardian";
import { PaypalLoginButton } from "@/ui/PaypalLogin";
import { SandboxLogin } from "@/ui/SandboxLogin";
import { demoLinks } from "../../../demoLinks";
import { StartForm } from "./StartForm";

// After Log in with PayPal, for a PayPal with no family yet (mockup 02c, minus "Your PayPal is saved": saving the
// wallet is the first step on Home). Needs the signed starting cookie the PayPal return set.
export default function StartTeenPage({ searchParams }: PageProps<"/g/start/teen">) {
  return (
    <Suspense fallback={<GuardianLoading />}>
      <StartTeen searchParams={searchParams} />
    </Suspense>
  );
}

const PROBLEM: Record<string, string> = {
  name: "Type your teen's first name, in letters.",
  age: "Tether is for teens aged 13 to 17.",
  guardian: "Tick the box to say you're this teen's parent or guardian.",
  browser: "This browser started a family less than an hour ago. Log in with PayPal to open it, or try again later.",
  full: "Today's new families are used up. Try the shared demo family, or come back tomorrow.",
  addfull: "Today's new families are used up, so no teen was added. Nothing changed. Try again tomorrow.",
};

function Gate({ children }: { children: React.ReactNode }) {
  return (
    <div className="g-app">
      <main className="g-gate">
        <div className="g-card s-card">
          <div className="g-brand" style={{ justifyContent: "center" }}><Image className="g-brand__logo" src="/brand/tether-horizontal-color.svg" alt="Tether" width={106} height={32} priority /></div>
          {children}
        </div>
      </main>
    </div>
  );
}

async function StartTeen({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection(); // the cookie's expiry reads the clock: request time only
  const ticket = openStart((await cookies()).get(START_COOKIE)?.value, new Date());
  const who = ticket?.who;
  const e = (await searchParams).e;
  const problem = typeof e === "string" ? PROBLEM[e] : undefined;
  const demo = demoLinks();
  const trouble = problem && (
    <p className="g-flash g-flash--warn" role="alert" style={{ marginTop: 12 }}>
      {problem}{e === "full" && demo && <> <a className="g-textlink" href={demo.amara}>Open the shared demo family</a></>}
    </p>
  );
  if (e === "addfull") {
    return (
      <Gate>
        <h1>No teen added</h1>
        {trouble}
        <div className="s-actions s-center"><a className="g-btn" href="/g">Back to Home</a></div>
      </Gate>
    );
  }
  if (!who) {
    return (
      <Gate>
        <h1>Start your own family</h1>
        {trouble}
        <p>First, log in with PayPal. Tether pays from your PayPal, and only for purchases that pass the rules you sign.</p>
        <div className="s-actions s-center"><PaypalLoginButton /></div>
        <SandboxLogin />
      </Gate>
    );
  }
  return (
    <Gate>
      <h1>{ticket.add ? "Add another teen" : `Welcome${who.givenName ? `, ${who.givenName}` : ""}.`}</h1>
      <p className="g-note">{who.givenName ? "Your name came from PayPal." : "PayPal didn't share your name, so Tether will call you Parent."} Not you? <a className="g-textlink" href="/g/login/paypal">Start again</a></p>
      {trouble}
      <h2>{ticket.add ? "Your other teen" : "Now, your teen"}</h2>
      {ticket.add && <p className="g-note">This teen gets their own rules, budget, record, investing and link. You save your PayPal once for each teen.</p>}
      <StartForm />
      <p className="g-note" style={{ marginTop: 14 }}>Next time, Log in with PayPal: the same PayPal is your way back in.</p>
      <p className="g-note">The family relationship is simulated — PayPal has no notion of it. Sandbox only; no real money moves.</p>
    </Gate>
  );
}
