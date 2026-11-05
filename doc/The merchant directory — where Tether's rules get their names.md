# The merchant directory — where Tether's rules get their names

Answering: *Affirm shows the merchants that work with the platform. Is there an API like that for Tether? Does it make sense?*

Companion to `PRD.md` (FR-14), `AGENT.md` (the agent), `DECISION-LAYER.md` (gate 2).

---

## 0. The short answer

1. **Affirm's merchant directory has no public API.** It is a curated surface — a consumer list plus a business-facing partner directory — not a consumable data feed.
2. **No consumer merchant-directory API exists for Tether to consume today.** And this is not an oversight we can wait out: ACP, the open standard for agentic checkout, says plainly that discovery is *unresolved* — "we're working to create discovery mechanisms for AI platforms to identify businesses that have implemented ACP."
3. **But the enabling pieces are real and landing now**, and they are better suited to Tether than a directory API would be.
4. **Does it make sense? Yes — and it is more load-bearing than it looks.** The grant needs a merchant vocabulary to enforce against. But it only works if we build the *opposite* of Affirm's.

---

## 1. What Affirm actually does

Affirm works with 330,000+ merchants, and the list surfaces in its app and at affirm.com. There is also a business-facing [Partner Directory](https://www.affirm.com/business/partners/directory) for platforms and processors.

What there is **not** is an API to read the merchant list. Affirm's developer surface — the Direct API, the Merchant Object, settlement events — is scoped to *a merchant integrating Affirm*, not to *a third party reading who accepts Affirm*. Third-party sources confirm there is no public data API for it.

**Why the list exists matters more than how it's exposed.** It exists to generate demand: merchants get placement, Affirm gets volume. It is a **merchandised** surface, and everyone understands that.

That is fine for a credit product aimed at adults. It is structurally wrong for Tether, for one reason: **placement can be bought.**

## 2. What is actually emerging — and it suits us better

| Piece | What it is | Why it matters here |
|---|---|---|
| **PayPal Agent Ready** | "If you already accept PayPal, you are agent ready." No new merchant setup; Seller/Purchase Protection and fraud tooling extend to agentic transactions | The eligibility set is simply *merchants who accept PayPal* — the same set Tether already needs for the payment leg |
| **PayPal Store Sync** | A merchant connects their catalog "in one click" to improve **catalog discovery across AI platforms** | The nearest thing to a real, opt-in merchant/catalog feed today |
| **Agentic Commerce Protocol** (Stripe + OpenAI, Apache 2.0) | Merchants publish an agent-facing checkout endpoint, REST **or MCP**, and retain control of what's sellable and how it's presented | The direction of travel: a merchant-owned, machine-readable endpoint rather than a central list |

ACP's own FAQ is the honest state of the art on discovery:

> "We're working to create discovery mechanisms for AI platforms to identify businesses that have implemented ACP."

and on who decides participation:

> "No, each AI platform will manage their own process for how businesses can participate."

So the accurate answer to "is there an API for this?" is: **not a directory to consume — but a self-published, merchant-owned endpoint pattern to integrate with, plus an opt-in catalog feed.** Tether should be shaped for that rather than waiting for a list.

## 3. The reframe: a configuration surface, not a discovery surface

This is the whole design, in two sentences:

| | Directory exists so that… | Therefore |
|---|---|---|
| **Affirm** | shoppers discover **where they can borrow** | it is merchandised — placement is commercial |
| **Tether** | a guardian declares **where their kid's money is allowed to work** | it cannot be merchandised at all |

The grant's `checkout.allowed_merchants` and `payment.allowed_payees` constraints need merchant identifiers to enforce against. Today `PRD.md` FR-1.1 says "permitted merchants (multi-select)" — multi-select **from what?** The directory is the answer, and it is what turns an empty field into a rule the engine can actually check.

### The constraint that follows

> **A directory that can be bought into is not a safety product.**

No paid placement. No sponsorship, no promoted records, no ranking sold to a merchant — ever.

This is not only ethics. The audience is 13–17, so paid merchant promotion shown to a teenager is **advertising to a minor**, and it would destroy the single asset this product has: that the guardian's rules, and nothing else, shape what the kid sees. Affirm can sell placement. Tether cannot, and saying so out loud is a differentiator rather than a limitation.

### What that looks like on screen

- **Guardian:** a picker. Grouped by class, with the rule-shaping fields shown (is this a marketplace? what's the refund window? when was it last verified?).
- **Teen:** a read-only **map of permissions** — not a shopping mall. No prices, no promotions, no ratings, no reviews, no "trending", no recommendations.

The test is simple: **if it can drive a purchase, it doesn't belong on the teen's screen.** That is already consistent with FR-10.2 (*no per-purchase feed, ever*) and §9's *no autonomous merchant discovery* — this just extends the principle to the directory.

## 4. The directory is gate 2's ground truth

This is the part I did not expect, and it makes the directory a *safety* asset rather than a UX convenience.

Gate 2 asks semantic questions — is this a real retailer, or a marketplace reselling gift cards? Those questions have **definite answers** for merchants we know, drawn from the merchant's own published terms. So:

| Payee | Resolution | Gate 2 consulted? |
|---|---|---|
| **In the directory** | class, direct-vs-marketplace, refund window and rail support read from the record — **deterministic** | **No.** The common case is code |
| **Unknown** | conservative defaults, flagged as unverified | **Yes** — answered in the band, and it must **fail closed** |

Three consequences, all good:

1. **Model usage collapses to the long tail.** The cost and latency argument in `PRD.md` §11 ("the model runs on the failure path") gets *stronger*.
2. **The common case becomes replayable.** A directory-sourced answer is deterministic, so it survives a dispute; a model probability doesn't (`DECISION-LAYER.md` §11).
3. **The answers get better.** A merchant's own published refund window beats a model's impression of a web page, every time.

And it inverts how you'd write the rules: **derive gate 2's questions from the directory's fields** — one question set per field — rather than inventing questions and hoping the answers are consistent.

## 5. The directory is the ladder's user interface

The best idea in this note.

`PRD.md` P2's design implication is that *"the path to more freedom must be permanently visible."* The ladder currently expresses that in prose — a sentence on a screen. The directory expresses it as a **grid**:

| Tile state | Shows | Example |
|---|---|---|
| **Open** | spendable now | Corner Store · up to $20 a week |
| **Needs approval** | allowed, but ask first | Sneaker Shop · approval each time |
| **Locked** | why, and what unlocks it | Bookshop · opens at Level 2 |

So "Zoe can shop at Bookshop now, because she earned Level 2" becomes something she can *see*, not something she is *told*. The ladder stops being a policy and becomes a place. This is worth a screen of its own, and it pairs naturally with the existing mockup set.

It also gives the teenager something the anti-persona does not want: **information, not temptation.**

## 6. What a record must contain

Grant-serving fields, not catalog-serving ones. The discipline is that every field must earn its place by shaping a *rule*.

| Field | Why the rules need it |
|---|---|
| `merchant_id` | The payee identifier the engine enforces on. The only field load-bearing at enforcement time |
| `display_name`, `logo`, `domain` | The picker, and domain matching for "add by link" |
| `class` | grocery · transport · books · apparel · food — feeds `checkout.semantic_merchant_class` |
| `direct_retailer` vs `marketplace` | Ground truth for gate 2's *real shop* question. Marketplaces are the gift-card/resale risk |
| `accepts` | paypal · venmo · card — determines which rail leg works |
| `agent_transactable` | Whether the agent can complete a purchase at all (M1/M2 manual vs an ACP endpoint) |
| `unattended_default` | A guardian default for online approval, which they can override — not a lock |
| `typical_price_band` | Lets the guardian set a sane per-transaction max instead of guessing |
| `refund_window`, `dispute_window` | Needed by the refund flow, and by the `merchant.terms` tool |
| `provenance`, `last_verified` | A stale directory is a liability, not a neutral omission. A model's answer doesn't rot; a record does |

**Explicitly not in a record:** prices, promotions, ratings, reviews, "recommended for you", popularity.

## 7. Derived, not curated

Do not hand-build a directory — it will rot and it will look arbitrary. Derive it, in this order:

1. **The merchant's own published terms** (refund policy, whether they're a marketplace).
2. **A domain the user supplies** — the guardian or the teen pastes a link.
3. **PayPal eligibility** — accepts PayPal ⇒ payable.
4. **Catalog feeds** — Store Sync or an ACP endpoint, when the merchant publishes one.

For the hackathon, a curated JSON seed is the honest stand-in, labelled as a seed rather than pretending to be a registry.

## 8. Cold start — the real problem it actually solves

A parent opening the grant screen to an empty merchant field will bounce. Three mechanisms fix it, and the third is the best demo beat in the product:

1. **Starter sets by class.** "Groceries, transport, books" recommended at Level 1. The guardian *edits* rather than *invents*.
2. **Add by domain.** Paste a link; the directory resolves it; anything unresolved goes to gate 2 with conservative defaults.
3. **The teen asks for a place.** Zoe proposes a merchant; Amara approves or declines in one tap; the grant updates.

That third one is worth dwelling on. It **reverses the usual flow** — the kid proposes the payee and the guardian signs — and it is the ladder working in the direction the teenager actually cares about. It is also a natural extension of FR-13.10's principle: *the model drafts, the human signs.* Here, **the kid asks, the guardian decides.**

## 9. The hackathon build

| Piece | Detail |
|---|---|
| `merchants.json` | 8–10 records. Deliberately include **one marketplace-like merchant** (exercises gate 2's *real shop* rule) and **one merchant absent from the directory** (exercises the fail-closed fallback) |
| `directory.lookup(domain)` | A **read-only** agent tool. Read-only is what keeps it safe to give the agent |
| Guardian picker | Multi-select grouped by class, with `direct_retailer`, `refund_window` and `last_verified` visible |
| Teen permission view | The ladder grid: open / needs approval / locked, with what unlocks each |
| Ask-for-a-place flow | Teen proposes → guardian approves → grant updates |
| Test | A payee absent from the directory must **fail closed into gate 2**, never be assumed acceptable |

## 10. The pitch line

> **Affirm's directory tells you where you can borrow. Tether's tells you where you're allowed to go — and nobody can buy their way onto it.**

And the durable framing, for the strategic slide: as agentic commerce settles on merchant-published catalogs and MCP endpoints (Store Sync, ACP), this stops being a Tether invention. It becomes a **consumer-side view of a machine-readable merchant registry, filtered by what a guardian permits rather than by who paid for placement.** That is a defensible position independent of any directory API shipping.

## Sources

- Affirm partner directory (business-facing, curated): https://www.affirm.com/business/partners/directory
- Affirm developer surface — merchant-integration APIs only, no directory endpoint: https://docs.affirm.com/developers/reference/introduction
- Third-party confirmation that Affirm publishes no public data API: https://anakin.io/catalog/affirm-com
- PayPal Agent Ready — "if you already accept PayPal, you are agent ready"; protection extended to agentic transactions: https://www.paypal.ai/us/agent-ready
- PayPal Store Sync — connect a catalog for AI discoverability: https://www.paypal.ai/store-sync
- Agentic Commerce Protocol — open standard, REST + MCP, discovery explicitly unresolved: https://www.agenticcommerce.dev/
- ACP docs: https://www.agenticcommerce.dev/docs
- PayPal agentic commerce developer overview: https://docs.paypal.ai/growth/agentic-commerce/overview
- MCP as the emerging agent-facing discovery interface for commerce: https://developer.mastercard.com/merchant-cloud/documentation/tutorials-and-guides/agentic-commerce-guide/23/