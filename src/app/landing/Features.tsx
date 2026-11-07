import Image from "next/image";
import type { ReactNode } from "react";
import { NoSign, Phone } from "./bits";

type Side = "guard" | "teen";

/** Whose phone it is: a caption under the copy, in the band's colour (never a label stacked above the heading). */
function Aud({ side }: { side: Side }) {
  return side === "guard"
    ? <p className="l-aud"><span className="l-dot" />On Amara&apos;s phone</p>
    : <p className="l-aud"><span className="l-dot l-dot--small" />On Zoe&apos;s phone</p>;
}

function Feat({ side, frames, two, children }: { side: Side; frames: ReactNode; two?: boolean; children: ReactNode }) {
  return (
    <article className={`l-feat l-feat--${side}`}>
      <div className="l-feat__in">
        <div className="l-feat__text">{children}<Aud side={side} /></div>
        <div className={two ? "l-frames l-frames--two" : "l-frames"}>{frames}</div>
      </div>
    </article>
  );
}

function LockScreen() {
  return (
    <div className="l-lock" role="img" aria-label="Phone lock screen with one Tether notification: Zoe is asking for $25.30 at Best Buy. Tap to decide.">
      <div className="l-lock__screen">
        <div className="l-lock__time">8:54</div>
        <div className="l-note">
          <Image src="/brand/tether-app-icon.svg" alt="" width={36} height={36} />
          <div>
            <div className="l-note__app"><span>TETHER</span><span>now</span></div>
            <div className="l-note__title">Zoe is asking for $25.30 at Best Buy</div>
            <div className="l-note__body">Tap to decide.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Refusal() {
  return (
    <article className="l-feat l-refuse">
      <div className="l-feat__in">
        <div className="l-feat__text">
          <h3>A no that teaches.</h3>
          <p>One plain sentence with the real numbers, and two ways forward. Amber, never red: a refusal is a rule, not a punishment, and never a dead end.</p>
        </div>
        <div className="l-refusal" role="img" aria-label="Example refusal: You've got $13.02 left this week and this is $25.30. Two ways forward: Ask Amara, or It fits next week.">
          <div className="l-refusal__head">
            <span className="l-refusal__tag"><NoSign size={18} stroke={1.6} />Not this time</span>
            <span className="l-refusal__item money">Monopoly · $25.30</span>
          </div>
          <p className="l-refusal__line">You&apos;ve got <span className="money">$13.02</span> left this week and this is <span className="money">$25.30</span>.</p>
          <div className="l-refusal__ways"><span>Ask Amara</span><span>It fits next week</span></div>
          <p className="l-refusal__note">Wording from Tether&apos;s refusal template for an over-budget cart.</p>
        </div>
      </div>
    </article>
  );
}

export function Features() {
  return (
    <section className="l-tour" aria-labelledby="tour-h">
      <div className="l-wrap">
        <h2 id="tour-h">Two views of one family, both real.</h2>
        <p className="l-lede">Every screen below is the live sandbox app, captured as it is today.</p>

        <Feat side="guard" frames={<Phone src="amara-rules-clause" width={272} alt="Zoe's rules in plain words, set in a serif like a signed document: up to $30.00 a week at Best Buy, Target, Barnes & Noble and newegg.com." />}>
          <h3>Rules that read like a contract.</h3>
          <p>Amara picks a weekly amount, the shops, and how much Zoe promises to save. Zoe reads the same rules in plain words. No AI writes them, and every change is a new version.</p>
          <ul className="l-facts"><li>Shops added or removed with one confirm</li><li>Level 1 $20 a week, Level 2 $30, Level 3 $50</li><li>She can stop the rules at once</li></ul>
        </Feat>

        <Feat side="teen" frames={<Phone src="zoe-shop" width={272} alt="Zoe's Shop page: What are you after? Find options. A helper looks only in your shops and suggests two or three. It can't buy anything." />}>
          <h3>A shopping agent that can&apos;t buy anything.</h3>
          <p>Zoe says what she&apos;s after, or pastes a product link. The agent searches only the shops Amara allowed and suggests two or three. Each option carries the rule engine&apos;s label: &ldquo;Fits your week&rdquo;, &ldquo;Needs Amara&apos;s OK&rdquo; or &ldquo;Over budget&rdquo;.</p>
        </Feat>

        <Refusal />

        <Feat side="guard" two frames={<><LockScreen /><Phone src="amara-request" width={250} alt="The request page: She has $13.02 left this week. This would use the rest and $12.28 more. Her reason: It's Mia's birthday present. Approve $25.30." /></>}>
          <h3>One buzz. One tap.</h3>
          <p>When Zoe asks for more, Amara gets one notification. It opens the request with the budget consequence first, Zoe&apos;s reason, and her last four weeks. Approve checks the rules again, then pays.</p>
        </Feat>

        <Feat side="teen" two frames={<>
          <Phone src="zoe-map" width={250} alt="Zoe's Map: Barnes & Noble, Best Buy, newegg.com and Target open. Nike and Uniqlo locked, opens at Level 3." />
          <Phone src="zoe-goals" width={250} alt="Zoe's Goals: 12 weeks to noise-cancelling headphones, $53.96 saved of $169.99." />
        </>}>
          <h3>Freedom she earns, not a limit someone raises.</h3>
          <p>Whatever Zoe doesn&apos;t spend is savings, and it stays in Amara&apos;s PayPal. Four weeks of keeping her own savings promise moves her up a level: more money a week, more shops.</p>
        </Feat>

        <Feat side="teen" frames={<Phone src="zoe-fund-top" width={272} alt="A fund page: Vanguard Morningstar Total Stock Market ETF (VTI), one share costs $361.93, what's inside: NVIDIA 6.4%, Apple 5.9%, Alphabet 5.2%." />}>
          <h3>Investing with facts, not hype.</h3>
          <p>From Level 2, Zoe can look up funds or stocks and propose a dollar amount from her savings. Tether recommends nothing, and leveraged products can&apos;t be proposed at all. Amara approves each one.</p>
          <ul className="l-facts"><li>What&apos;s inside a fund, or what the company does</li><li>One line against the whole market</li><li>Three questions she answers in her own words</li></ul>
        </Feat>

        <Feat side="guard" frames={<Phone src="amara-assistant" width={272} alt="The month assistant: In December 2026, Zoe made 13 purchases totaling $83.02, and all of them were paid within the rules you signed, followed by a card listing each purchase." />}>
          <h3>Ask about the month.</h3>
          <p>&ldquo;What did Zoe buy this month?&rdquo; A read-only assistant answers questions about Zoe&apos;s spending, her investments and the news, with cards built from real data, including PayPal&apos;s own transaction list through the PayPal Agent Toolkit. It can&apos;t move money.</p>
        </Feat>
      </div>
    </section>
  );
}
