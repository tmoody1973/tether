# 002 — Tether is online-only

**Decision** — Tether governs online purchases only; in-person spending is out of scope.

**Why this came up** — The mockups show a corner store and a bus fare. Once the teen has no card and no money of her own inside Tether (see 001), there is no way for her to pay at a counter through Tether — so those examples promised something the product can't do.

**Options**
1. **Online-only.** Cost: loses the most relatable everyday teen spends.
2. **Issue the teen a card.** Cost: card issuing is a regulated business needing a bank partner — impossible in a week and an explicit non-goal in the PRD.
3. **Pay at shops by PayPal QR code from the parent's account.** Cost: it's the parent's phone and the parent's app, not the teen's purchase; the rule engine is bypassed.

**What we chose and why** — Option 1. Claude's recommendation; Tarik raised the question. The saved-wallet charge PayPal provides is built for online checkout with the payer absent, and the "AI agents shopping" story the judges are scoring is online. Everyday in-person money is covered by savings the parent releases into the teen's own Venmo Teen card (see design D4).

**What we gave up** — The corner-store and bus-fare examples; Tether is not a full replacement for a teen debit card.

**How we'll know if this was right** — No judge or tester asks "how does she buy lunch?" without the answer already being on screen; the mockups' shops are all online.

**What actually happened** —
