# 012 — When PayPal doesn't answer, Tether says "confirming", not "nothing was spent"

**Decision** — If Tether asks PayPal to charge Amara's saved wallet and gets no clear answer (the request times out, the network drops, or PayPal returns a server error), the purchase stays "paying" and the money stays counted as spent. Tether then asks PayPal again with the same request ID until it gets a real answer. Money goes back into Zoe's week only when PayPal clearly says it declined the payment.

**Why this came up** — The first version treated any failed PayPal call as "nothing happened": it gave the money back to Zoe's weekly budget and marked the purchase failed. But a timeout means Tether doesn't know. PayPal may have charged Amara and the reply got lost. The screen would then show Zoe money she'd already spent, and she could spend it twice. This was flagged early and became urgent when Amara's "Approve" button started charging PayPal straight away, because a slow PayPal response on camera would produce exactly that wrong screen.

**Options**
1. **Treat every failed call as "nothing was spent."** Simple. Cost: when PayPal is slow, the app can show money that has actually left Amara's account, and Zoe can spend it again.
2. **Treat an unclear answer as "still confirming", and ask PayPal again safely.** Each order carries a request ID (an idempotency key: a label PayPal uses to recognise a repeat of the same request, so asking twice returns the same order instead of charging twice). Cost: a third state ("Paying… no receipt yet") that the screens must explain, and a small recovery step.
3. **Cancel or refund automatically when unsure.** Cost: a second money movement that can itself fail; refunds take days; harder to explain on screen.

**What we chose and why** — Option 2. Claude's call, applying the rule Tarik set at the start: the app never tells a story about money that isn't true. It mirrors decision 010 on the investing side: once money may have moved, Tether doesn't pretend it didn't.

**What we gave up** — Simplicity, and an instant answer. For a few seconds (or longer if PayPal is down) Amara and Zoe see "PayPal is confirming the payment" instead of a clean yes or no.

**How we'll know if this was right** — In testing and the demo, a forced PayPal timeout never shows money back in Zoe's week; the purchase resolves to either "paid" with a receipt or "declined" with the money returned; and PayPal never shows two charges for one purchase.

**What actually happened** —
