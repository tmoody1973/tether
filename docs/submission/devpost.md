# Tether — Devpost submission text

> Draft by Claude from the built app, the decision records and the learning log (updated 2026-11-06 after shops, the
> redesign and push notifications shipped). Tarik: edit into your own voice before submitting.

## Inspiration

A fifteen-year-old wants to buy headphones online. Her parent's options are to hand over a card and hope, or to say no to everything. Neither teaches anything, and both get worse once AI shopping agents arrive, because nobody has settled who is responsible when software spends on someone's behalf. Tether is our answer: a parent signs the rules, an agent proposes, plain code decides, and PayPal pays.

## What it does

- **Amara signs a weekly mandate**: how much, which shops, how much her daughter Zoe promises to save. It reads like a contract. No AI is involved in it.
- **Amara saves her PayPal once**, on PayPal's own approval page (PayPal's vault). Zoe never has a PayPal account; PayPal requires users to be 18.
- **Amara chooses the shops.** She searches any shop (through Channel3), adds it or removes it with one confirm, and it applies at once as a new version of the rules. Zoe can search for a shop and ask for it.
- **Zoe shops with an AI agent** that searches only Amara's allowed shops (via Channel3) and proposes two or three options. It cannot buy anything.
- **Every cart goes through two gates.** Gate 1 is a deterministic rule engine. Gate 2 is an AI check for rules code can't judge ("is this really a book?"), and it can only make things stricter. *A model may add friction. Only code may remove it.*
- **Approved carts are paid with a single-use permission slip**: a signed token, valid two minutes, bound to that exact cart, then a charge to Amara's saved PayPal (Orders v2 with the vault id). The slip's id travels inside the PayPal order itself.
- **Amara hears about it on her phone.** When Zoe asks for something, Amara gets one push notification; tapping it opens the request with the budget consequence first, and one tap approves and pays.
- **Refusals teach.** One sentence with the real numbers and two ways forward. Amber, never red.
- **Freedom is earned.** What Zoe doesn't spend is her savings. Four weeks of keeping her own savings promise moves her up a level: more money, more shops, and at Level 3, parent-approved investing through an Alpaca sandbox account.
- **Amara can ask about the month** in plain English, right from her Home screen. A read-only assistant answers from PayPal's transaction list (through the PayPal Agent Toolkit) and Tether's receipts, filtered to her family. It cannot move money.
- **Every payment carries its proof**, one tap away: the PayPal ID, the rules version that allowed it, the permission slip, and whether PayPal's own records match.

## Why PayPal is central

PayPal is where consent is given and where the proof lives.

- **Consent:** Amara authorises Tether on PayPal's own page (Vault, `usage_type: MERCHANT`). Tether never sees her password and never gives Zoe a card.
- **Payment:** every approved cart is a merchant-initiated charge on the vaulted wallet (Orders v2 with `vault_id`), sent with a `PayPal-Request-Id` so a retry can never charge twice. We learned PayPal remembers that id for only 6 hours, so Tether re-sends only within 5 and otherwise looks the payment up instead.
- **Proof:** each order's `custom_id` is the permission slip's id. Tether reconciles its receipts against PayPal's Transaction Search, reading PayPal's transaction event codes (T-codes), and verifies signed webhooks. "This payment was allowed by rules v5" can be checked against PayPal's ledger, not just ours.
- **AI with PayPal's own tool:** Amara's month assistant reads her PayPal history through the PayPal Agent Toolkit (`list_transactions`), wrapped so it sees only her family's payments and only date, amount and status.

What PayPal doesn't do here, honestly: every sandbox charge pays one Tether merchant account, because charging a vaulted wallet with a different `payee` was refused in the sandbox. In production Tether would pay shops through PayPal's platform and agent-checkout programs.

## How we built it

Next.js 16 and TypeScript, Postgres on Neon (PGlite locally and in tests), Drizzle, deployed on Vercel from a protected `main` branch with CI on every pull request. 492 unit and integration tests, 39 browser tests, and a live end-to-end suite that runs against the deployed site with real sandbox PayPal, Channel3, Anthropic and Alpaca calls.

