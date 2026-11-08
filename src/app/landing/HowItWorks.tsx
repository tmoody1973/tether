import type { CSSProperties } from "react";
import { ShopStoryFigure } from "./stories/Stories";

const lane = (c: string) => ({ "--c": c }) as CSSProperties;

/** Three lanes (people on top, the machinery below), four steps as one staircase: DOM and eye both read 1→2→3→4.
 *  Below 860px it folds to one timeline; the lane shows as the dot's colour. */
export function HowItWorks() {
  return (
    <section className="l-how" id="how" aria-labelledby="how-h">
      <div className="l-wrap">
        <div className="l-how__head">
          <h2 id="how-h">Four steps. The AI proposes; it never decides.</h2>
          <p className="l-rule">&ldquo;A model may add friction. Only code may remove it.&rdquo;</p>
        </div>

        <ShopStoryFigure />

        <div className="l-lanes">
          <div className="l-lane-label l-lane--guard"><span className="l-dot" />Amara</div>
          <div className="l-cell l-cell--r1" style={lane("var(--l-guard)")}>
            <div className="l-step l-step--guard"><b>1. Amara signs the rules</b><span>How much a week, which shops, how much Zoe saves. Her PayPal is saved once, on PayPal&apos;s page.</span></div>
          </div>
          <div className="l-cell l-cell--r1 l-cell--empty" />
          <div className="l-cell l-cell--r1 l-cell--empty" />
          <div className="l-cell l-cell--r1 l-cell--empty" />

          <div className="l-lane-label l-lane--teen"><span className="l-dot l-dot--small" />Zoe</div>
          <div className="l-cell l-cell--empty" />
          <div className="l-cell" style={lane("var(--l-teen)")}>
            <div className="l-step l-step--teen"><b>2. The agent proposes</b><span>Zoe asks for something. It searches only her allowed shops and suggests two or three. It can&apos;t buy.</span></div>
          </div>
          <div className="l-cell l-cell--empty" />
          <div className="l-cell l-cell--empty" />

          <div className="l-lane-label l-lane--code"><span className="l-dot" />Tether code + PayPal</div>
          <div className="l-cell l-cell--empty" />
          <div className="l-cell l-cell--empty" />
          <div className="l-cell" style={lane("var(--l-brand-deep)")}>
            <div className="l-step l-step--code">
              <b>3. Code decides</b><span>A rule engine checks the cart. An AI check can only make it stricter.</span>
              <ul className="l-outcomes">
                <li><i style={{ background: "var(--l-ok)" }} />Fits your week: pay now</li>
                <li><i style={{ background: "var(--l-warn)" }} />Needs Amara&apos;s OK: one tap</li>
                <li><i style={{ background: "#FFD9A8" }} />Not this time: one plain sentence</li>
              </ul>
            </div>
          </div>
          <div className="l-cell l-cell--last" style={lane("var(--l-brand-deep)")}>
            <div className="l-step l-step--code"><b>4. PayPal pays</b><span>A single-use permission slip, bound to that cart, then one charge to Amara&apos;s saved PayPal.</span></div>
          </div>
        </div>

        <div className="l-how__foot">
          <p><b><span className="l-swatch" style={{ background: "var(--l-warn-deep)" }} />Every week</b>What Zoe doesn&apos;t spend becomes her savings.</p>
          <p><b><span className="l-swatch" style={{ background: "var(--l-teen)" }} />Four kept weeks</b>Keeping her own savings promise moves her up a level.</p>
          <p><b><span className="l-swatch" style={{ background: "var(--l-guard)" }} />From Level 2</b>She can propose investing in funds or stocks. Amara approves each one.</p>
        </div>
      </div>
    </section>
  );
}
