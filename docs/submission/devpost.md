# Tether — Devpost submission text

> Draft by Claude from the built app, the decision records, the learning log and the problem research (updated
> 2026-11-07 after investing at Level 2, stocks, the investing assistant, Log in with PayPal and the landing page
> shipped). Tarik: edit into your own voice before submitting. Every figure below is from
> [`docs/research/problem.md`](../research/problem.md), which has the full citations and sample sizes.

## Inspiration

A fifteen-year-old wants to buy headphones online. Her parent's options are to hand over a card and hope, or to say no to everything. We went looking for how big each part of that problem is.

**Parents: kids spend their money without real permission.** The US Federal Trade Commission has made four companies refund parents for children's unauthorised charges: Apple at least $32.5M (2014), Google at least $19M (2014), Amazon more than $70M in charges made eligible for refunds (2017), and Epic Games $245M (2022). Epic, the FTC said, "ignored more than one million user complaints." Lending a card is still the workaround: in a July 2025 survey of 1,000 US teens aged 13–18, 21.6% said their parents let them use their credit cards, "often for ... online shopping" (Junior Achievement Fintech Survey, Wakefield Research, analysed by the MissionSquare Research Institute).

**Teens: they want autonomy, and classes barely change behaviour.** In Schwab's October 2025 survey of 1,000 teens and 1,000 parents, 64% of teens wanted their parents to have "only a little control" over their investing, while 50% of parents wanted to be "heavily involved" (Schwab sells a teen investing account). A meta-analysis of 201 studies found financial-education classes explain "only 0.1% of the variance in financial behaviors," with negligible effects 20 months on; the authors see a role for "just in time" education tied to a real decision (Fernandes, Lynch & Netemeyer, *Management Science*, 2014). And only 35% of the Class of 2026 had to take a personal-finance course to graduate (NGPF, April 2026).

**Saving: most teens don't put money aside for later.** In a February 2025 survey of 1,000 US teens aged 13–18, only 36% said they save part of the money they receive for their future (Junior Achievement and MissionSquare Foundation, Wakefield Research; MissionSquare is a retirement-plan firm). What helps comes mostly from studies of adults: committing in advance lifted employees' saving rates from 3.5% to 13.6% over 40 months (Thaler & Benartzi's Save More Tomorrow, 2004), and reminders that named a saver's own goal raised saving where the same reminder without the goal did not (Karlan, McConnell, Mullainathan & Zinman, 2016). The one randomised savings-commitment trial with children we found, in Ugandan primary schools, found they saved *more* under a softer commitment than under a strict lock (Karlan & Linden, *Journal of Development Economics*, 2025). Tether's savings promise is that kind of soft pledge. Its weeks-to-goal number and earned freedom are design choices grounded in this evidence, not results proven for teens.

**Investing: teens are interested, but don't know much.** In Schwab's survey, 70% of teens aged 13–17 were very or extremely interested in investing, but only 14% said they know a lot about it. Young investors start early and often with crypto: 82% of US Gen Z investors began before 21, and 44% started with crypto (FINRA Foundation and CFA Institute, 2023, investors aged 18–25). And investing as a child is becoming a federal default: the IRS's new Trump Accounts give children born from 2025 to 2028 a $1,000 starting contribution.

**Payments and AI: nobody has settled how an agent proves it was allowed to buy.** Google's Agent Payments Protocol (AP2), with PayPal as a named partner, lists as open questions "Proving that a user gave an agent the specific authority to make a particular purchase" and "Determining accountability if a fraudulent or incorrect transaction occurs." Morgan Stanley estimates AI shopping agents at $190–385B of US online sales by 2030. Yet in an ACI Worldwide survey of more than 3,300 US and UK shoppers, only 7% of fashion shoppers would let an AI assistant buy without approval (reported via Retail Dive; ACI sells payments software). And teens are outside all of it: PayPal accounts are for people 18 and over, and none of the agent-payment announcements we read covers a parent authorising an agent for a child.

Tether is our answer to all five: a parent signs the rules, an agent proposes, plain code decides, and PayPal pays.

## What it does

**For the parent (Amara):**

- **She signs a weekly mandate**: how much, which shops, whether online purchases need her OK, how much her daughter Zoe promises to save. It reads like a contract. No AI is involved in it, and every change makes a new version.
- **She saves her PayPal once**, on PayPal's own approval page (PayPal's vault). Zoe never has a PayPal account or a card.
- **She chooses the shops.** She searches any shop (through Channel3), adds or removes it with one confirm, and it applies at once as a new rules version. Zoe can search for a shop and ask for it.
- **She hears about asks on her phone.** When Zoe asks for something, Amara gets one push notification; tapping it opens the request with the budget consequence first, and one tap approves and pays. She can approve a one-off purchase over Zoe's weekly budget, for that exact cart and amount.
- **She can ask about the month** in plain English from her Home screen: what Zoe bought, how Zoe's investments are doing, what's inside a fund, and news about a company on her list or inside her funds. The assistant is read-only and answers from PayPal's transaction list (through the PayPal Agent Toolkit), Tether's receipts, Zoe's investments and market data. News appears only here, only when Amara asks, never on Zoe's screens.
- **Every payment carries its proof**, one tap away: the PayPal ID, the rules version that allowed it, the permission slip, and whether PayPal's own records match.

