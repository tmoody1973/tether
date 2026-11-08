# 027 — The landing page tells the shopping and investing loops as short animations on two phones

**Decision** — Two looping animations replace static explanation on the landing page: the shopping loop at the top of "How it works" (about 17 seconds) and the investing loop in place of the fund-page screenshot in the feature tour (about 15 seconds wide, 16 on a phone). Each runs on Zoe's phone and Amara's phone side by side, with every word taken from the app. They are built with a small copied-in animation kit (Stageshow), load only in the browser after the page is up, and show their final frame, still, to anyone who has asked their device for reduced motion.

**Why this came up** — The page explained the loop in four boxes and a dozen screenshots. A judge skimming for thirty seconds sees screens, not the moment the product is about: the agent proposes, code says no in plain words, Amara says yes with one tap, PayPal's own record proves it. Getting it wrong is costly in two directions: an animation that invents wording or numbers undercuts "every screen below is the live app", and a heavy one slows the page a judge opens first.

**Options**
1. **Option A: animated stories built from the app's own words, with a copied-in kit (chosen).** The kit (an MIT-licensed set of phone frames, lock screens and motion parts) handles the frame-by-frame details. Cost: about 30 vendored files and one new dependency (lucide-react, an icon set the kit's text field uses), and the stories restate the app's words, so they can drift unless a test pins them.
2. **Option B: screen recordings of the real app.** Most honest, but a recording is a large video file, can't adapt to a phone column, and captures sandbox noise (loading states, test data) that has nothing to do with the story.
3. **Option C: keep the screenshots.** No cost, no motion; the story stays four boxes a judge must read in order.

**What we chose and why** — Option A. Tarik approved both stories and their beats on 7 Nov 2026; Claude chose how to build them. The words are pinned by a unit test that calls the app's own word functions (`tests/app/landing-stories.test.ts`), so a copy change in the app fails the build until the story matches. The stories render only in the browser, after hydration (the page's interactive start-up), below the fold, so the hero image stays the first thing to paint. The kit is excluded from lint: its exact-frame measuring deliberately does things React's newest lint rules flag, and it is copied unmodified so it can be updated from its source.

**What we gave up**
- Two compressions of the real flow. Zoe's "Ask Amara" goes straight to her week page with "Sent." (the real app shows an ask page with an optional reason first). Her three answers on the fund page are already written when the story starts. Both keep the app's words; neither shows every screen.
- The $25.30 Best Buy item is "Over-ear headphones" in the story, to match the headphones search. The sandbox's own $25.30 request (and the static refusal card further down the page) is a Monopoly board game.
- The loops run 15 to 17 seconds, longer than the 12 to 14 first asked for; the cursor's travel between taps is timed by distance and each beat needs reading time.
- Vendored code outside lint, and 30 more files to keep.
- A visitor without JavaScript sees a blank box of the right size; screen readers get one plain sentence per story instead.

**How we'll know if this was right** — The e2e test passes with reduced motion on (each story's payoff renders as the still frame), the landing page's largest paint stays the hero image, and in the demo video or a judge's first scroll the two stories are watched to the end rather than scrolled past.

**What actually happened** —
