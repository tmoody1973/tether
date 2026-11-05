# 003 — Savings is the unspent part of the grant; roundups dropped; release is a parent action

**Decision** — What the teen doesn't spend counts as saved; there are no roundups; at month-end the parent releases earned savings plus a match by sending it in Venmo herself.

**Why this came up** — The level system promotes a teen who saves 30% or more. We needed savings to be something the rule engine can count exactly, and somewhere for released money to go that PayPal actually allows.

**Options**
1. **Roundups into a savings jar.** Cost: savings happen automatically, so the teen can level up without ever choosing to save — which hollows out the level system. Also PayPal Savings (the parent's real savings product) has no developer API, so Tether couldn't put money in it.
2. **Unspent grant = savings; parent releases it via Venmo.** Cost: no API moves money from a parent's Venmo to a teen's Venmo Teen account, so release is a manual step Tether can only record as "parent-confirmed."
3. **Unspent grant = savings; released through PayPal Payouts.** Cost: PayPal refuses payouts to youth accounts, so it would only work in the test environment.

**What we chose and why** — Option 2. Tarik brought the unspent-grant idea; Claude chose the release mechanism after confirming Venmo's own help page says a parent funds a Teen Account "by sending your teen a payment," and that no official pre-filled Venmo payment link exists.

**What we gave up** — An automated, provable release. Tether can say "you owe Zoe $68" but cannot prove the money moved.

**How we'll know if this was right** — The promotion screen's savings figure matches the ledger to the cent, and the release step is honest on screen about what Tether can and can't confirm.

**What actually happened** —
