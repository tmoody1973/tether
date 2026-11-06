# 016 — Amara's screens follow her jobs, not Tether's internals

**Decision** — Amara's side has three places: Home (what needs her and how Zoe is doing), Zoe's rules (change anything, or stop everything) and Activity (what Zoe bought, the monthly check-in, and the proof folded behind each payment). It replaces five tabs named after Tether's internal ideas: Zoe, Grant, Record, Review and Investing.

**Why this came up** — Tarik walked the live site as Amara and asked whether it was confusing. It was. The tab names didn't say what was inside. The emergency "Stop Zoe's rules" button lived under "Review". The Record page opened with an engineer's disclaimer about signature schemes and listed 15 rule versions, most of them demo resets. The trust machinery (permission slips, rule versions, PayPal capture IDs) is the product's spine, but a parent reached it before she reached the answer to "what did Zoe buy?". At stake: a judge spends three minutes on this side, and confusion reads as "not finished".

**Options**
1. **Quick fixes only:** real icons, clearer tab names, a shorter Record page. About a day. Cost: the structure still follows how the system works, so Amara still hunts for things.
2. **Reorganise around her four jobs (chosen):** answer Zoe, see how she's doing, change the rules, check the proof. About two to three days. Cost: the video script, the README, and the live tests all name the old tabs and have to be updated, four days before the deadline.
3. **Add a guided tour on top of the current screens.** Cost: it explains the confusion instead of removing it.

**What we chose and why** — Option 2. Claude proposed it after the walkthrough. Tarik chose it after clicking through a mockup ("mockup looks good"). The proof stays one tap away on every payment, so nothing the trust story depends on is hidden. It just stops being the first thing a parent sees.

**What we gave up** — Some of the proof's visibility. A judge who doesn't open "Proof" won't see the permission slip or the rules version, so the video has to open one on camera. Also, about two days of build time that could have gone to other polish.

**How we'll know if this was right** — Give the live site to someone who has never seen it, say "you're Amara", and ask them to (1) approve Zoe's waiting request, (2) remove a shop, (3) find the PayPal ID of the last payment. If they finish all three without asking where something is, it worked.

**What actually happened** —