We built it task by task, with an independent code review after every task and a whole-system review at the end. Seventeen plain-English decision records explain the choices and what they cost.

### AI and tools used, and how

| Tool | Used for |
|---|---|
| **Claude Haiku 5.5** (Anthropic), through the **Vercel AI SDK** | Zoe's shopping agent (tool calls to Channel3, at most 6, proposes only); the gate-2 rule check (can only tighten); Amara's month assistant; plain-words fund descriptions (validated: no numbers, no advice). |
| **PayPal Agent Toolkit** | The month assistant's one tool, `list_transactions`, wrapped read-only and filtered to the family. |
| **PayPal REST APIs** | Vault (setup and payment tokens), Orders v2 (create and capture on the vault id), Webhooks (signature verification), Transaction Search (reconciliation). |
| **Channel3** | Product search scoped to allowed shops (the agent's tool), product lookup from a pasted URL, a price re-check at payment time, and shop search for Amara's and Zoe's shop lists. |
| **OneSignal** | Web push to Amara's phone when Zoe asks (works on iPhone once Tether is added to the Home Screen). |
| **Alpaca Broker API** (sandbox) | Level 3 investing: market data for fund facts, and the parent-approved order. |

We call PayPal's REST API directly for charges because the Agent Toolkit doesn't cover charging a vaulted wallet, and on purpose: no model in Tether has a tool that moves money.

## Challenges

- **Being honest about money when the network isn't.** A PayPal timeout doesn't mean nothing was spent. Tether keeps such a purchase "confirming" and asks PayPal again with the same request id, inside PayPal's 6-hour memory for it, and after that only looks the payment up.
- **A negative number isn't a refund.** Our first reconciliation marked every payment "Refunded in PayPal". The negative rows were PayPal's automatic sweep to a partner account (T-code T2002). Tether now classifies by PayPal's event codes, not by what a row looks like.
- **One PayPal account, many families.** Every charge lands in Tether's sandbox merchant account, so the assistant and the reconciliation had to be filtered to each family's own payments, by permission-slip id.
- **A sandbox success isn't a working flow.** Payouts to a teen's Venmo looked fine in the sandbox, but PayPal's production rules refuse youth accounts. We designed around it: money stays with the parent.

## What we're proud of

- The AI can never loosen a decision or move money, and the tests prove it.
- The record is a proof: every payment has the signed rules and the permission slip behind it, checked against PayPal's own ledger.
- A refusal is never a dead end, and the teen earns her way to more freedom.

## How it differs

Teen money apps today mostly hand the teen a prepaid card with limits on it. Tether gives her no card at all: the money stays in the parent's PayPal, an agent shops inside rules the parent signed, every charge carries a single-use permission bound to one cart, and freedom grows with her own track record rather than by a parent raising a limit.

## Honest limits (sandbox stand-ins)

- Every purchase pays one Tether sandbox merchant account; the receipt records which shop it was for.
- Investing uses an ordinary Alpaca sandbox account labelled as a stand-in, because the sandbox refuses custodial accounts. One setting switches to the custodial request.
- A demo clock fast-forwards a month so it fits in a demo. The public demo is one shared family that resets itself; anyone who turns on notifications as Amara gets the demo's asks.

## What's next

Paying shops directly through PayPal's platform and agent-checkout programs, a real custodial investing account, passkeys instead of private links, one family per household, OneSignal identity verification and email notifications, and a gentler lock-screen wording option ("Zoe has a request for you").

## Built with

`paypal` `paypal-agent-toolkit` `anthropic` `claude` `vercel-ai-sdk` `channel3` `onesignal` `alpaca` `next.js` `typescript` `vercel` `neon` `postgresql` `drizzle` `playwright` `vitest`

**Try it:** https://tether-five-beta.vercel.app · **Code:** https://github.com/tmoody1973/tether