**For the teen (Zoe):**

- **She shops with an AI agent** that searches only Amara's allowed shops (via Channel3) and proposes two or three options. It cannot buy anything.
- **Refusals teach, at the moment she decides.** One sentence with her real numbers and two ways forward ("Ask Amara" or "It fits next week"). Amber, never red.
- **Saving, and freedom earned from it.** What she doesn't spend is her savings. She sets her own weekly savings promise (nothing is locked; it is scored when the week ends), names a goal, and sees one number: weeks to get there. Keeping her promise four weeks in a row moves her up a level: more money and more shops. At the month-end check-in Amara releases what Zoe saved plus a match.
- **From Level 2 she can invest**, in funds and in single stocks. She searches the whole market and reads a facts-only page: "What's inside" for a fund (its biggest holdings), "About the company" for a stock (sector, industry, where it's based). Tether recommends nothing, and refuses leveraged and inverse products by their names. To propose, she answers three questions in her own words; Amara approves each one and Tether places the order.

**Every cart goes through two gates.** Gate 1 is a deterministic rule engine. Gate 2 is an AI check for what code can't judge ("is this really a book?"), and it can only make things stricter. *A model may add friction. Only code may remove it.* An approved cart is paid with a **single-use permission slip**: a signed token, valid two minutes, bound to that exact cart, then a charge to Amara's saved PayPal. The slip's id travels inside the PayPal order itself.

**Anyone can start their own family.** On the landing page, a parent clicks **Log in with PayPal**, names their teen, and follows three steps on Home: save your PayPal, sign the first rules, send the teen the link (copy it or scan a QR code). Log in with PayPal is also how they get back in. Or open the shared demo family in one click, as Amara or as Zoe.

**The landing page** explains all of this in one scroll, with the three problems and their sources, the four steps, the two agents and what they can't do, and what the sandbox stands in for.

## Why PayPal is central

PayPal is where the parent says who she is, where consent is given, and where the proof lives.

- **Identity:** a parent starts a family and comes back to it with **Log in with PayPal** (PayPal's sign-in for other sites). Tether keeps only the PayPal account ids, the email and a first name to greet by, and the wallet it saves must be the PayPal account the parent logged in with.
- **Consent:** Amara authorises Tether on PayPal's own page (Vault, `usage_type: MERCHANT`). Tether never sees her password and never gives Zoe a card. Because PayPal accounts are for adults, charging the parent's wallet is the route PayPal's terms allow, not a workaround.
- **Payment:** every approved cart is a merchant-initiated charge on the vaulted wallet (Orders v2 with `vault_id`), sent with a `PayPal-Request-Id` so a retry can never charge twice. PayPal remembers that id for only 6 hours, so Tether re-sends only within 5 and otherwise looks the payment up instead.
- **Proof:** each order's `custom_id` is the permission slip's id. Tether reconciles its receipts against PayPal's Transaction Search, reading PayPal's transaction event codes (T-codes), and verifies signed webhooks. "This payment was allowed by rules v5" can be checked against PayPal's ledger, not just ours.
- **AI with PayPal's own tool:** Amara's month assistant reads her PayPal history through the PayPal Agent Toolkit (`list_transactions`), wrapped so it sees only her family's payments and only date, amount and status.

The signed weekly rules plus the per-cart permission slip are the same shape as AP2's "mandates", built for the most supervised case there is: a parent and a teen. Tether doesn't implement the AP2 protocol itself.

What PayPal doesn't do here, honestly: every sandbox charge pays one Tether merchant account, because charging a vaulted wallet with a different `payee` was refused in the sandbox. In production Tether would pay shops through PayPal's platform and agent-checkout programs.

## How we built it

Next.js 16 and TypeScript, Postgres on Neon (PGlite locally and in tests), Drizzle, deployed on Vercel from a protected `main` branch with CI on every pull request. 770 unit and integration tests, 49 browser tests, and a live end-to-end suite that runs against the deployed site with real sandbox PayPal, Channel3, Anthropic and Alpaca calls.

We built it task by task, with an independent code review after every task and a whole-system review at the end. Twenty-six plain-English decision records explain the choices and what they cost.

### AI and tools used, and how

| Tool | Used for |
|---|---|
| **Claude Haiku 5.5** (Anthropic), through the **Vercel AI SDK** | Zoe's shopping agent (tool calls to Channel3, at most 6, proposes only); the gate-2 rule check (can only tighten); refusal sentences (may only use the engine's dollar amounts); plain-words fund and company descriptions (validated: no numbers, no advice). |
| **Claude Sonnet 5.5** (Anthropic), through the **Vercel AI SDK** | Amara's month assistant, which reasons across four read-only sources: PayPal transactions, Tether's receipts, Zoe's investments, and what's inside her funds and the news. |
| **PayPal Agent Toolkit** | The month assistant's PayPal tool, `list_transactions`, wrapped read-only and filtered to the family. |
| **PayPal REST APIs** | Log in with PayPal (Identity: sign-in and userinfo), Vault (setup and payment tokens), Orders v2 (create and capture on the vault id), Webhooks (signature verification), Transaction Search (reconciliation). |
| **Channel3** | Product search scoped to allowed shops (the agent's tool), product lookup from a pasted URL, a price re-check at payment time, and shop search for Amara's and Zoe's shop lists. |
| **Financial Datasets** | What's inside a fund (its biggest holdings), "About the company" for a stock, and news for Amara's assistant. Called through narrow tools with a daily cap and a cache, not a general data server. |
| **Alpaca Broker API** (sandbox) | The whole-market search, prices for the facts pages, and the parent-approved order. |
| **OneSignal** | Web push to Amara's phone when Zoe asks (works on iPhone once Tether is added to the Home Screen). |

We call PayPal's REST API directly for charges because the Agent Toolkit doesn't cover charging a vaulted wallet, and on purpose: no model in Tether has a tool that moves money.

## Challenges

- **Being honest about money when the network isn't.** A PayPal timeout doesn't mean nothing was spent. Tether keeps such a purchase "confirming" and asks PayPal again with the same request id, inside PayPal's 6-hour memory for it, and after that only looks the payment up.
- **A negative number isn't a refund.** Our first reconciliation marked every payment "Refunded in PayPal". The negative rows were PayPal's automatic sweep to a partner account (T-code T2002). Tether now classifies by PayPal's event codes, not by what a row looks like.
- **One PayPal account, many families.** Every charge lands in Tether's sandbox merchant account, so the assistant and the reconciliation had to be filtered to each family's own payments, by permission-slip id.
- **One sandbox login, many judges.** Judges all sign in with the same shared PayPal sandbox account, so "this PayPal owns one family" would have put every judge after the first into the first judge's family. Tether now treats that login per browser: each browser gets its own family, and nobody sees anyone else's.
- **Log in with PayPal's reply wasn't the shape the docs suggested.** PayPal's guides name two different addresses for "who is this person", and the sandbox's reply carried `user_id` and a full `name` but no first name, so new parents were greeted as "Parent". Tether now accepts either id and greets by the first word of the full name, checked live in the sandbox.
- **A sandbox success isn't a working flow.** Payouts to a teen's Venmo looked fine in the sandbox, but PayPal's production rules refuse youth accounts. We designed around it: money stays with the parent.

## What we're proud of

- The AI can never loosen a decision or move money, and the tests prove it.
- The record is a proof: every payment has the signed rules and the permission slip behind it, checked against PayPal's own ledger.
- A refusal is never a dead end, and the teen earns her way to more freedom, including investing she has to explain in her own words.

## How it differs

Teen money apps today mostly hand the teen a card with limits on it, and the parent sees the spending afterwards. Tether gives her no card at all: the money stays in the parent's PayPal, an agent shops inside rules the parent signed, every charge carries a single-use permission bound to one cart, and freedom grows with her own track record rather than by a parent raising a limit.

## Honest limits (sandbox stand-ins)

- Every purchase pays one Tether sandbox merchant account; the receipt records which shop it was for.
- Investing uses an ordinary Alpaca sandbox account labelled on screen as a stand-in, because the sandbox refuses custodial accounts. One setting switches to the custodial request.
- A demo clock fast-forwards time so a month fits in a demo; the screen says so.
- The shared sandbox PayPal login works per browser: Log in with PayPal brings you back to your family only in the browser you made it in. Another browser, or cleared cookies, starts a new family. With your own sandbox account it works from anywhere.
- Self-started families are removed after 7 days, and at most 30 can start a day. The shared demo family resets itself; anyone who turns on notifications as Amara gets the demo's asks.
- We considered eToro instead of Alpaca, because it takes PayPal deposits. We stayed with Alpaca: eToro is for adults only, its personal API keys exclude acting for third parties, its API documentation never mentions PayPal, and the API meant for apps like Tether needs a partner contract.

## What's next

More than one teen per parent, a real custodial investing account, paying shops directly through PayPal's platform and agent-checkout programs, passkeys instead of private links, OneSignal identity verification and email notifications, and a gentler lock-screen wording option ("Zoe has a request for you").

## Built with

`paypal` `paypal-agent-toolkit` `log-in-with-paypal` `anthropic` `claude` `vercel-ai-sdk` `channel3` `financial-datasets` `onesignal` `alpaca` `next.js` `typescript` `vercel` `neon` `postgresql` `drizzle` `playwright` `vitest`

**Try it:** https://tether-five-beta.vercel.app · **Code:** https://github.com/tmoody1973/tether
