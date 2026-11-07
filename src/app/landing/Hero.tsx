import { Seam } from "@/ui/Seam";
import { Arrow, Phone, type DemoLinks } from "./bits";

/** The two sides of one family, joined by the logo's line; the demo doors live on each side. */
export function Hero({ links }: { links: DemoLinks }) {
  return (
    <section className="l-hero" aria-labelledby="pitch">
      <div className="l-wrap">
        <h1 id="pitch">
          <span className="l-h-g">A parent signs the rules.</span> <span className="l-h-ai">An AI agent proposes.</span>{" "}
          <span className="l-h-code">Code decides.</span> <span>PayPal pays.</span>
        </h1>
        <p className="l-lede">Real spending money for a teenager online, without handing her a card. The money stays in her parent&apos;s PayPal.</p>
      </div>

      <div className="l-stage">
        <div className="l-side l-side--guard">
          <div className="l-side__text">
            <h2>Signs the rules. Approves in one tap.</h2>
            <p><b>Amara, the parent,</b> sees every ask with its budget consequence first.</p>
            {/* Plain <a>: the guardian door sets a session cookie, so it must never be prefetched. */}
            {links && <a className="l-btn l-btn--guard" href={links.amara}>Open Amara&apos;s view <Arrow /></a>}
          </div>
          <Phone src="amara-request" width={240} eager alt="Amara's phone: Zoe is asking for $25.30 at Best Buy. She has $13.02 left this week. Approve $25.30 or Not this time." />
        </div>
        <div className="l-side l-side--teen">
          <Phone src="zoe-week" width={240} eager alt="Zoe's phone: $13.02 left this week, Level 2, her Best Buy ask waiting for Amara." />
          <div className="l-side__text">
            <h2>Shops with an agent that only proposes.</h2>
            <p><b>Zoe, 15,</b> sees one number for her week: what she has left.</p>
            {links && <a className="l-btn l-btn--teen" href={links.zoe}>Open Zoe&apos;s view <Arrow /></a>}
          </div>
        </div>
        {/* The logo's line: the bigger dot Amara, the smaller Zoe, a rope with give. */}
        <svg className="l-tether" viewBox="0 0 200 240" aria-hidden="true">
          <path d="M 68 40 C 74 230, 126 230, 132 40" />
          <circle cx="68" cy="40" r="12" fill="#4A90E2" />
          <circle cx="132" cy="40" r="7.5" fill="#4A90E2" />
        </svg>
        <p className="l-gatechip">
          <span className="l-gatechip__ic">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          Code checks every cart against her rules
        </p>
      </div>

      <div className="l-wrap">
        <div className="l-own">
          <a className="l-btn l-btn--plain" href="#start">Start your own family</a>
          <small>Log in with PayPal. PayPal accounts are for adults, so the parent signs in.</small>
        </div>
        <Seam center kinds={["sandbox"]}>The demo family is shared and resets itself.</Seam>
      </div>
    </section>
  );
}
