# The decision layer — Jev, the Decisions API, and the guardian's rules

Companion to `AGENT.md` (the agent and its fences), `PRD.md` (requirements), `mandate_engine.py` (gate 1) and `semantic_gate.py` (gate 2, running).

---

## 0. Verdict

**Yes for meaning. Never for authority. And there is a way to do it that is provably safe rather than merely careful.**

The idea — hand the guardian's rules to a decision model — is the right instinct aimed at the wrong half of the problem. These products are genuinely excellent for the part of a mandate that is about *meaning*: is this a book, is this a real retailer, is this item damaged. They must never be handed the part that is about *authority*: what is left in the budget, who may be paid, has this grant expired.

The reason is not caution. It is that a probability cannot be re-derived, and a mandate that cannot be re-checked is not a mandate.

---

## 1. What these two things actually are

Both are **discriminative decision endpoints**: finite answer sets in, typed answers with **calibrated probabilities** out, no prose.

| | **Jev** (TypeSafe AI) | **Decisions API** (OpenAI) |
|---|---|---|
| **What it is** | First "System One Model" — a new class built for structured decisions inside code | A dedicated decision endpoint, public beta |
| **Announced** | 15 Sept 2026 | DevDay 2026, public beta from ~7 Oct 2026 |
| **Output** | Type-safe structured values only. **Gives up string generation**, so it "can't hallucinate" and cannot produce a type error | `answers[]`, one per question |
| **Answer types** | Typed values + calibrated probabilities + confidence | `predicate` → probability 0–1 · `choice` → one of your labels + distribution + confidence · `score` → probability-weighted average over ordered levels |
| **Input** | Unstructured data with an emphasis on **structured program state** | Text, or messages containing text **and images** |
| **Latency** | **70–500 ms** (40–200× faster than an LLM) | ~10× faster than the Responses API |
| **Cost** | **$0.042 / MTok input**, output free ("too cheap to meter") | **$0.10 / MTok input**, no output charges |
| **Limits** | Early access. No image input yet. Cardinality up to 255 | `gpt-6-luna` only, so far. Dependent questions need separate requests |
| **Compliance** | — | ZDR and HIPAA for eligible customers; US and EEA/Switzerland residency |

Endpoint shape, from OpenAI's own docs:

```
POST /v1/decisions
{ "model": "gpt-6-luna",
  "input": "…evidence…",
  "questions": [ { "type": "predicate", "name": "visible_damage",
                   "instructions": "Does the product have visible damage…?" } ] }
```

Usefully, an answer can come back as `type: "refusal"` — the model declining to judge. That maps cleanly onto failing closed.

## 2. The tempting mistake

TypeSafe markets Jev as "**smart if-statements** … classify, route, score, extract, or branch where hand-written logic is too brittle," and notes that "the surrounding code constrains their freedom, making them easier to compose into reliable systems."

A mandate engine *is* a pile of if-statements. So the pitch writes itself: **hand the rules to the model and delete the engine.**

And it would mostly work. That word is the whole problem.

## 3. The two gates

