# Tether — Product Requirements Document

**Version:** 0.5 · **Status:** for hackathon build · **Companion docs:** `TETHER-EXPLAINED.md` (concept), `HOW-IT-WORKS.md` (system + screens), `AGENT.md` (the agent), `DECISION-LAYER.md` (the semantic gate), `MERCHANT-DIRECTORY.md` (the directory), `DESIGN-SYSTEM.md` (tokens + UI system), `UX-PLAN.md` (devices + states), `WINNING-IDEA.md` (positioning), `VENMO-INTEGRATION.md` (payments detail), `HACKATHON-PARTNERS.md` (rails + hackathon partners)

---

## 0. One-liner

**Tether turns a teenager's allowance into a revocable, machine-enforced grant of spending authority that expands as they earn it — and produces the evidence trail that agentic commerce currently lacks.**

## 1. Summary

A guardian writes a short set of rules — weekly amount, permitted merchants, whether online purchases need approval, expiry date. A deterministic engine evaluates those rules before any payment moves. Refusals are explained in the teenager's own language, with the arithmetic and the path to a yes. Authority is earned: staying inside the rules and meeting a self-authored savings commitment widens the mandate; breaches narrow it. Every decision produces a signed record.

**The technological thesis:** the guardian is the grantor, the minor is the principal, and the LLM never holds authority — only deterministic code does.

**The corollary, added in v0.2.** Where a *learned* decision model is used at all — for rules that are irreducibly about meaning, like "books only" or "is this item actually damaged" — it is composed with **AND** against the deterministic gate. The composite allow-set is therefore a strict subset of the deterministic one, and the model can only ever **tighten** an outcome, never loosen it. That is set arithmetic, not model behaviour, and it is asserted by test. It is also what makes it safe to point a model at untrusted merchant content — the thing that would otherwise make this architecture reckless. See §8, “Two-gate composition”.

**The competitive framing.** As agentic commerce settles on merchant-published catalogs, the merchant directory stops being a Tether invention and becomes a consumer-side view of a machine-readable registry — filtered by what a guardian permits rather than by who paid for placement:

> **Affirm's directory tells you where you can borrow. Tether's tells you where you're allowed to go — and nobody can buy their way onto it.**

## 2. Problem

**For the guardian.** Enforcement today *is* the parent — their memory, their mood, their "we'll see." Money conversations become negotiations, "no" loses its meaning, and the parent occupies the role of bad cop in a relationship that should be about teaching. Cash gives no visibility or structure; a kids' debit card gives a dashboard and one fixed limit that never changes on its own, so nothing is ever actually *earned*.

**For the teenager.** Limits arrive without reasons, change unpredictably, and come with surveillance. Being watched is not the same as being trusted, and only one of those teaches judgement. There is no visible path from "you're allowed $20" to "you're allowed more."

**For the ecosystem.** Agent-initiated payments are the live problem in payments. The World Economic Forum notes that liability "remains largely unresolved once a dispute moves past straightforward fraud," and merchants are being asked to "bear the full financial liability for errors made by autonomous agents." Evidence for this PRD's thesis: **disputes on agent-initiated transactions run at roughly 2.4× the rate of comparable human-initiated card-not-present transactions.**

**The gap Tether fills:** there is no product that grants *progressive* spending authority to someone who has none by default, and there is no product that turns that grant into portable evidence when a payment is questioned.

## 3. Personas

### P1 — Amara, 44 · the guardian (primary)

Nurse manager. Zoe, 15. Divorced, shared custody. Household income comfortable but not unlimited.

| | |
|---|---|
| **Context** | Gives Zoe cash irregularly — sometimes $10, sometimes nothing, sometimes $40 because she feels guilty. Has never had a structured money conversation. Zoe has started asking for online purchases. |
| **Goals** | Zoe capable with money by 18 · fewer arguments · confidence that online spending is safe · *not* to spend her evenings managing an app |
| **Frustrations** | Being the ATM · forgetting what she said yes to last week · feeling like a bad parent whether she says yes or no · "we'll talk about money" conversations that never happen |
| **Fears** | Zoe getting scammed · Zoe ruining her credit before she's 18 · being blamed if it goes wrong |
| **Quote** | *"I'm not trying to catch her out. I just want to stop arguing about money."* |
| **Success looks like** | *"Two minutes a week, and she's stopped asking me for cash every day."* |

**Design implications:** the app must be quiet by default, must never ask her to adjudicate ordinary purchases, and must make the safety story legible in one glance.

### P2 — Zoe, 15 · the teenager (primary)

Year 11. Phone always in hand, spends on snacks, transport, small online purchases.

| | |
|---|---|
| **Context** | Gets money unpredictably. Saves occasionally for something specific, usually derailed. Has been told "ask your mum" more times than she can count. |
| **Goals** | Buy things without asking · not be tracked · to be treated as capable |
| **Frustrations** | "Declined" with no explanation · inconsistent rules · feeling like a child while being expected to act grown up · parents who forget what they agreed |
| **Quote** | *"If I ask for money it's twenty questions."* |
| **Success looks like** | *"I always know where I stand."* |

**Design implications:** refusals must give the arithmetic and a route forward. No dead ends. The path to more freedom must be permanently visible.

### P3 — Maya, 34 · the merchant (secondary)

Runs a small online store, ~$400k revenue, accepts PayPal and Venmo.

| | |
|---|---|
| **Context** | Has started seeing agent-originated orders. Has already eaten chargebacks where the cardholder claimed an agent wasn't authorised. |
| **Goals** | Get paid · win disputes that should be won · not carry liability for software she doesn't control |
| **Frustrations** | Disputes with no evidence of what the buyer actually agreed to · a 2.4× dispute rate on agent transactions · no way to verify an agent was authorised |
| **Quote** | *"If a robot buys from me and the human says they didn't authorise it, who eats that?"* |
| **Success looks like** | *"I can see the mandate that authorised the order."* |

**Design implications:** the mandate chain must be exportable as a human- and machine-readable evidence packet, and the merchant-facing view matters as much as the family-facing one. This persona is why disputes are a feature, not a footnote.

### P4 — Anti-persona (explicit non-targets)

Under-13s (compliance). Adults building a budget (different product). Anyone seeking investing, credit, or crypto. Parents seeking covert monitoring.

