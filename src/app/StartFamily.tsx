import { PaypalLoginButton } from "@/ui/PaypalLogin";
import { SandboxLogin } from "@/ui/SandboxLogin";
import "./startFamily.css";

/**
 * "Start your own family" (decision 026, mockup 01a/01b): a quiet white card under the demo buttons, so the shared demo
 * stays the obvious first click. Self-contained (own CSS) so a landing redesign can move it anywhere.
 */
export function StartFamily() {
  return (
    <section className="l-start" aria-labelledby="start-h">
      <div className="l-start__or" aria-hidden="true"><span>or</span></div>
      <h2 id="start-h" className="l-start__h">Start your own family</h2>
      <p className="l-start__p">Log in with PayPal, add your teen, sign the first rules. About three minutes.</p>
      <PaypalLoginButton />
      <SandboxLogin />
      <p className="l-start__note">
        Sandbox PayPal only: log in with the sandbox account above, never your real one. New families are removed after 7 days.
      </p>
    </section>
  );
}
