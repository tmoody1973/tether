# 010 — Once money reaches the broker, Tether never shows it back in savings

**Decision** — If Zoe's investment gets as far as depositing money into her investing account, Tether keeps it out of her savings even when the stock order then fails. The money shows as cash in her investing account until an order goes through or Amara moves it back.

**Why this came up** — A new sandbox investing account takes about a minute to activate, and a deposit takes a few minutes to clear (a "clearing" delay, the time banks take to actually move money). Placing the order right after the deposit fails with "not allowed to trade" or "insufficient buying power." The first version of Tether treated that failure as "nothing happened" and put the money back in Zoe's savings, while the money was in fact already at the broker (Alpaca). A reviewer caught it; a second look found the same flaw when the broker rejects an order outright. Getting this wrong means the app shows Zoe money she doesn't have, and every retry sends the broker more.

**Options**
1. **Put the money back in savings whenever the order fails.** Simple and what the first version did. Cost: the screen lies; savings can be spent twice.
2. **Keep the money out of savings once the deposit succeeds; show it as cash in the investing account and retry the order.** Cost: one more status for the screens to explain ("Held as cash in Zoe's investing account"), and a small recovery step that finishes stuck investments.
3. **Automatically send the money back from the broker to the parent when an order fails.** Cost: another money movement that can itself fail or take days; more to build and more to go wrong on camera.

**What we chose and why** — Option 2. Claude's call, consistent with the rule Tarik set from the start: the app never tells a story about money that isn't true. Only a failure *before* any money moved (the deposit itself is refused) returns the money to savings.

**What we gave up** — A simpler screen. Zoe can see "cash waiting" in her investing account, which needs a sentence of explanation. Also no automatic "undo" back to Amara's PayPal; Amara does that by hand if she wants.

**How we'll know if this was right** — In testing and the demo, the savings figure on Zoe's screen always equals what the ledger (Tether's record of every money movement) says, and the broker's account balance always matches Tether's "invested + cash held" figure.

**What actually happened** —
