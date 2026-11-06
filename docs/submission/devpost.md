# Tether — Devpost submission text

> Draft by Claude from the built app, the decision records and the learning log. Tarik: edit into your own voice before submitting.

## Inspiration

A fifteen-year-old wants to buy headphones online. Her parent's options are to hand over a card and hope, or to say no to everything. Neither teaches anything, and both get worse once AI shopping agents arrive, because nobody has settled who is responsible when software spends on someone's behalf. Tether is our answer: a parent signs the rules, an agent proposes, plain code decides, and PayPal pays.

## What it does

- **Amara signs a weekly mandate**: how much, which shops, how much her daughter Zoe promises to save. It reads like a contract. No AI is involved in it.
- **Amara saves her PayPal once** with PayPal's vault. Zoe never has a PayPal account (PayPal requires users to be 18).
- **Zoe shops with an AI agent** that searches only Amara's allowed shops (via Channel3) and proposes two or three options. It cannot buy anything.
- **Every cart goes through two gates.** Gate 1 is a deterministic rule engine. Gate 2 is an AI check for rules code can't judge ("is this really a book?"), and it can only make things stricter. *A model may add friction. Only code may remove it.*
- **Approved carts are paid with a single-use permission slip**: a signed token, valid two minutes, bound to that exact cart, then a charge to Amara's saved PayPal (Orders v2 with the vault id). Every receipt carries its PayPal capture id and the rules version that allowed it.
- **Refusals teach.** One sentence with the real numbers and two ways forward. Amber, never red.
- **Freedom is earned.** What Zoe doesn't spend is her savings. Four weeks of keeping her own savings promise moves her up a level: more money, more shops, and at Level 3, parent-approved investing through an Alpaca sandbox account.
- **Amara can ask about the month** in plain English. A read-only assistant answers from PayPal's transaction list (through the PayPal Agent Toolkit) and Tether's receipts, filtered to her family. It cannot move money.

## How we built it

Next.js 16 and TypeScript, Postgres on Neon (PGlite locally and in tests), the Vercel AI SDK with Claude Haiku, PayPal REST (Vault, Orders v2, Webhooks, Transaction Search), the PayPal Agent Toolkit (read-only), Channel3 for product search, and the Alpaca Broker API for investing. Deployed on Vercel from a protected `main` branch with CI on every pull request; 430+ automated tests plus a live end-to-end suite that runs against the deployed site.

We built it task by task, with a fresh code review after every task and a whole-system review at the end. Fourteen plain-English decision records explain the choices and what they cost.

## Why PayPal is central

PayPal is where the money lives and moves. The vault is what lets a parent pre-authorise without giving her teen a card; Orders v2 on the vaulted wallet is every charge; webhooks and Transaction Search are how Tether proves its record matches PayPal's. The Agent Toolkit gives the parent's assistant read-only eyes on her PayPal history. We call the REST API directly for charges because the toolkit doesn't cover vaulted-wallet charges.

## Challenges

- **Being honest about money when the network isn't.** A PayPal timeout doesn't mean nothing was spent. Tether keeps such a purchase "confirming" and asks PayPal again with the same request id. Then we learned PayPal forgets request ids after 6 hours, after which a repeat silently becomes a new charge; Tether now re-sends only inside 5 hours and otherwise looks the payment up.
- **One PayPal account, many families.** Every charge lands in Tether's sandbox merchant account, so the assistant and the reconciliation had to be filtered to each family's own payments, by capture id and permission-slip id.
- **A sandbox success isn't a working flow.** Payouts to a teen's Venmo looked fine in the sandbox, but PayPal's production rules refuse youth accounts. We designed around it: money stays with the parent.

## What we're proud of

- The AI can never loosen a decision or move money, and the tests prove it.
- The record is a proof: every payment has the signed rules and the permission slip behind it.
- A refusal is never a dead end, and the teen earns her way to more freedom.

## Honest limits (sandbox stand-ins)

- Every purchase pays one Tether sandbox merchant account; the receipt records which shop it was for. In production Tether would pay shops as a PayPal platform partner or through their own agent checkouts.
- Investing uses an ordinary Alpaca sandbox account labelled as a stand-in, because the sandbox refuses custodial accounts. One setting switches to the custodial request.
- A demo clock fast-forwards a month so it fits in a demo. The public demo is one shared family that resets itself.

## What's next

Passkeys instead of private links, a real custodial investing account, one family per household, and paying shops directly through PayPal's platform and agent-checkout programs.

## Built with

`paypal` `paypal-agent-toolkit` `next.js` `typescript` `vercel` `neon` `postgresql` `drizzle` `anthropic` `claude` `vercel-ai-sdk` `channel3` `alpaca` `playwright` `vitest`

**Try it:** https://tether-five-beta.vercel.app · **Code:** https://github.com/tmoody1973/tether