## 4. Goals and non-goals

**Goals**
1. Grant and enforce spending authority with machine-checkable rules, evaluated before money moves.
2. Explain every refusal in the teenager's language, with the arithmetic and a route forward.
3. Recompute authority from evidence, automatically, with the evidence shown.
4. Move real money on PayPal rails at every leg.
5. Produce a portable evidence packet for every payment.
6. Keep the guardian's involvement under three minutes a week.

**Non-goals**
Any card issuance · holding or custodying funds · investing, credit, or crypto · anything for under-13s · curriculum, lessons or quizzes · covert monitoring · replacing a bank.

## 5. Success metrics

| Metric | Target | Why |
|---|---|---|
| Guardian time per week | < 3 min | If higher, the parent has become the bottleneck |
| Refusal rate with no follow-up action | < 20% | Dead-end refusals mean the explanation failed |
| % of purchases requiring guardian approval | Falling monthly | The ladder is working |
| Self-authored commitments kept | > 60% | Measures whether the kid's own rule means anything |
| Promotions per family per quarter | ≥ 1 | Evidence of the ladder actually moving |
| Escalation rate: problem → refund → dispute | < 15% reach dispute | Most problems should resolve before a network dispute |
| Dispute win rate with an evidence packet | Track vs baseline | The merchant-side claim of this product |
| Semantic-gate precision at the allow threshold | ≥ 99% | The only failure this gate can cause that matters is a wrongful allow; escalation is cheap |
| Escalation rate from the uncertain band | Tracked, expected to fall | Falls as thresholds are tuned against labelled data |

## 6. Core user journeys

**J1 — The grant.** Guardian signs up, verifies identity, invites teen → teen installs, adds details → guardian approves → guardian saves a funding method once → guardian signs the first grant.

**J2 — Spend, refusal, approval, capture.** Teen attempts a purchase → engine evaluates → refused with arithmetic and options → teen asks → guardian approves in one tap → engine re-evaluates → order created and captured → ledger and receipt written → teen sees the new balance, guardian gets nothing.

**J3 — Problem, refund, dispute.** Teen reports a problem with a past purchase → agent identifies the receipt → attempts a **refund** first → if refused or ignored, escalates to a **dispute** using the mandate chain as evidence → guardian holds the filing authority until the teen earns it.

**J4 — Earned promotion.** Monthly review → engine evaluates behaviour → promotion/demotion with evidence → both parties notified → conservation applies at next renewal.

## 7. Functional requirements

### Grant (FR-1)
- **FR-1.1 [P0]** Guardian can author a grant with: weekly amount, permitted merchants **selected from the merchant directory (FR-14), with add-by-domain for anything not yet listed**, online-approval flag, expiry, optional savings commitment and match.
- **FR-1.2 [P0]** Grant is presented in plain English *and* stored as machine-readable constraints — one object, two views.
- **FR-1.3 [P0]** Signing is an explicit, deterministic confirmation step. **No AI in this path.**
- **FR-1.4 [P0]** Guardian can revoke instantly; revocation is unilateral and immediate.
- **FR-1.5 [P1]** Grants auto-expire and require renewal; renewal surfaces any level change.

### Spend authorisation (FR-2)
- **FR-2.1 [P0]** Every spend attempt is evaluated against the active grant **before** any payment call.
- **FR-2.2 [P0]** Engine enforces: cumulative period budget, min/max per transaction, allowed payees, execution window, occurrence count, line-item requirements.
- **FR-2.3 [P0]** **Unknown constraint type ⇒ refuse.** Never guess. Fail closed.
- **FR-2.4 [P0]** A grant authorisation is single-use for a given purchase; replay must be rejected.
- **FR-2.5 [P0]** Ledger tracks spend and occurrence counts per period and is authoritative for the engine.

### Refusal and explanation (FR-3)
- **FR-3.1 [P0]** Refusal returns a structured reason list (constraint + human-readable cause).
- **FR-3.2 [P0]** The explanation model converts reasons to teen-language. It receives reasons only — never authority, never a payment credential.
- **FR-3.3 [P0]** Refusal UI must include: the arithmetic, two actionable routes forward, and the path to more freedom.
- **FR-3.4 [P1]** Outreach-language variants by age band.

### Approval (FR-4)
- **FR-4.1 [P0]** Teen can request approval; request carries context (remaining budget, level, recent adherence, stated reason).
- **FR-4.2 [P0]** Guardian approves or declines in one tap; can instead amend the grant.
- **FR-4.3 [P0]** Approval is scoped to the specific request (merchant + amount + line items) and expires.
- **FR-4.4 [P1]** Decline produces a visible outcome for the teen — never a silent dead end.

### Commerce connection (FR-5) — see §9
### Refunds and disputes (FR-6) — see §10

### Savings goal and match (FR-7)
- **FR-7.1 [P0]** Goal is modelled as a grant with a single allowed payee (a real destination account), not a stored balance.
- **FR-7.2 [P0]** Teen authors their own recurring commitment; UI states plainly that breaking it pauses progress but blocks nothing.
- **FR-7.3 [P0]** Guardian match fires on contribution, as a real payout.
- **FR-7.4 [P1]** Unclaimed payouts are detected and retried; never counted as saved.

### Authority ladder (FR-8)
- **FR-8.1 [P0]** Level definitions (budget, approval requirements, permitted merchant classes).
- **FR-8.2 [P0]** Promotion/demotion policy evaluated on a schedule from evidence; both parties see the evidence.
- **FR-8.3 [P0]** Guardian can override either direction at any time.
- **FR-8.4 [P1]** Level changes are journal entries, not silent mutations.

### Record and audit (FR-9)
- **FR-9.1 [P0]** Every payment links to: the grant version that permitted it, the constraint evaluation, and a receipt carrying the payment identifier.
- **FR-9.2 [P0]** Guardian-readable record; technical detail behind an expander.
- **FR-9.3 [P0]** Exportable evidence packet per payment (see §10.4).

### Notifications (FR-10)
- **FR-10.1 [P0]** Exactly three guardian notification types: a request, a breach, an anomaly.
- **FR-10.2 [P0]** No per-purchase feed. Ever.

### Accounts and graduation (FR-11)
- **FR-11.1 [P0]** Guardian-initiated teen onboarding with guardian approval.
- **FR-11.2 [P0]** At 18: grant ends, account becomes the teen's, signed history is retained and transferred.

