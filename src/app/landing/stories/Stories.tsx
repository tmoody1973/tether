"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { Pause, Play } from "lucide-react";

// The two animated stories render on the client only, and each one's code is fetched only when its slot comes
// within 400px of the viewport: neither competes with the hero for LCP, and a visitor who never scrolls there never
// downloads them. Until then a box of the stage's own height holds the space (no layout shift). Under
// prefers-reduced-motion the Stage shows its poster, the payoff, and never animates. Screen readers get one plain
// sentence per story instead of every word on the animated screens. Each story has a pause button (WCAG 2.2.2).
type Story = ComponentType<{ paused?: boolean }>;
const Shop = dynamic(() => import("./ShopStory"), { ssr: false, loading: () => <div className="l-story__space" /> }) as Story;
const Invest = dynamic(() => import("./InvestStory"), { ssr: false, loading: () => <div className="l-story__space" /> }) as Story;

export const SHOP_STORY_LABEL =
  "Animation on two phones. Zoe asks Tether's shopping agent for headphones under $30. It proposes three options, labelled Over budget, Fits your week and Needs Amara's OK. " +
  "She opens the $25.30 Best Buy one: You've got $13.02 left this week and this is $25.30, with two ways forward, Ask Amara or Wait 3 days. She taps Ask Amara. " +
  "Amara's phone shows: Zoe is asking for $25.30 at Best Buy. The request opens with what it does to Zoe's week; Amara taps Approve $25.30. " +
  "It ends on: Approved and paid — $25.30 at Best Buy, with the PayPal ID, Rules v3, the single-use permission slip, and Matches PayPal. Zoe's week now lists it: Amara approved this one.";

export const INVEST_STORY_LABEL =
  "Animation on two phones. On VTI's page Zoe reads that one share costs $361.86 and what's inside: NVIDIA 6.4%, Apple 5.9%, Alphabet 5.2%. " +
  "With her own answer to Why this one? already written, she types $5 and sees it is about 0.0138 of one VTI share, then taps Propose to Amara. " +
  "Amara's phone shows: Zoe proposes investing $5.00 in VTI. She approves $5.00, and it reads Bought. " +
  "It ends on Zoe's card: You own 0.0138 share. It's been 1 day. Too soon to tell: investments like this are for years, not days.";

/** True once the element has come within `margin` of the viewport; it stays true. */
function useNear(margin: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true); }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin, near]);
  return [ref, near] as const;
}

function StoryFigure({ name, label, kind, Component }: { name: string; label: string; kind: "shop" | "invest"; Component: Story }) {
  const [ref, near] = useNear("400px");
  const [paused, setPaused] = useState(false);
  return (
    <div className={`l-story-wrap l-story-wrap--${kind}`} ref={ref}>
      <button
        type="button"
        className="l-story__pause"
        aria-label={paused ? `Play the ${name} animation` : `Pause the ${name} animation`}
        onClick={() => setPaused((p) => !p)}
      >
        {paused ? <Play size={14} strokeWidth={2.25} aria-hidden /> : <Pause size={14} strokeWidth={2.25} aria-hidden />}
      </button>
      <figure className={`l-story l-story--${kind}`} role="img" aria-label={label}>
        {near ? <Component paused={paused} /> : <div className="l-story__space" />}
      </figure>
    </div>
  );
}

export function ShopStoryFigure() {
  return <StoryFigure name="shopping" label={SHOP_STORY_LABEL} kind="shop" Component={Shop} />;
}

export function InvestStoryFigure() {
  return <StoryFigure name="investing" label={INVEST_STORY_LABEL} kind="invest" Component={Invest} />;
}
