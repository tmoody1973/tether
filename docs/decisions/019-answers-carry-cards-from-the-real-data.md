# 019 — Amara's answers carry cards from the real data; OpenUI dashboards deferred

**Decision** — When Amara asks the month assistant a question, the answer is a short sentence written by the model, followed by cards that show the numbers: her purchases, Zoe's monthly check-in, and whether Tether's receipts match PayPal. Tether builds the cards in its own code, from the data its tools fetched for that question, and draws them with the same pieces as Amara's Activity page. The model never produces a card's numbers. Generated dashboards (OpenUI) are deferred.

**Why this came up** — A sentence alone makes Amara trust the model's arithmetic. "Zoe spent $20.50 at The Bookshop" may be right, but she can't see the rows behind it. The pull is toward generated UI, where a model lays out a dashboard for each question. Tether's promise to a parent, though, is that code decides and the AI only proposes. That has to hold for the numbers on her screen, not just for payments.

**Options**
1. **OpenUI dashboards.** OpenUI is a service where a model generates a whole interface from a prompt. Cost: in a spike (a short throwaway experiment), the chat reply took about 4 seconds, but building the dashboard took more than 50. It runs on paid credits. OpenUI Cloud stores the layouts it builds, which puts a family's spending on a third party's servers. And because the model lays out the numbers, the "model never writes a figure" rule can't be enforced in code.
2. **In-house cards (chosen).** Tether's own code turns each tool's result into a fixed card: a purchases list, a check-in summary with one bar, and a PayPal match line with any problems listed. Cost: each kind of card is something we build and maintain, and a question no card fits gets text only.
3. **Text only.** Keep the plain sentence. Cost: nothing new to build, but Amara has to take the model's numbers on trust, and a wrong month or a wrong total is hard to spot.

**What we chose and why** — Option 2, Tarik's call on Claude's recommendation. The cards appear instantly with the answer, cost nothing extra, and keep the family's data inside Tether. Above all, the rule is enforced in code. The model writes the sentence; Tether's code writes the numbers, from the same whitelisted, id-free data the tools return. A test shows that a model claiming "$999.99 at Evil Shop" in its sentence leaves the card unchanged. The cards reuse Activity's row, definition and flag styles, so they look like the rest of Amara's screens and stay compact on a phone.

**What we gave up** — The flexibility of a generated layout: Amara gets three fixed card shapes, not a view shaped to her question. A new kind of question needs a new card, built by us. The sentence can still say something the cards don't back up. The cards make that visible, but they don't stop it.

**How we'll know if this was right** — On the live demo, the four suggested questions each come back with the matching card, and every figure on a card equals the Activity page for the same month. If parents ask often for views no card covers, that's the signal to revisit generated layouts.

**What actually happened** —