### Trust and safety (FR-12)
- **FR-12.1 [P0]** Anomaly detection: first-time counterparty, requests for money from unrecognised parties, unusual charge patterns.
- **FR-12.2 [P0]** Anomalies are surfaced, never auto-acted on.

### Semantic decision layer (FR-13)
- **FR-13.1 [P0]** A **second gate** evaluates rules that are irreducibly about *meaning* — item category, merchant class, whether a claim matches its stated reason. It returns a **calibrated probability**, never a verdict, and never prose.
- **FR-13.2 [P0]** The two gates compose with **AND**. The composite allow-set must be a subset of the deterministic allow-set. A semantic result may never override a gate-1 refusal, and may never remove a gate-1 requirement. Assert this by test across a probability sweep.
- **FR-13.3 [P0]** Three bands: `p ≥ allow_at` satisfies the rule; `refuse_below ≤ p < allow_at` **escalates to the guardian** (never a guess); `p < refuse_below` refuses with a reason.
- **FR-13.4 [P0]** **Fail closed.** No answer, a provider `refusal`, a schema error, or a timeout all resolve to REFUSE. Never to ALLOW.
- **FR-13.5 [P0]** Gate 2 cannot mint an authorisation, cannot settle a payment, and cannot widen a grant. Its only reachable capability is the classifier.
- **FR-13.6 [P0]** Gate 2 is the **only** component permitted to receive untrusted merchant content — permissible precisely because it cannot loosen anything.
- **FR-13.7 [P0]** Every semantic decision is journalled with: rule id, question hash, model id, **model version**, probability, confidence, the thresholds in force, and the resulting band.
- **FR-13.8 [P0]** A semantic decision may never be the **sole** basis for a payment that is later disputed. Gate 1 remains authoritative for anything a dispute would turn on, because gate 1 can be replayed and a probability cannot.
- **FR-13.9 [P0]** The engine must expose a **decide-without-settling** phase, so gate 2 is evaluated between the decision and the payment and the model is never handed a request that has already moved money.
- **FR-13.10 [P1]** The guardian authors the *question* in their own words; the system renders a draft rule and its plain-words sentence for signature. **The model drafts; the human signs.**
- **FR-13.11 [P1]** Any `choice`/`score` question must offer an explicit `UNKNOWN` answer, treated as refuse, to preserve fail-closed on out-of-distribution input.
- **FR-13.12 [P1]** Thresholds are per-rule, tuned against a labelled set, and reviewed with precision data — never chosen by preference.

### Merchant directory (FR-14)
- **FR-14.1 [P0]** A merchant directory supplies the payee identifiers a grant enforces on. It is a **configuration surface for the guardian**, never a discovery surface for the teenager.
- **FR-14.2 [P0]** **No paid placement, ever.** No sponsorship, no promoted records, no sold ranking. A merchant's presence in the directory may not be influenced by any commercial term. See §12.
- **FR-14.3 [P0]** The teen-facing view is read-only and un-merchandised: no prices, promotions, ratings, reviews, recommendations, or ads. It shows what is open, what needs approval, what is locked, and what unlocks it — the authority ladder's interface (FR-8).
- **FR-14.4 [P0]** Each record carries: merchant id, display name, domain, class, **direct retailer vs marketplace**, accepted rails, whether the agent can transact, refund/dispute windows, and **provenance plus last-verified date**.
- **FR-14.5 [P0]** The directory is **ground truth for gate 2**. A known merchant resolves class and marketplace status deterministically and gate 2 is not consulted. An **unknown** merchant falls through to gate 2 and must **fail closed** — never be assumed acceptable.
- **FR-14.6 [P0]** Guardian can add a merchant by domain (paste a link). Unresolved merchants enter gate 2 with conservative defaults and are flagged as unverified.
- **FR-14.7 [P1]** Starter sets by category, so a new grant is never authored against an empty list.
- **FR-14.8 [P1]** Teen can **propose** a merchant; the guardian approves or declines; approval updates the grant. The kid proposes the payee, the guardian signs.
- **FR-14.9 [P1]** Records are **derived, not hand-curated**: the merchant's own published terms, then user-supplied domains, then catalog feeds (Store Sync / ACP) when published. For the hackathon build the catalog feed is **Channel3**, whose API returns normalised product data across 100M+ products from 25,000+ retailers and supplies the retailer identity, canonical domain and availability that gate 2's deterministic path needs. It populates the **guardian's** picker and payee resolution only, and is never a browse surface for the teenager (FR-14.2).
- **FR-14.10 [P1]** Record age is visible to the guardian. A stale record is a liability, not a neutral omission.

## 8. Technical architecture

### Components

| Component | Responsibility | Trust boundary |
|---|---|---|
| Teen app / Guardian app | UI only | No payment credentials |
| **Mandate engine** | The only component that may authorise a payment | Deterministic; fail-closed |
| Ledger | Period totals, occurrences, consumed grants | Authoritative for the engine |
| Explanation model | Converts structured reasons to language | **Cannot authorise, cannot call PayPal** |
| Commerce gateway | Merchant interaction and cart assembly | Produces requests, not authorisations |
| **Semantic decision layer (gate 2)** | Probabilistic judgement on rules about *meaning* | Advisory only; **cannot loosen**; the only reader of untrusted content |
| Payment adapter | PayPal/Braintree calls | Reachable **only** after ALLOW |

**Invariant:** no path exists from the explanation model, the semantic decision layer, or either client to the payment adapter that does not pass through the engine's ALLOW.

### Two-gate composition

Gate 1 is deterministic and authoritative. Gate 2 is a decision model returning calibrated probabilities. They compose with **AND**:

```
composite(proposal) = gate1(proposal) ∩ gate2(proposal)   ⊆   gate1(proposal)
```

**Adding a model can only ever shrink the set of things money can do.** Stated as a rule for the whole team:

> **A model may add friction. Only code may remove it.**

| Probability | Outcome |
|---|---|
| `p ≥ allow_at` (default 0.98) | the rule is **satisfied** |
| `refuse_below ≤ p < allow_at` (0.70–0.98) | **ESCALATE** — ask the guardian |
| `p < refuse_below` | **REFUSE**, with a reason |
| no answer · `refusal` · error · timeout | **REFUSE** — fail closed |

