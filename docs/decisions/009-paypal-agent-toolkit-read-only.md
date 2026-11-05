# 009 — Use PayPal's agent toolkit, with only read-only tools switched on

**Decision** — Amara gets an "Ask about the month" assistant built on PayPal's own AI agent toolkit, with every tool that could move money switched off.

**Why this came up** — The hackathon scores "Best Use of PayPal + AI." Tether's AI was deliberately kept away from money, which risked looking like PayPal and AI barely meet. PayPal's toolkit gives an AI direct PayPal tools — including ones that create orders and issue refunds — which is exactly what Tether's design forbids.

**Options**
1. **Don't use the toolkit.** Cost: the most visible "PayPal + AI" integration is missing.
2. **Use the toolkit with read-only tools only** (listing transactions). Cost: a smaller showcase than an agent that "does things"; depends on the toolkit honouring its per-tool on/off settings.
3. **Use the toolkit with refund or order tools for convenience.** Cost: breaks the rule that no AI can move money — the core of the product.

**What we chose and why** — Option 2. Claude recommended it; Tarik approved it as a Must. The toolkit's README says apps can "specify which actions should be allowed," so Tether switches on only transaction listing and adds a test that fails if any other tool appears. It turns PayPal's own AI toolkit into a demonstration of Tether's thesis: the AI can look, but only code can spend.

**What we gave up** — A flashier AI that takes actions in PayPal.

**How we'll know if this was right** — The tool-set test passes on every build; in the demo, the assistant answers a real question about the month from PayPal's own data.

**What actually happened** —
