import Image from "next/image";
import "@/ui/tokens.css";
import "./landing.css";
import { Seam } from "@/ui/Seam";
import { demoLinks } from "./demoLinks";

const REPO_URL = "https://github.com/tmoody1973/tether";

const STEPS = [
  { who: "Amara", what: "signs the rules", line: "How much a week, which shops, how much Zoe saves." },
  { who: "The agent", what: "proposes", line: "Zoe asks for something; it finds options in her allowed shops." },
  { who: "Code", what: "decides", line: "Plain rules check every cart. A model can only make them stricter." },
  { who: "PayPal", what: "pays", line: "Only a cart that passed is charged to Amara's saved PayPal." },
];

export default function Landing() {
  const links = demoLinks();
  return (
    <div className="l-page">
      <header className="l-top">
        <Image src="/brand/tether-horizontal-color.svg" alt="Tether" width={132} height={40} priority />
        <a className="l-textlink" href={REPO_URL}>Code on GitHub</a>
      </header>

      <main className="l-main">
        <section className="l-hero" aria-labelledby="pitch">
          <h1 id="pitch" className="l-pitch">A parent signs the rules. An AI agent proposes. Code decides. PayPal pays.</h1>
          <div className="l-copy">
            <p>Tether gives a teenager real spending money online without handing her a card: the money stays in her parent&apos;s PayPal.</p>
            <p>Every cart Zoe&apos;s shopping agent proposes is checked against the rules Amara signed before a cent moves, and anything outside them comes back as a plain sentence, not a charge.</p>
            <p>When Zoe keeps her savings promise for a month, her rules open up a level, so freedom grows with the track record.</p>
          </div>
          {links && (
            <div className="l-ctas">
              {/* Plain <a>: the guardian link sets a session cookie, so it must never be prefetched. */}
              <a className="l-btn l-btn--primary" href={links.amara}>Open Amara&apos;s view</a>
              <a className="l-btn l-btn--secondary" href={links.zoe}>Open Zoe&apos;s view</a>
            </div>
          )}
          <Seam center kinds={["sandbox", "family"]} />
        </section>

        <section className="l-band" aria-label="How it works">
          <ol className="l-steps">
            {STEPS.map((s) => (
              <li key={s.who} className="l-step">
                <b>{s.who}</b> {s.what}
                <span>{s.line}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="l-foot">
        <span>Built for the PayPal AI hackathon.</span>
        <a className="l-textlink" href={REPO_URL}>github.com/tmoody1973/tether</a>
      </footer>
    </div>
  );
}