The gate is **vendor-agnostic** — it speaks probabilities, not vendors:

```python
classifier.ask(question, context) -> Decision(label, probability, confidence, model, version)
```

Three interchangeable implementations: OpenAI's **Decisions API** (`predicate` → probability; also accepts images), TypeSafe's **Jev** (70–500 ms, ~$0.042/MTok, typed decisions only), or any chat model via strict JSON schema, which reproduces the same contract and lets gate 2 be built **without beta access to either**.

**Two-phase protocol.** The engine can *decide* without *settling* (`attempt_spend(..., dry_run=True)`), so gate 2 is evaluated between the two phases. The model is never handed a request that has already moved money.

**Vendor choice:** default to the Decisions API — it is the only one that accepts images, which is what makes photographic refund evidence possible (§10.3), and it documents Zero Data Retention and US/EEA-Switzerland residency. Keep Jev as the drop-in if per-purchase check volume ever makes the ~2× cost difference matter.

### Constraint vocabulary (AP2-aligned)

`payment.amount_range` · `payment.budget` · `payment.allowed_payees` · `payment.execution_date` · `payment.agent_recurrence` · `payment.allowed_payment_instruments` · `payment.reference` · `checkout.allowed_merchants` · `checkout.line_items` · `checkout.semantic_category` · `checkout.semantic_merchant_class` · `dispute.photo_predicate`

### Grant object

```json
{
  "grant_id": "grant_8f2a", "from": "guardian:amara", "to": "teen:zoe", "level": 2,
  "signed_at": "2026-10-08T09:14:00Z", "expires_at": "2026-10-15T09:14:00Z",
  "rules": [
    { "type": "payment.amount_range",   "currency": "USD", "min": 100, "max": 2000 },
    { "type": "payment.budget",         "currency": "USD", "max": 2000, "period": "WEEKLY" },
    { "type": "payment.allowed_payees", "allowed": ["m_corner_store", "m_city_transit"] },
    { "type": "payment.agent_recurrence","frequency": "WEEKLY", "max_occurrences": 10 },
    { "type": "payment.execution_date", "not_after": "2026-10-15T09:14:00Z" }
  ],
  "teen_rules": [
    { "type": "savings.commitment", "amount": 400, "goal": "Headphones",
      "consequence": "pauses level progress" }
  ]
}
```

### Venmo integration

**Venmo has no public API** — it closed to new developers in 2016. It is reachable only through PayPal's platform, via three routes with very different sandbox behaviour.

| Route | Capability | Sandbox reality |
|---|---|---|
| **Payouts** — `recipient_wallet: VENMO` | Send money **to** a Venmo account | **Works.** Payouts is enabled by default in the sandbox; test value `POSPYO003` returns 201 "FOR VENMO". Requires a **US mobile number and a `note`** (`ERRPYO013` without it). |
| **Braintree Venmo** | Venmo **at checkout** | **Shape only.** Sandbox is "limited to testing the app switch flow that returns a payment method nonce"; test user is *VenmoJoe*; use `fake-venmo-account-nonce`; purchases don't appear in the Venmo app. Production requires an application and approval. |
| **PayPal JS SDK v6 Venmo** | Venmo checkout, and **saving** Venmo for future payments | Same limits as Braintree. |

**What is not possible:** creating a **Venmo Teen Account in the sandbox** — sandbox models users and merchants, not families. **The teen relationship is the one thing Tether simulates itself**, which is appropriate because it is product logic, not a payment feature. There is also no P2P "send money to a friend" endpoint.

**What to build:** allowance out via **Payouts → Venmo** (real sandbox support *and* the real production path); teen spend via **PayPal Orders v2 + a saved (vaulted) method** (fully sandbox-supported); Venmo at checkout as an optional flourish. This alignment is strong: a Venmo Teen Account legally requires a parent, which mirrors the guardian model exactly.

### Endpoint map (verified against PayPal's documentation index)

| Purpose | Endpoint |
|---|---|
| Save a funding method | `POST /v3/vault/setup-tokens` → `POST /v3/vault/payment-tokens` |
| Charge without the payer present | `POST /v2/checkout/orders` with `payment_source.paypal.vault_id` → `/capture` |
| Authorise now, capture later | *Authorize and delay capture* |
| Pay the allowance / match | `POST /v1/payments/payouts` (`recipient_wallet: VENMO`) |
| Refund | `POST /v2/payments/captures/{capture_id}/refund` |
| Disputes | list · show · provide evidence · provide supporting information · send message · make/accept/deny offer · escalate to claim · settle · update status · appeal |
| Auth | `POST /v1/oauth2/token` |
| Sandbox webhooks | `simulate-webhook-event` |

## 9. Commerce connection — how the agent buys

This is the requirement that needs the most design discipline, because "the kid wants to buy something" is four different problems depending on where the thing is.

### The four modes

| Mode | What happens | Demo suitability |
|---|---|---|
| **M1 — Tether-hosted merchant** | A mock store we control. Agent assembles the cart, engine evaluates, capture happens. | **Best.** Deterministic, and it lets us manufacture the exact refusal states we need. |
| **M2 — We are both parties** | Our app is the merchant; PayPal Orders v2 is the rail. | Good, and it exercises real endpoints. |
| **M3 — Real merchant, PayPal checkout** | Standard PayPal checkout on a third-party site. | Fragile — we don't control the merchant's flow or stock. |
| **M4 — Agent-to-merchant with a cart API** | Agent negotiates a cart with a merchant's agent (PayPal's emerging cart/agentic-commerce surface, AP2 Checkout Mandate). | Right direction, immature; use as a slide, not the demo. |

**Recommendation:** build **M1 + M2** as the demo spine, and *describe* M4 as the strategic direction. Never put M3 on the critical path.

### The buy flow — kid-initiated, external merchant (M1)

