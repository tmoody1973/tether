# 031 — Zoe's goal at today's price, and what a purchase does to it before she buys

**Decision** — When Zoe's savings goal is a Channel3 product, her Goals screen counts the weeks from today's price, not the price when she picked it. It says, in one or two plain sentences, how the price has moved and where it sits in the last 90 days. Every suggestion card says how many weeks buying it would set her goal back, before she buys.

**Why this came up** — Tarik approved the brief on 8 Nov 2026 (also with the "Best Use of Channel3" prize in mind). Her goal already stored a Channel3 product, but the screen used the price from the day she picked it, so "58 weeks" could be wrong by weeks. And the "this sets your goal back" line only appeared after she'd paid, which is too late to help her choose. If this went wrong, the risk was a teen nudged by a screen that sounds like advice ("buy now!"), or a Goals screen that hangs while a price service is slow.

**Options**
1. **Keep the stored price; show the sets-back line only after buying (today).** Cost: the weeks-to-goal number drifts from reality, and the trade-off is only shown when it can't change anything.
2. **Today's price and 90-day facts in sentences, the trade-off on every card before buying (chosen).** Cost: two Channel3 calls on the Goals screen (one free, one paid), and one more line on each card.
3. **A price chart.** Cost: decision 005 says no charts for the teen. A chart also invites "is now the time to buy?", which is advice, and Tether gives facts.

**What we chose and why** — Option 2, as Tarik approved. Claude made the engine calls:
- **Today's price** comes from Channel3's product details call, which is free, restricted to her allowed shops exactly like every other lookup. Weeks-to-goal and the progress bar use it. If it can't be checked (no product behind the goal, no offer in her shops, her rules not in force, Channel3 down or slow), the screen uses the stored price and says "Couldn't check today's price."
- **The fact line** comes from Channel3's price history statistics (90 days): "$149.99 today, $20.00 less than when you picked it. That's 2 weeks closer." and "Today's price is low for the last 90 days." (or typical, or high). The weeks part only appears when her weekly promise makes it countable and the count actually changes. The 90-day sentence appears only when Channel3's tracked price is the price shown (within 1%, at least a cent). Channel3 tracks a product across all sellers, while the price shown is the cheapest in her shops, so without that check the screen could say "$189.99 today, $20.00 more… Today's price is low" about two different prices (review MEDIUM 2). The words never say "buy now", "wait" or "should".
- **Cost and speed.** History is a paid call, so it counts against the family's daily cap (60 a day), and against the shared pot for self-started families, but only when it isn't cached. Today's price gets 4 seconds. History runs alongside on its own 2.5-second budget (Channel3's client is told 2 seconds and no retries), and it never decides whether today's price shows (review MEDIUM 1). Answers are cached per product for 3 hours. A failed or slow history call is remembered for 15 minutes, so repeat visits don't pay for the same failure. The cache holds product facts, not family data, and is keyed by product (and the shops list for the price), never by family.
- **A goal she names herself isn't a product.** Using "Change your goal" now clears the Channel3 product link. Otherwise the price line would describe something she no longer means.
- **Before buying:** each suggestion card shows the same code-computed sentence as after buying ("This sets Space headphones back 3 weeks."). N is exactly how far the Goals screen's number would move: weeks to the goal if this much is spent instead of saved, minus weeks to the goal now, rounded the same way and at the same promise the Goals screen uses (her promise from now on). The cost is the card's full estimated cost (decision 030). An earlier draft divided the cost by the promise, which could say 4 weeks when Goals would move by 3 (review LOW 3). It uses today's goal price only if it's already cached, so shop results never wait on Channel3, and it says nothing when the count wouldn't move. There is no "buy with your savings" option: savings is a promise, never a way to pay (decision 029).
- **Amara's Savings page** shows the same line ("…when Zoe picked it…"), loading separately so it never holds up her page.

**What we gave up**
- The first Goals visit after a few hours can take up to 4 seconds while Channel3 answers. Later visits use the cache.
- Only goals that came from Channel3 (the demo's, today) get live prices. A goal she types herself keeps the price she typed.
- The 90-day status is Channel3's own reading of "low / typical / high". Tether repeats it and doesn't judge it.
- The cache lives in each server instance. More instances would mean more paid history calls, still within the caps.

**How we'll know if this was right** — On the demo, the Goals screen shows today's price and one plain status line within a few seconds, every time. A slow or broken Channel3 gives "Couldn't check today's price." and the old number, never a spinner or an error. The daily usage counter shows at most one history call per product every three hours. Judges see "This sets … back N weeks" on cards before buying, and no sentence anywhere tells Zoe to buy or wait.

**What actually happened** —