![Two gates, composed with AND](https://private-us-east-1.manuscdn.com/sessionFile/z1WmEoe9zcCtwaTZyZdthu/sandbox/KKhney1fFeJjI5kTa04j5l-images_1791514409032_na1fn_L2hvbWUvdWJ1bnR1L3RldGhlci9kZWNpc2lvbi1nYXRlcw.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvejFXbUVvZTl6Y0N0d2FUWnlaZHRodS9zYW5kYm94L0tLaG5leTFmRmVKakk1a1RhMDRqNWwtaW1hZ2VzXzE3OTE1MTQ0MDkwMzJfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwzUmxkR2hsY2k5a1pXTnBjMmx2YmkxbllYUmxjdy5wbmciLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTM0OTEyMDB9fX1dfQ__&Key-Pair-Id=K2QY5QTL8JSY6C&Signature=MEUCIQCmibtnLUoVO9gmVaButBqw79sSe3kgNMOB~h~ROS8A-gIgChi5Y-jvYLJGApTPYg0FcgZhm-WK4dzlfj-PhgQLMK8_)

| | **Gate 1 — deterministic** | **Gate 2 — semantic** |
|---|---|---|
| **Answers** | Arithmetic and structure: budget, amounts, payees, expiry, recurrence, one-shot use, cart hash | Meaning: is this a book, is this a real retailer, does this photo show damage |
| **Returns** | PASS or a machine reason | A calibrated probability |
| **Authority** | **Authoritative.** Only gate 1 can authorise | **Advisory.** Can only tighten |
| **Sees untrusted content** | No | **Yes — by design** |
| **Failure mode** | Fails closed on unknown rules | Fails closed on no answer, error, or refusal |
| **Cost / latency** | Essentially zero | ~$0.00001 per check, 70–500 ms |

## 4. The safety property

Let **D** be gate 1's allow-set and **S** gate 2's. The composite is composed with **AND**:

```
composite = D ∩ S   ⊆   D
```

**Adding a model can only ever shrink the set of things money can do.** It is not a matter of the model behaving well. It is set arithmetic. The only structural change a decision model can make to Tether is to make it stricter.

> **A model may add friction. Only code may remove it.**

This is asserted in `semantic_gate.py`, including a **101-point probability sweep** from p=0.00 to p=1.00 confirming that no value can override a gate-1 refusal. The composite outcome is `ALLOW` only when gate 1 allowed **and** every semantic rule cleared its threshold.

## 5. Why this makes untrusted content safe to feed it

This is the payoff, and it is the reason the arrangement is worth building at all.

Gate 2 is the component that reads merchant pages. Those pages are hostile inputs. A normal agent architecture would be terrified of that, because a gate that can decide is a gate that can be talked out of deciding.

Here, injection through gate 2 **cannot create a payment**. A fooled model can, at worst, cause a *refusal* or an *unnecessary approval request* — an annoyance, logged, with a human in the loop. Tested directly: with a classifier scripted to return 1.0 for everything, a hostile page still cannot pay an unauthorised payee or exceed the weekly budget.

So the answer to "isn't it dangerous to let a model read the internet?" becomes: **not in this position.** The dangerous position is a model that can loosen, and there isn't one.

## 6. The three bands

Because both products return probabilities rather than verdicts, one semantic rule maps onto Tether's existing three outcomes. The practical thresholds:

| Probability | Outcome | Reasoning |
|---|---|---|
| **p ≥ 0.98** | **satisfy** → the rule is met | Wrongly permitting costs money and trust, so the bar is high |
| **0.70 ≤ p < 0.98** | **ESCALATE** → ask the guardian | The uncertainty goes to a human rather than being guessed |
| **p < 0.70** | **REFUSE** → with a reason | Confidently not what the rule requires |
| *no answer / error / refusal* | **REFUSE** | Fail closed |

OpenAI's own guidance is to "choose thresholds based on the cost of false positives and false negatives" — which in this product means: escalating is cheap, wrongly allowing is expensive. Hence the asymmetric band. `allow_at` should be tuned per rule against a labelled set, and **logged**, so thresholds become a measured decision rather than a preference.

Note that the uncertain band is not a cop-out; it is the product working. **"I'm not sure this is a book — ask your mum" is a better outcome than either a guess or a silent block.**

## 7. Where gate 2 earns its place

The test for whether a rule belongs to gate 2: **could you write it as hand-written logic?** If yes, it belongs to gate 1. Only rules that are irreducibly about meaning qualify.

| Rule the guardian might write | Why it needs a model |
|---|---|
| "Books only" | Deciding whether a listing *is* a book, from a title and category, is a semantic judgement |
| "Real shops, not marketplaces" | Whether a merchant sells its own goods or resells gift cards is not in a field |
| "Not if it doesn't match the reason she gave" | Comparing a stated reason against an actual item is meaning, not arithmetic |
| "Flag anything that looks like a scam pitch" | A judgement, and a flag — never an action |
| **"I'll refund it if the photo shows damage"** | Vision predicate. See §9 |
| Refund and dispute reason classification | Routing a complaint into a category, which then routes to a human |

All four of the first four are *escalations or refusals*. None of them can permit anything on their own.

## 7b. The long tail is the point — the directory as ground truth

Gate 2 should not be the first resort for questions that have *definite answers*. The merchant directory (`MERCHANT-DIRECTORY.md`) holds class, direct-vs-marketplace and refund-window data taken from the merchant's own published terms, so for a **known merchant those questions resolve deterministically and gate 2 is never called at all.** Only an **unknown** merchant — added by link, or proposed by the teenager — reaches the model, and it must **fail closed** rather than be assumed acceptable.

That is a better outcome on three counts: model usage collapses to the long tail; the common case becomes deterministic and therefore replayable in a dispute; and the answers are more accurate, because a merchant's published refund policy beats a model's impression of a web page. Practically, it means **derive gate 2's questions from the directory's fields** — one question set per field — instead of inventing questions and hoping the answers stay consistent.

## 8. Where it must never go

| # | Reason | Consequence if ignored |
|---|---|---|
| 1 | **A probability is not re-derivable** | The dispute evidence packet becomes "a model said probably". AP2's whole contribution is a mandate that is *verifiably* authorised; a model verdict is not that |
| 2 | **Unknown rules must fail closed** | Deterministic code refuses constraint types it doesn't implement. A classifier asked an out-of-distribution question answers confidently instead of saying "unknown" — unless you add `UNKNOWN` to the answer set and treat it as refuse |
| 3 | **The demo line dies** | "The AI was never asked whether she could spend" is the strongest line in the pitch. Handing it the rules deletes it |
| 4 | **Money becomes nondeterministic** | Same inputs, different answer on retry. Untestable, and unfixable in a dispute |
| 5 | **Model choice becomes load-bearing** | A deprecated model version silently changes what past grants meant |
| 6 | **Cost and latency land on the critical path** | Inverts the "the model runs on the failure path" advantage that makes this cheap to operate |

Reason 1 is the decisive one for a payments product. If the evidence packet for a disputed £15 purchase cannot be recomputed, you have not built a mandate — you have built a suggestion.

## 9. The photographic refund flow — the find

OpenAI's documentation example for the Decisions API is **"check an image for visible damage"**, using a `predicate`:

> *"Does the product have visible damage, such as a crack, tear, or dent? Ignore shadows and damage to the packaging."*

That is, nearly verbatim, Tether's refund evidence flow from `PRD.md` §10.3:

1. Zoe taps **Something's wrong** and photographs the item.
2. A `predicate` scores visible damage.
3. **p ≥ 0.80** → the refund request is filed automatically, with the photo attached.
4. **0.40 ≤ p < 0.80** → the claim escalates to Amara, with the photo.
5. **p < 0.40** → refused, with a reason, and a route to dispute it.

The kid no longer has to argue her case, and the guardian is not asked to be a judge of photography. And because it is a predicate, it can only ever add friction — the mandate still controls the money.

This also gives the *merchant* persona something: a damage assessment attached to a refund request is exactly the evidence a merchant wants before approving one.

## 10. Choosing a vendor — and staying vendor-agnostic

The gate does not care which product answers. Its interface is:

```python
classifier.ask(question, context) -> Decision(label, probability, confidence, model, version)
```

Three implementations ship in `semantic_gate.py`:

| Class | Uses | When to pick it |
|---|---|---|
| `OpenAIDecisionsClassifier` | `POST /v1/decisions`, `gpt-6-luna` | **Default.** Multimodal (needed for photo evidence), compliance options, GA trajectory, one vendor for prose and decisions |
| `JevClassifier` | TypeSafe Jev | Cheapest and fastest by ~2×; best if you need many checks per purchase. Early access, and no image input yet |
| `ProxyProbabilityClassifier` | Any chat model via strict JSON schema | **Build with this if you have no beta access.** It reproduces the same probability contract, so the gate logic is identical and swapping later is a one-line change |

That last row is the practical point: gate 2 can be built **today** with no new vendor relationship, and the design survives whichever product wins.

## 11. Auditability — the honest limitation

A model decision is **attributable but not re-derivable**. Record it as such, and never let it be the sole basis for a disputed payment:

```json
{ "rule": "checkout.semantic_category", "question_hash": "sha256:1c9e…",
  "model": "gpt-6-luna", "model_version": "2026-10-07",
  "probability": 0.986, "confidence": 0.91,
  "allow_at": 0.98, "refuse_below": 0.70, "outcome": "ALLOW",
  "at": "2026-10-08T16:04:11Z" }
```

Then a dispute packet says exactly what was asked, what came back, and which band routed it. It cannot be recomputed in two years, and we should say so rather than imply otherwise. **That constraint is precisely why gate 1 stays authoritative, and it should be stated in the submission rather than discovered by a judge.**

## 12. Compliance note

For a product whose payload is a teenager's purchase behaviour, prefer a decision provider offering **Zero Data Retention and regional residency** — the Decisions API documents both (US and EEA/Switzerland), which is one more reason it is the default. Whichever vendor is used, the questions should be scoped to *the item and the rule* rather than to the child: "is this a book" needs no personal data, and shouldn't receive any.

## 13. Results

```
mandate_engine.py     15/15 checks passed
semantic_gate.py      20/20 checks passed
```

Gate 2 coverage includes: the three bands · the model overridden by gate 1 at p=0.999 · the model tightening a gate-1 allow at p=0.01 · the 101-point sweep · classifier timeout → refuse · explicit refusal → refuse · a popped classifier cannot pay an unauthorised payee · a fooled classifier cannot exceed the budget · two rules agreeing → settle · one rule uncertain → escalate · the photo predicate at both confirmed and ambiguous confidence.

And a live run through the real gate on a real model call:

```
model=gpt-5-mini  probability=0.99  confidence=0.9
gate says: ALLOW — p=0.990 >= 0.98 — confident this is a book
end-to-end composed outcome: ALLOW (paid=True)
```

The build needed one small change to gate 1: `attempt_spend(..., dry_run=True)`, so the engine can **decide** without **settling**. That is the two-phase protocol `AGENT.md` already describes — decide, then let gate 2 tighten, then settle — and it means the model is never handed a request that has already moved money.

## 14. What to build next

1. **A labelled eval set.** 100–200 real product listings per semantic rule, with human labels. Without it, `allow_at` is a guess and you cannot claim calibration.
2. **Per-rule thresholds**, tuned to observed precision, with the target being *zero wrongful allows* rather than maximum automation.
3. **Always include an explicit `UNKNOWN` answer** in any `choice`/`score` question and treat it as refuse, to preserve fail-closed on out-of-distribution input.
4. **Drift monitoring.** Re-score stored decisions nightly; a threshold that stops matching reality is a silent loosening.
5. **Make the guardian write the question.** The `instructions` a rule sends is the rule. Letting a parent phrase "what counts as a book" in their own words — and seeing the plain-words sentence it produces — is the natural extension of the grant screen, and it is the honest place for a model in a consent flow: **it drafts, the human signs.**

## Sources

- Jev / System One Models launch — architecture, latency, pricing, "no type errors", image support status: https://typesafe.ai/blog/introducing-system-one-models-and-jev
- Jev as a decision model (typed decisions, calibrated probabilities, no text generation): https://en.wikipedia.org/wiki/Jev_(AI_model)
- OpenAI Decisions API guide — question types, response shape, refusal answers, thresholds guidance, pricing, ZDR/HIPAA/residency: https://developers.openai.com/api/docs/guides/decisions
- Decisions API public beta announcement: https://community.openai.com/t/decisions-api-is-now-available-in-public-beta/1403877
- AP2 mandates as dispute-grade evidence (why decisions must be re-derivable): https://developer.paypal.com/community/blog/PayPal-Agent-Payments-Protocol/
- Comparing the two decision-model approaches: https://www.firecrawl.dev/blog/openai-decisions-api-vs-jev