1. **Intent.** Zoe taps "I want this" and pastes a link (or picks from the merchant's catalog in-app).
2. **Cart assembly.** The commerce gateway fetches the product and builds a structured cart: merchant id, line items (id, title, quantity, unit price), total.
3. **Evaluation (gate 1).** The engine checks the cart against the grant — critically including `checkout.allowed_merchants` and **`checkout.line_items`**. The line-items constraint is what stops an agent being shown one thing and buying another: the guardian's rule can pin the purchase to the *exact* item set the teen saw. This is the single strongest anti-bait-and-switch control in the design. This phase makes **no payment call**.
4. **Decision (gate 1).**
   - `ALLOW` → continue to gate 2.
   - `NEEDS_APPROVAL` (amount above an unattended threshold, or a first-time merchant) → route to FR-4.
   - `REFUSE` → FR-3. Nothing is created, and **gate 2 is never even consulted**.
5. **Semantic check (gate 2).** Rules about meaning — is this line item a book, is this merchant a real retailer — go to a decision model (FR-13), which returns calibrated probabilities mapped into a band: satisfy · **escalate to the guardian** · refuse · fail closed. Because the gates compose with AND, this step **can only add friction**. It is also the only step that reads untrusted merchant content, which is safe for exactly that reason.
6. **Order.** Create a PayPal order using the saved method; capture.
7. **Settle.** Write ledger entries, consume the authorisation, emit the receipt with the capture identifier, update the teen's view. The guardian is notified only if this was an approval, a semantic escalation, or an anomaly.

### Why the directory exists — and why it is the opposite of Affirm's

The grant's `checkout.allowed_merchants` constraint needs identifiers to enforce against. FR-1.1 asks for "permitted merchants (multi-select)" — **multi-select from what?** The directory is what turns an empty field into a rule the engine can actually check. That is why it is P0, and not a convenience.

Affirm publishes a directory of the merchants that accept it. Tether's must be built to do the opposite job:

| | Directory exists so that… | Therefore |
|---|---|---|
| **Affirm** | shoppers discover **where they can borrow** | merchandised — placement is commercial |
| **Tether** | a guardian declares **where their kid's money may work** | **cannot be merchandised at all** |

> **A directory that can be bought into is not a safety product.**

The reason is sharper than ethics. The audience is 13–17, so paid merchant placement shown to a teenager is **advertising to a minor** — and it would destroy the one asset this product has: that *only the guardian's rules* shape what the kid sees. Affirm can sell placement. Tether cannot, and saying so out loud is a differentiator rather than a limitation (FR-14.2, §12).

### The directory is gate 2's ground truth

A payee resolves one of two ways, and the split matters more than it looks:

| Payee | Resolution | Gate 2 consulted? |
|---|---|---|
| **In the directory** | class, direct-vs-marketplace, refund window and rail support read from the record — **deterministic** | **No.** The common case is code, and it is replayable to the cent |
| **Unknown** | conservative defaults, flagged as unverified | **Yes** — answered in the band, and it must **fail closed** |

An unknown merchant must never be assumed acceptable (FR-14.5). Three consequences follow, and all three are good:

1. **Model usage collapses to the long tail**, which strengthens §11's cost and latency position rather than weakening it.
2. **The common case becomes deterministic — and therefore replayable.** That matters directly: FR-13.8 forbids a semantic decision from being the sole basis for a disputed payment, precisely because a probability cannot be recomputed. A directory-sourced answer can be.
3. **The answers get better.** A merchant's own published refund window beats a model's impression of a web page.

The practical corollary: **derive gate 2's questions from the directory's fields** — one question set per field — rather than inventing questions and hoping the answers stay consistent.

### The directory is the ladder's user interface

P2's design implication is that *"the path to more freedom must be permanently visible."* Today that is a sentence on a screen. The directory makes it a grid, and this is the strongest individual UX idea in the product:

| Tile | Shows | Example copy |
|---|---|---|
| **Open** | spendable now, within the grant | *Corner Store · up to $20 a week* |
| **Needs approval** | allowed, but ask first | *Sneaker Shop · approval each time* |
| **Locked** | why, and what unlocks it | *Bookshop · opens at Level 2* |

So "Zoe can shop at Bookshop because she earned Level 2" becomes something she can **see**. The ladder stops being a policy and becomes a place — and it gives the teenager something the anti-persona does not want: **information, not temptation.**

The view is a read-only **map of permissions, not a shopping mall** — no prices, no promotions, no ratings, no recommendations. The test: **if it can drive a purchase, it does not belong on that screen** (FR-14.3).

### The demo beat: the kid asks, the guardian decides

The teenager proposes a merchant; the guardian approves or declines in one tap; the grant updates (FR-14.8). It **reverses the usual flow** — the kid proposes the payee, the adult signs — and it is the ladder working in the direction the teenager actually cares about. It is the natural extension of FR-13.10's *the model drafts, the human signs* into **the kid asks, the guardian decides.**

### Kid-initiated, in-person (a shop, not a website)
Same engine, different front end: the teen's app presents a code or a tapped merchant, the engine evaluates merchant + amount, and the capture runs on the merchant's terminal via the saved method or the teen's balance. The interesting constraint here is *where* rather than *what*.

### The investing rail — decided, and deliberately not built

Round-ups into an index fund are the obvious next feature, and they are not in this build. The blocking reasons are legal before they are technical.

**A Roth IRA is unavailable to this product by law, not by preference.** A Roth contribution must be backed by earned income and is capped at the lesser of the annual limit or what was actually earned. An allowance is a gift, not compensation. Both brokerages that expose retirement accounts over an API also require the account holder to be an adult US taxpayer with an SSN. No design of the agent, the mandate or the engine can move a teenager's allowance into a Roth IRA, and claiming otherwise in the pitch would be a false promise. What a teenager with a real job can use is a custodial Roth IRA arranged by the parent, outside this product.

If the rail is built later, the two providers are not interchangeable:

- **DriveWealth** is the correct production partner. Its **Teen account** is owned by an adult who grants trade authorisation to a minor, with approval required for trades above $25 and for all withdrawals, stocks only. That is this product's approval model already implemented at the custodian. Onboarding runs through a partner agreement rather than a signup.
- **Alpaca** is the correct demo rail. Its Trading API is self-serve and paper trading is its sandbox, so one real fractional-share order can be shown without a contract. Its custodial accounts exist only for Broker API partners, and Broker API has no paper-trading environment.

What this section records is architectural: the investing leg sits behind one adapter (`InvestmentRail`, with `place_order`, `get_position`, `get_statement`) so the demo rail and the production rail are swappable without touching the engine. An investment is a **grant payee**, never a new authority, and the adapter is unreachable from `decide` and unreachable from any model at all, per the tool-authority requirement in §11.

### What we deliberately do not do
- No autonomous merchant discovery (the agent does not go shopping unbidden).
- No unattended spending above the guardian's unattended threshold.
- No checkout path where the line items differ from those the engine evaluated.

## 10. Refunds and disputes

### 10.1 The problem, stated honestly

An agent-initiated charge is a merchant-initiated transaction — the payer isn't present. Liability between merchant, issuer and agent platform "remains largely unresolved once a dispute moves past straightforward fraud," merchants report being asked to "bear the full financial liability for errors made by autonomous agents," and agent-initiated disputes run at roughly **2.4× the rate** of comparable human-initiated card-not-present transactions.

**This is not a weakness in Tether's story; it is the strongest version of it.** AP2 exists partly to fix this: PayPal's own framing is that mandates "embed cryptographically verifiable consent into authorization flows, **providing merchants with dispute-grade evidence**," and the protocol provides "a non-repudiable, cryptographic audit trail for every transaction, aiding in dispute resolution." Tether generates exactly that packet — for the smallest, most supervised case in the market.

### 10.2 Two distinct mechanisms, in a deliberate order

| | Refund | Dispute |
|---|---|---|
| Who initiates | The merchant, voluntarily | The buyer, by challenging the charge |
| Speed | Hours to days | Weeks |
| Needs evidence | No | Yes, and it's adversarial |
| Cost | None | Fee per chargeback, plus relationship damage |

**Design rule: always try a refund first.** The teen's "something's wrong" flow opens a refund request to the merchant. A dispute is only filed when the merchant refuses, ignores, or the charge is unauthorised. This mirrors real practice, is cheaper for everyone, and preserves the merchant relationship — which matters because the merchant is a persona.

### 10.3 Refund flow

1. Zoe taps **Something's wrong** on a purchase in her history.
2. Tether resolves the receipt from the record (the receipt carries the capture identifier — the same identifier the refund API needs).
3. Zoe picks a reason (not received / wrong item / damaged / charged twice / never authorised).
4. **Evidence, by photograph (gate 2).** For a damage claim, Zoe photographs the item instead of arguing her case. A **vision predicate** answers "does the product have visible damage?" and the probability routes it:
   - **p ≥ 0.80** → the claim files automatically, with the photo attached.
   - **0.40 ≤ p < 0.80** → the claim escalates to Amara, with the photo.
   - **p < 0.40** → refused, with a reason and a route to dispute it.

   This is better for all three personas at once: the teenager stops having to argue, the guardian stops being asked to judge photography, and **the merchant receives a damage assessment attached to the refund request** — exactly the evidence a merchant wants before approving one. And because it is a predicate, it can only add friction; the mandate still controls the money.
5. **Authority check.** Refunds below the guardian's threshold, within the window, at an established merchant → auto-file. Above it, or a first-time merchant, or a "never authorised" claim → guardian approves first.
6. Request filed; merchant refunds; PayPal emits the refund event.
7. **Ledger reversal.** The refund restores the teenager's period budget. This matters: if Zoe spent $15 and it came back, her week must reflect that, or the rules stop matching reality. Partials reverse proportionally.
8. Outcome shown to Zoe in her language, and recorded.

### 10.4 Evidence packet (the differentiated artefact)

Every payment can be exported as a packet containing: the grant version that permitted it, the constraint evaluation result, the approval record if any, the line items the engine evaluated, and the receipt with the payment identifier. That is the dispute-grade artefact — and it's assembled *before* anyone disputes anything, which is precisely what makes it useful.

**Where the decision layer touches the packet — and its honest limit.** If a semantic rule contributed, the packet also carries the semantic decision record: the rule, a hash of the exact question asked, the model id and **model version**, the probability, the confidence, the thresholds in force, and which band routed it. That makes the decision **attributable**. It does **not** make it **re-derivable** — nobody can recompute that probability in two years. **This is why gate 2 never carries authority (FR-13.8):** anything a dispute would actually turn on must be gate 1's arithmetic, which is deterministic and replayable to the cent. We state that limitation in the submission rather than let a judge discover it.

### 10.5 Dispute flow and the authority model

| Step | Who | Notes |
|---|---|---|
| Notice a problem | **Teen** | Always allowed |
| Draft the complaint | **Teen** (AI assists with language) | The model drafts; it makes no claims of its own |
| **Decide to dispute** | **Guardian** by default | The guardian is the adult of record on the account of record |
| File and submit evidence | Guardian (attachable to teen at higher levels) | See escalation below |
| Track to resolution | Both, read-only | |

**Who has standing to dispute matters, and it is not the teenager.** The account of record belongs to the guardian, so the guardian is the disputing party. Design consequence: **disputing is a link in the authority ladder**, not an exception to it. Small, low-risk claims (a $12 refund request) can be teen-initiated; formal network disputes are guardian authority, and can be *earned* by the teen at a higher level. That is a genuine extension of the core idea, not a workaround.

### 10.6 Sandbox testability — the practical unlock

Both dispute mechanisms are demonstrable:

- **PayPal disputes:** you must "simulate buyer actions to create the disputes and transactions in the sandbox" — meaning a human opens it in the Resolution Center. Workable but manual, so avoid it as a live demo dependency. There is also a **Disputes API test-values** document for simulating error responses.
- **Braintree disputes:** substantially better — Braintree publishes **a test card number that creates sale transactions of any amount as instantly disputed**, and with `fake-venmo-account-nonce`, **$62.00 → Under Review** and **$62.01 → Open**.
- **Webhooks:** `simulate-webhook-event` lets us fire the whole chain on demand.

**Architectural note worth weighing:** Braintree offers cards, PayPal, Venmo, vaulting *and* dispute generation in one sandbox, whereas the PayPal Orders path is simpler for the charge but awkward for disputes. Recommendation: **Orders v2 + vault for the payment spine** (verified, simple, and it produces the capture identifier the refund API wants), with **Braintree as an optional second adapter** if a live dispute beat is wanted in the video.

## 11. Non-functional requirements

| Area | Requirement |
|---|---|
| **Authority isolation** | The explanation model, the semantic decision layer, and both clients must have no credentials or code path to any payment endpoint. Enforce in code review and by test. |
| **Directory integrity** | No paid placement, ever. Records are derived from merchant-published sources and user-supplied domains; provenance and verification date are recorded per record. A merchant's presence is never influenced by commercial terms. |
| **Unknown payee handling** | A payee absent from the directory must fail closed into gate 2. It is never assumed acceptable, and it is visible to the guardian as unverified. |
| **Two-gate composition** | The semantic layer must compose with AND against the deterministic gate, such that the composite allow-set is provably a subset. Assert by test across a probability sweep, not by argument. |
| **Semantic fail-closed** | No answer, a provider `refusal`, a schema error, or a timeout must all resolve to REFUSE — never to ALLOW. |
| **Decision auditability** | Every semantic decision is journalled: rule, question hash, model id, **model version**, probability, confidence, thresholds, resulting band. |
| **Idempotency** | All payment calls carry an idempotency key; retries must not double-charge. |
| **Latency** | Gate 1 rule evaluation < 50 ms. Gate 2 adds 70–500 ms, but only on the ALLOW path and only for semantic rules (0–2 checks per purchase). The refusal explanation must never block the decision — the model runs on the *failure* path, which is why normal operation costs almost nothing. |
| **Data** | Teen PII minimised; no purchase-level content beyond the teen and guardian; regional retention limits configurable. |
| **Auditability** | Every authorisation, refusal, approval and ledger mutation is an append-only journal entry with a reason. |
| **Availability** | If the engine is unreachable, payments fail closed. There is no "degraded allow" mode. |
| **Accessibility** | WCAG 2.1 AA; the teen surface must work one-handed. Status is never conveyed by colour alone — every state carries an icon and a label as well as a colour. Money is set in tabular figures and never animates. Layouts must survive 130% text scaling. Full spec: `DESIGN-SYSTEM.md` §7. |
| **Design tokens** | One source of truth for colour, type, space and radius (`DESIGN-SYSTEM.md`). The UI and the architecture diagrams draw from the same palette — one colour language across product and documentation. |
| **Colour semantics** | Colour encodes state, never decoration: allowed, needs approval, refused, locked. **Refusal is amber, never red** — a refusal is a rule outcome, not an error. **Locked is muted, never alarming** — the ladder is a path, not a punishment. |
| **Layout discipline** | Grid (Bento) layouts only where the job is enumeration or review: the record, the grant editor, the merchant picker, the permission grid, goals. The teen's hero screen stays single-column with one number — a grid there would contradict "one number per screen". **Charts follow the same scoping**: a chart is a guardian instrument, permitted in the record and the monthly review, and never present on any surface the teenager can see — a chart there would invite comparison where the product owes an answer. See `DESIGN-SYSTEM.md` §5. |
| **Tool authority** | No tool reachable by any model may move money, widen a grant, or change a level. The only actions a model can trigger are explanation, notification and drafting for human review. Automations that can act on payment accounts — for example Zapier's PayPal actions — are reachable from the `report` tier and never from `decide`. This is the requirement that makes the stamina of the agent irrelevant to the safety argument. |

## 12. Compliance and risk

| Risk | Position |
|---|---|
| **Age / eligibility** | Target 13–17, aligned with Venmo Teen Account eligibility (13–17). Nothing aimed at under-13s, so COPPA is out of scope. |
| **Consent** | Guardian consent is explicit, signed, revocable, and auditable — a compliance asset, not a cost. |
| **Custody** | Tether never holds funds. Money sits in family-owned accounts; this keeps the product clear of money-transmission and custodial exposure. |
| **Model data handling** | Decision-layer questions are scoped to the *item and the rule*, never to the child: "is this a book" needs no personal data and should receive none. Prefer a provider offering **Zero Data Retention** and regional residency (US / EEA-CH) — the OpenAI Decisions API documents both. |
| **Model accountability** | A probability is attributable but not re-derivable, so no semantic decision may be the sole basis for a disputed payment. Gate 1 stays authoritative for anything a dispute turns on (FR-13.8). |
| **Advertising to minors** | The directory cannot be bought into: no paid placement, sponsorship, or promoted records. A teenager-facing merchant list is advertising-adjacent surface, and paid promotion there would be promotion to a minor — and would destroy the premise that only the guardian's rules shape what the kid sees. |
| **Securities** | No investing. Deliberate: PayPal has no brokerage, a minor's securities need a custodial account controlled by an adult, and contributions are irrevocable. |
| **Dispute standing** | Guardian is the disputing party of record; teens gain the ability only at a higher level. |
| **Liability framing** | We do not claim to resolve agentic-commerce liability. We produce the evidence that improves outcomes. |
| **Demo integrity** | No real money moves in the hackathon build; all payments are sandbox. State this on screen. |

## 13. Scope

**MVP (hackathon):** grant authoring and signing · engine evaluation with fail-closed semantics · refusal with explanation · approval flow · pay-with-saved-method capture · allowance and match payouts to Venmo · savings goal as a single-payee grant · level ladder with promotion/demotion · record with receipts · anomaly alert · the six-screen demo · **gate 2 wired end to end with one semantic rule (book-category or damage-photo), including the AND-composition test** · **merchant directory seed with the guardian picker and the teen permission view** · **design tokens codified as one source of truth, with the four-state colour language**.

**Stretch:** refund flow end to end · dispute drafting and filing · merchant-facing evidence packet view · line-item constraint in the buy flow · **a labelled eval set with per-rule threshold tuning** · **guardian-authored semantic rules** · **drift monitoring on stored decisions** · **teen-proposed merchants** · **catalog feeds (Store Sync / ACP) replacing the curated seed** · the reverse ladder (authority that shrinks, for an elderly parent or a supported adult) · **the investing rail behind a single `InvestmentRail` adapter** — demonstrated on Alpaca paper here, targeted at DriveWealth's Teen account in production.

**Out of scope:** card issuance · real KYC · **live investing and retirement accounts** — the production rail is chosen and recorded in §9, and a Roth IRA is legally unavailable to a minor's allowance · lessons or curriculum · multi-currency · under-13s · anything that custodies funds.

## 14. Risks and open questions

| # | Risk / question | Mitigation |
|---|---|---|
| 1 | **Vault charge succeeds only in sandbox-shape, not substance** | Verified in docs; confirm on day 1. Fallback: teen approves the first purchase, agent charges thereafter — pitch survives. |
| 2 | **Venmo checkout can't be substantively tested** | Don't rely on it. Use Payouts→Venmo for the allowance (real sandbox support) and reserve checkout-Venmo as a flourish. |
| 3 | **Teen account can't exist in sandbox** | Simulate the family relationship explicitly and say so on screen. It's our logic, not a payment feature. |
| 4 | **PayPal disputes need manual buyer simulation** | Design the demo around refunds and evidence-packet generation, which are API-driven. Add Braintree if a live dispute beat is essential. |
| 5 | **Novelty perception vs Greenlight/GoHenry** | Frame as authority infrastructure, never as a financial-literacy app. See `WINNING-IDEA.md`. |
| 6 | **Over-claiming AP2 conformance** | Say "AP2-shaped: real mandate chain, real constraint types, real fail-closed semantics; signatures simplified." |
| 7 | **Is the merchant persona just decoration?** | No — it is what makes the evidence packet a product decision rather than a slide. Keep at least the evidence-packet view. |
| 8 | **Model drift, or a deprecated model version silently changing what a past grant meant** | Journal the model id **and version** with every decision; re-score stored decisions nightly; treat a threshold that stops matching reality as a silent loosening and alert on it. |
| 9 | **Over-claiming calibration** | Do not claim calibrated probabilities without a labelled eval set. Until one exists, say "initial thresholds, under evaluation" — and note that because gate 2 can only tighten, an uncalibrated gate is a **friction** problem, not a safety problem. |
| 10 | **A judge reads "we use an LLM for the rules" and hears the opposite of our thesis** | Lead with the composition, not the model: "the model can only make us stricter" — and show the sweep test. Never say "the AI enforces the rules." |
| 11 | **We assume a merchant directory API exists to consume. It does not** | ACP states discovery is unresolved; Affirm publishes no directory API. Build the layer **behind our own interface** and seed it ourselves — the shape survives whichever registry ships. See `MERCHANT-DIRECTORY.md`. |
| 12 | **The directory becomes a shopping feed for the teenager, and the product becomes something else** | Read-only permission view; no prices, promotions, ratings or recommendations; test the screen against the anti-persona (P4). The rule: if it can drive a purchase, it doesn't belong on that screen. |
| 13 | **Directory staleness — a merchant's terms change underneath us** | Show `last_verified` to the guardian; re-derive on use where possible; treat unknown or stale as a gate-2 case, not a pass. |

## 15. Appendix A — glossary

**Grant (open mandate)** — the guardian's signed set of rules. **Authorisation (closed mandate)** — one evaluated spend attempt. **Receipt** — the signed record that a payment happened, carrying the payment identifier. **Ledger** — Tether's own running totals; authoritative for the engine. **Ladder** — the promotion/demotion policy that recomputes authority from evidence. **Trusted Surface** — the consent UI; must be deterministic and non-agentic. **MIT** — merchant-initiated transaction; a charge against stored credentials with the payer absent. **Gate 1** — the deterministic mandate engine; the only component that may authorise. **Gate 2 / semantic decision layer** — a model answering questions about *meaning* with calibrated probabilities; advisory only, composed with AND, so it can only tighten. **Bands** — the probability thresholds that map an answer onto satisfy / escalate / refuse. **State language** — the four states shared by the UI, the mockups and the diagrams: allowed, needs approval, refused, locked. Colour, icon and label always travel together. **Merchant directory** — the set of payees a grant can name, carrying the metadata the rules need. A configuration surface for the guardian, a read-only map of permissions for the teen, the ladder's user interface, and gate 2's deterministic ground truth for known merchants. Un-merchandisable by design.

## 16. Appendix B — sources for the load-bearing claims

- AP2 mandates as dispute-grade evidence, and consumer control over "budgets, categories, and timing": https://developer.paypal.com/community/blog/PayPal-Agent-Payments-Protocol/
- AP2 non-repudiable audit trail: https://ap2-protocol.org/
- Agentic dispute liability unresolved: https://worldpay.com/en/insights/articles/agentic-commerce-liability-is-still-being-written
- Merchants bearing liability for agent errors: https://finance.yahoo.com/technology/ai/articles/agentic-commerce-liability-gap-pays-051251394.html
- Agent-initiated disputes at ~2.4× the human rate: https://www.trustsphere.ai/post/when-the-agent-gets-it-wrong-liability-consent-and-recourse-in-ai-initiated-commerce
- Charge a saved account without the payer present: https://docs.paypal.ai/payments/methods/paypal/save
- Refund a captured payment: https://docs.paypal.ai/reference/api/rest/captures/refund-captured-payment
- Disputes API actions and evidence: https://docs.paypal.ai/growth/disputes/handle-disputes/use-disputes-api
- Dispute reasons and evidence: https://docs.paypal.ai/growth/disputes/reference/dispute-reasons
- PayPal dispute sandbox requires simulated buyer actions: https://developer.paypal.com/disputes/test-go-live
- Braintree instant-dispute test card and Venmo dispute amounts: https://developer.paypal.com/braintree/docs/guides/disputes/testing-go-live/php/
- Braintree Venmo sandbox limits: https://developer.paypal.com/braintree/docs/guides/venmo/testing-go-live
- Payouts to Venmo, and youth-account restrictions: https://docs.paypal.ai/growth/payouts/reference/payouts-api-test-values
- Jev / System One Models — typed probabilistic decisions, 70–500 ms, $0.042/MTok, no string generation: https://typesafe.ai/blog/introducing-system-one-models-and-jev
- OpenAI Decisions API — `predicate`/`choice`/`score`, refusal answers, threshold guidance, pricing, ZDR and residency: https://developers.openai.com/api/docs/guides/decisions
- Agentic commerce merchant discovery remains unresolved ("we're working to create discovery mechanisms"): https://www.agenticcommerce.dev/
- PayPal Agent Ready — the eligibility set is merchants who already accept PayPal: https://www.paypal.ai/us/agent-ready
- PayPal Store Sync — opt-in catalog feed for AI discoverability: https://www.paypal.ai/store-sync
- Affirm publishes no public merchant-directory API: https://anakin.io/catalog/affirm-com
- Venmo Teen Account, 13–17: https://help.venmo.com/cs/articles/teen-account-faq-for-parents-guardians-vhel117