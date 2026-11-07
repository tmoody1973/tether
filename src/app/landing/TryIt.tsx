import { StartFamily } from "../StartFamily";
import type { DemoLinks } from "./bits";

export function TryIt({ links }: { links: DemoLinks }) {
  return (
    <section className="l-try" id="try" aria-labelledby="try-h">
      <div className="l-wrap">
        <div className="l-try__in">
          <div>
            <h2 id="try-h">Try it in five steps.</h2>
            <ol>
              <li><span><b>Open Zoe&apos;s view.</b> Her week shows one number: what she has left.</span></li>
              <li><span><b>In Shop, ask for something,</b> like &ldquo;headphones under $30&rdquo;. Open an over-budget option to read its sentence and two ways forward.</span></li>
              <li><span><b>Open Amara&apos;s view.</b> Home shows what needs her. Open Zoe&apos;s ask and approve it.</span></li>
              <li><span><b>In Activity, open Proof</b> on that payment: PayPal ID, permission slip, rules version.</span></li>
              <li><span><b>Ask the month assistant</b> &ldquo;What did Zoe buy this month?&rdquo;</span></li>
            </ol>
          </div>
          <div className="l-try__doors">
            {links && (
              <>
                {/* Plain <a>, never prefetched: the doors start sessions. */}
                <a className="l-btn l-btn--guard" href={links.amara}>Open Amara&apos;s view</a>
                <a className="l-btn l-btn--teen" href={links.zoe}>Open Zoe&apos;s view</a>
                <p>Sandbox only; no real money moves. Anyone can use the demo family, and it resets itself.</p>
              </>
            )}
            <div id="start"><StartFamily /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
