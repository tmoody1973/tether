"use client";

import dynamic from "next/dynamic";

// The two animated stories render on the client only, after hydration: they sit below the fold, so they never
// compete with the hero for LCP. Until the chunk arrives, a box of the stage's own height holds the space (no
// layout shift). Under prefers-reduced-motion the Stage shows its poster, the payoff, and never animates.
// Screen readers get one plain sentence per story instead of every word on the animated screens.
const Shop = dynamic(() => import("./ShopStory"), { ssr: false, loading: () => <div className="l-story__space" /> });
const Invest = dynamic(() => import("./InvestStory"), { ssr: false, loading: () => <div className="l-story__space" /> });

export const SHOP_STORY_LABEL =
  "Animation on two phones. Zoe asks Tether's shopping agent for headphones under $30. It proposes three options, labelled Over budget, Fits your week and Needs Amara's OK. " +
  "She opens the $25.30 Best Buy one: You've got $13.02 left this week and this is $25.30, with two ways forward, Ask Amara or Wait 3 days. She taps Ask Amara. " +
  "Amara's phone shows: Zoe is asking for $25.30 at Best Buy. The request opens with what it does to Zoe's week; Amara taps Approve $25.30. " +
  "It ends on: Approved and paid — $25.30 at Best Buy, with the PayPal ID, Rules v3, the single-use permission slip, and Matches PayPal.";

export const INVEST_STORY_LABEL =
  "Animation on two phones. On VTI's page Zoe reads that one share costs $361.86 and what's inside: NVIDIA 6.4%, Apple 5.9%, Alphabet 5.2%. " +
  "With her own answer to Why this one? already written, she types $5 and sees it is about 0.0138 of one VTI share, then taps Propose to Amara. " +
  "Amara's phone shows: Zoe proposes investing $5.00 in VTI. She approves $5.00. " +
  "It ends on Zoe's card: You own 0.0138 share. It's been 1 day. Too soon to tell: investments like this are for years, not days.";

export function ShopStoryFigure() {
  return (
    <figure className="l-story l-story--shop" role="img" aria-label={SHOP_STORY_LABEL}>
      <Shop />
    </figure>
  );
}

export function InvestStoryFigure() {
  return (
    <figure className="l-story l-story--invest" role="img" aria-label={INVEST_STORY_LABEL}>
      <Invest />
    </figure>
  );
}
