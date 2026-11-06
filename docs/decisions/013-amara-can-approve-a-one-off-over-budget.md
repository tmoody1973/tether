# 013 — Amara can approve a one-off purchase over Zoe's weekly budget

**Decision** — When Zoe wants something that costs more than she has left this week, it goes to Amara for an OK instead of being refused outright. If Amara approves, that exact item at that exact price is charged; the extra comes out of Zoe's week, and that week doesn't count toward her next level. Some things stay a hard no that no approval can lift: shops Amara didn't allow, the AI saying "that's not a book", rules that have ended or been stopped, and anything above one week's whole allowance.

**Why this came up** — The rule engine (the plain code that decides every purchase) was first built so an approval could never get past the weekly budget. But the product documents said the opposite: the PRD's refusal example ends *"Ask Amara, or it fits next week"*, and the request mock-up shows Amara approving $15 when Zoe has $8 left. Built as it was, "Ask Amara" on an over-budget item could only send a note, which made the refusal a dead end and removed the demo's clearest moment of a parent and teen deciding together.

**Options**
1. **Budget is a hard limit.** Simple and strict. Cost: refusals for being a little short have no real next step except "wait"; the PRD and mock-up would need rewording.
2. **Amara can approve a one-off over budget, tied to that exact cart and amount.** Cost: a careful change to the rule engine, more tests, and one more thing for the screens to explain ("this week won't count toward your next level").
3. **Let Amara raise the weekly limit instead.** Cost: changes the rules for every future purchase, not just this one, and skips the level system Zoe is meant to earn her way through.

**What we chose and why** — Option 2. Tarik's call. A refusal should always have a next step, and the parent deciding a specific purchase is exactly the kind of judgement Tether is meant to support. Tying the approval to one cart and one amount keeps it from turning into a blank cheque: if Zoe spends more after asking, the approval no longer covers it.

**What we gave up** — Some strictness. The weekly budget is no longer an absolute ceiling, only a ceiling that Amara can lift once, for one thing, up to one week's allowance. And an approved overspend costs Zoe that week's progress toward the next level, which she might find unfair even though it's honest.

**How we'll know if this was right** — In testing, every over-budget refusal offers a route Amara can actually approve; no approval ever lifts a shop, AI, expiry or one-week-maximum refusal; and the record shows each over-budget payment as "Amara approved this one".

**What actually happened** —
