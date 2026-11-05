# Tether — hackathon build design

**Date:** 2026-11-05 · **For:** PayPal AI Hackathon (Devpost) · **Deadline:** Thursday 12 November 2026, 12:00 pm Pacific — seven days from this document
**Status:** **approved by Tarik, 2026-11-05**, including D16, D17 and the level table in D15. Supersedes the money model in `doc/Tether — Product Requirements Document (1).md` (v0.5) and the v0.4 PDF where they conflict; everything not contradicted here still stands.
**Who decided what:** each decision below is marked **Tarik**, **Claude** (Claude's call, open to veto), or **joint**.

---

## 1. Intent — what this is and why

**One sentence.** A parent signs a short set of spending rules for a 13–17-year-old; every purchase is checked against those rules by plain code *before* any money moves; and the teen's freedom grows automatically as she shows she can handle it.

**Why it matters.** Today the "rules" for a teen's money live in a parent's memory and mood. Existing teen cards (Greenlight, GoHenry, Venmo Teen) already offer fixed limits, store blocks, and ask-a-parent requests — so those are *not* what's new here. What's new:

1. **Authority that is earned.** Limits widen on their own when the evidence says she's ready, and narrow when it says she isn't. We found no product that does this.
2. **A model that can only say "no" or "ask a parent," never "yes."** AI explains refusals and judges fuzzy questions ("is this a book?"), but by construction it can only add friction. Code alone approves money.
3. **A parent-signed spending mandate for an AI shopping flow.** PayPal's own description of AP2 (the Agent Payments Protocol, an emerging standard for letting software spend on someone's behalf) is a user who "pre-approves defined conditions (e.g., budget, product categories, or timing)," producing "dispute-grade evidence." Tether is that, with the twist that the *signer* (the parent) and the *spender* (the teen) are different people.

**Why now.** The hackathon's prizes include *Best Use of Agentic Commerce* and *Most Impactful*. PayPal has no teen product (its user agreement requires account holders to be "at least 18 years old, or the age of majority in your state") and no user-facing spending controls for agents. Tether fills a gap PayPal has.

**What success looks like.** A judge can open a link, act as the parent and the teen, and watch: rules signed → a purchase refused with the arithmetic → an approval → a real PayPal sandbox charge → a receipt that names the rule that allowed it → a level-up earned from evidence. Plus a sub-3-minute video that shows the same, and a public repo that runs.

## 2. Goals, non-goals, anti-goals

**Goals (this build)**
- Every purchase passes the deterministic rule engine before PayPal is called.
- Every charge is a real PayPal sandbox capture from the parent's saved PayPal wallet.
- Every refusal comes with the arithmetic and two ways forward, written by a model in teen language.
- Every payment has a receipt linking it to the exact rule version that allowed it.
- Authority (budget, shops, approval needs) changes at month-end from evidence both sides can see.
- The teen can find things only within the shops the parent allowed (via Channel3).

**Non-goals**
- In-person spending (no card for the teen — see decision D5).
- Paying real retailers for real (sandbox only; Tether's own sandbox business account stands in for every shop — D7).
- Roundups, credit, crypto. (Investing *is* in scope: see D13.)
- Real identity verification (KYC) or real family relationships — the family is simulated, and the screen says so.
- Live disputes.

**Anti-goals — fails even if it "works"**
- A model ever approving a payment, widening a rule, or changing a level.
- Tether ever holding the family's money (no money-transmitter exposure).
- The teen's screens becoming a shop window: no promotions, no recommendations, no "trending," no affiliate/commission links.
- Pretending a sandbox simulation is real. Every seam is labelled on screen.

## 3. Hard constraints

| Constraint | Source |
|---|---|
| Submit by **Thu 12 Nov 2026, 12:00 pm PT** | Devpost rules §1 |
| Must "meaningfully" use PayPal **and** AI; PayPal must be central | Devpost overview + rules |
| Functional demo judges can run: setup instructions in repo **or** a hosted URL; mockups don't count | Devpost "What to Submit" |
| Public GitHub/GitLab/Bitbucket repo with an open-source license visible in the About section | Devpost "What to Submit" |
| YouTube video under 3 minutes, showing it working; no third-party trademarks or copyrighted music without permission | Devpost "What to Submit" |
| Judged equally on: Technological Implementation, Design, Potential Impact, Innovation, Presentation | Devpost judging criteria |
| A project can win one Grand **or** one Honorable Mention prize, **plus** at most one Sponsor prize | Rules §8 |
| PayPal sandbox only; no real money | PRD §12 "Demo integrity" |

## 4. Decisions

### D1 — The money stays in the parent's PayPal (joint: Tarik's pasted plan + Claude's research)
The weekly grant is a **number in Tether's ledger**, not money handed to the teen. When the engine approves a purchase, Tether charges the **parent's saved PayPal wallet** for that exact cart. Every dollar the teen spends passes the rule engine. Tether never holds funds.

### D2 — No allowance payout to the teen's Venmo (joint)
Three independent reasons, all verified:
- PayPal refuses payouts to youth accounts: error **14767 `RECEIVER_YOUTH_ACCOUNT`** — "Unable to send Payouts because the recipient has a youth account" (developer.paypal.com/payouts/use-payouts/view-transactions).
- A payout is paid from the *sending business's* balance ("INSUFFICIENT_FUNDS: … add money to your account"), so Tether would first have to collect and hold the parent's money.
- Money in the teen's Venmo is spendable on her Venmo card, outside every Tether rule.

Consequence: the "Money waiting" screen (`doc/teen-07-money-waiting.png`) is dropped.

### D3 — Savings = the unspent part of the grant; roundups dropped (Tarik's pasted plan; Claude agrees)
Whatever Zoe doesn't spend this week counts as saved. "Saved 30%" becomes exact arithmetic the engine already does, which is what the level rules need. Roundups are dropped: they would let Zoe hit the savings bar without ever choosing to save, which undermines the level system and the design-system rule that savings are never framed as virtue.
**Stated honestly on screen:** saved money is still physically in the parent's PayPal. It is the parent's promise, tracked by Tether — not money in Zoe's hands.

### D4 — Releasing savings is a parent action outside the API (Claude's call)
At month-end, if Zoe is promoted, Tether computes **"release $X saved + $X match"** and asks Amara to release it.
- **No PayPal or Venmo API can move money from Amara's Venmo to Zoe's Venmo Teen Account.** Venmo's person-to-person payments have no public API; Payouts refuses youth accounts. Venmo's own help page says the parent funds a Teen Account "by sending your teen a payment" — in the app.
- So in production Amara sends it herself in Venmo, then taps **"I've sent it"** in Tether. Tether records this as **parent-confirmed**, not proven.
- There is no official Venmo link that pre-fills the payment (the old `venmo://paycharge` scheme is undocumented and reported broken). Tether shows the amount and Zoe's Venmo handle; Amara does the rest.
- **In the demo:** the release screen, the computed amounts, and the "I've sent it" confirmation. No Payouts call. (Calling Payouts with a test value would demo something production can't do.)

### D5 — Online-only (Claude's call; Tarik raised the question)
Zoe has no card and the PRD rules out issuing one, so an in-person purchase would bypass the engine. The vault charge happens with the payer absent, which suits online checkout. The agentic-commerce story is online. Replace the mockups' *Corner Store* and *City Transit* with online shops.
In-person life is covered by D4: money Zoe has earned and Amara has released lands on her Venmo Teen card. Pitch line: *"Online, where agents shop, Tether holds the rules. What she's earned, she carries."*

### D6 — The teen can search, but only inside the shops her parent allowed (Tarik's idea; Claude adopts with guardrails)
Channel3's search takes a **website filter** ("Restrict results to retailer offers from selected websites"). Each allowed shop in the parent's list carries its Channel3 website ID, so the teen's search only ever returns things from allowed shops.
Guardrails:
- Results are labelled with the rule outcome Zoe would get: **fits your week** / **needs approval** / **over budget**. Not ratings, not "popular."
- No Channel3 "similar products" or recommendation calls on the teen side.
- **No affiliate tracking:** don't send Channel3's `x-user-id` header and don't render offer buy-links as clickable. (Channel3 pays commissions on sales; Tether's pitch is that nobody can buy their way onto the list.)
- The **permission grid** screen (open / ask first / locked) stays price-free, per PRD FR-14.3. Search lives in the Ask flow, not on that screen.

### D7 — One sandbox business account stands in for every shop, unless a day-1 test says otherwise (Claude's call)
A wallet saved with `usage_type: MERCHANT` is, per PayPal's reference, "used for future transaction directly with a merchant." Separately, PayPal's **"Pay another account"** page (labelled *Direct merchant*) says a regular merchant can send an order's money to a different account by adding a `payee` object with that account's `email_address` or `merchant_id`. **Not documented:** whether `payee` works together with a saved wallet (`payment_source.paypal.vault_id`). Day-1 spike (≈10 minutes in sandbox): charge the saved wallet with `payee` set to a second sandbox business account.
- **If it works:** each demo shop can be its own sandbox business account, and receipts show genuinely different merchants.
- **If it doesn't:** **Tether's sandbox business account receives every charge**, and the receipt records which shop it stood in for. On screen: *"Sandbox: payments go to a stand-in merchant. In production, Tether pays shops as a PayPal platform partner, or through shops' own agent checkouts (PayPal Agent Ready)."*

### D8 — One sponsor prize: Channel3 (Claude's call)
Only one sponsor prize can be won. Channel3 ($1,500) is load-bearing for the product (D6, and turning a pasted link into a real cart), and requires the project to actually call it. AG Grid, Astropods and Zapier are out of this build. Alpaca is in (D13), but it isn't a sponsor and carries no prize.

### D9 — Fix the engine's single-purchase bug with per-purchase tokens (Claude's call)
Verified by running it: `doc/mandate_engine.py` marks the **whole weekly grant** as used after one purchase, so the second ordinary purchase is refused (`[mandate.one_shot] grant … already consumed`). The test named "a replayed grant cannot authorise a second charge" is really two different purchases. Fix per `doc/The Tether agent — how it works (1).md` §6: the engine mints a **single-use authorisation token per purchase**, bound to the cart hash, expiring in 2 minutes, signed with HMAC (a keyed hash the agent can't forge). "Single-use" applies to the token, not the grant. Add a test: two different purchases in one week, both under budget, both allowed; replaying the same token, refused.

### D10 — Demo history comes from real sandbox charges plus a demo clock (Claude's call)
The level-up needs a month of evidence, and the demo has minutes. So:
- **A demo clock** (a "today" the app reads instead of the computer's clock) is threaded through the engine, ledger, grant expiry, token expiry and renewal **from day 1**. A guardian-side control, labelled *"Demo: advance to end of week / end of month"*, moves it forward.
- **Seeded history is made of real sandbox charges.** A seeding script runs the actual vault charge for each past purchase, so every receipt in the record carries a real PayPal sandbox capture ID. No invented IDs.
- Added to the honesty list (§11): *"Demo clock: time is fast-forwarded for the demo."*

### D11 — Judges operate one shared, pre-set-up demo family with a reset button (Claude's call)
- One demo family (Amara + Zoe), already set up: grant signed, Amara's sandbox PayPal saved, a month of seeded history.
- A **"Reset demo"** control restores that state, including re-saving the wallet if someone used Revoke.
- The README publishes the sandbox login for Amara's test PayPal account (the rules explicitly ask for sandbox logins needed to test), so a judge *can* re-run the save-your-PayPal step; the video shows it either way.
- Not one family per visitor: that adds roughly a day and nobody judges it.

### D12 — No charts for the teen; teach at the moment of decision instead (Claude's call, evidence-based)
Research summary (researcher-read sources; see `docs/decisions/005`): classroom-style financial education "explain[s] only 0.1% of the variance in financial behaviors" and fades within about 20 months; the recommended fix is "'just in time' financial education tied to specific behaviors" (Fernandes, Lynch & Netemeyer 2014). In 76 randomised trials, education moves knowledge about twice as much as behaviour (Kaiser et al. 2022). Charts mostly build knowledge; the only spending chart shown to change behaviour was a single, framed comparison with the person's own past. Peer comparison *reduced* saving (Beshears et al. 2015), and people stop looking at money dashboards when the news is bad.
So the teen gets **sentences, not charts**, at three moments (added to the Should list):
1. **On an approved purchase**, not just a refused one: "This sets Headphones back 1 week."
2. **On the week-ended screen**, two or three sentences comparing Zoe only with herself: "Inside your rules 4 of 4 weeks. Headphones: 3 weeks away."
3. **On the goal screen**, the one number is **weeks to goal**, with the single goal bar the design system already allows.
Charts stay on Amara's review screens only. The pitch line: *"No lessons — the learning happens at the moment she decides."*

### D13 — Investing: a one-day stretch, gated on two day-1 checks (revised; joint — Tarik's pasted plan, Claude's corrections)
**Revision (2026-11-05, later the same day).** Tarik's plan answers two of the objections below: the teen *proposes* and the parent approves (so the custodian places the trade, as the law requires), and the parent keeps an allowlist of funds (so Tether recommends nothing). It also reuses Tether's own machinery: investing unlocks at Level 3, Gate 1 checks "amount ≤ savings" and "fund is on the parent's allowlist" with no model involved, the engine mints a token, and the receipt records "this money can't be taken back."
**Claude's corrections to that plan, from Alpaca's docs:**
- **Fund the custodial account with the sandbox Transfer API, not a journal from Tether's own Alpaca account.** Sandbox "Transfer API simulates deposits… The target account is immediately credited," which mirrors production (Amara's own bank → the custodial account). Moving money from Tether's account is "cash pooling," which Alpaca says needs its review and "you may need a local license."
- **No fake fallback.** If the sandbox refuses `account_type: "custodial"`, drop the investing beat. Don't relabel an ordinary account as custodial.
- **The parent picks the funds.** Tether ships no default fund list (an app suggesting investments is likely an investment adviser).
- **Market hours are a designed state:** "Order queued for market open." Orders placed outside market hours wait instead of filling.
- **The MCP server is a build tool, not part of the app.** Alpaca's Broker MCP (`https://broker-api.sandbox.alpaca.markets/mcp`, `search` / `get_schema` / `execute` / `create_sandbox_account`) helps write the adapter. Access is "limited to only approved partner super users," so test it on day 1. The fallback is Alpaca's docs and REST calls.
**Teen market search (Tarik's call, 2026-11-05; only if the investing beat is built):** investing is long-term saving, not shopping, so the "if it can drive a purchase" rule doesn't apply. **Zoe can search the whole market.** Every result has one action: **"Propose to Amara."** Amara approves or declines adding it to her list, the same way Zoe proposes a new shop (PRD FR-14.8). Browsing always leads to a decision. Guardrails that still apply: no "most active" or "top movers" lists (hype); results are ordered by match to what she typed, never by popularity; no price charts and no daily price moves (D12); Tether ranks and recommends nothing. Each lookup shows Alpaca's asset facts (name, exchange, whether it can be bought in fractions) and one sentence of price history ("$X today, $Y a year ago"), not a chart. A model may turn those facts into plain words. It gets only the data Alpaca returned and may not add claims or opinions, the same way the refusal explainer works. Data comes from `data.sandbox.alpaca.markets`, which is free (live prices from one exchange, IEX, or full-market prices 15 minutes late).
**Final decision (Tarik, 2026-11-05): investing is a Must and will not be cut.** Tarik has the hours. The deadline is still fixed.
**Day-1 checks decide *how*, not *whether*:**
1. A free Broker dashboard signup gives sandbox keys.
2. `POST /v1/accounts` with `account_type: "custodial"` succeeds in that sandbox.

If check 2 fails, ask Alpaca support the same day to enable custodial accounts in sandbox (their docs say IRA accounts need the same request). If it still isn't enabled by **Sunday 8 Nov**, use an ordinary sandbox account labelled on screen and in the seams list as *"stand-in for a custodial account — the sandbox couldn't create one."* That reverses the earlier "no fake fallback" call. It's acceptable only because it's disclosed, and only as a last resort.
Still true: the money leaves Amara's PayPal for good, and PayPal can't fund an Alpaca account. In the video, present investing as the top rung of the ladder, after the PayPal spine, so the PayPal story leads. Spike result (2026-11-05): check 1 passes (Broker sandbox keys work, via OAuth not Basic); check 2 FAILS: `POST /v1/accounts` with `account_type: "custodial"` returns 403 `{"code":40310000,"message":"creating custodial \"USA\" accounts is not enabled"}`. Alpaca support must enable it (email today); fallback date stands. See docs/spikes/2026-11-05-results.md.

### D13 (original) — Investing is a roadmap slide, not part of this build (Claude's call)
Verified (Alpaca's own docs, read 2026-11-05): Alpaca's Broker API has a free, self-serve sandbox where "all trades … are simulated" with the paper-trading engine, and it supports custodial (UGMA/UTMA — accounts an adult manages for a minor) accounts via `account_type: "custodial"`. This **corrects** `doc/HACKATHON-PARTNERS.md`, which says Broker API has no paper trading. It's still out of this build because:
- Money put in a custodial account becomes the teen's irrevocable property and leaves Amara's PayPal, breaking D1.
- PayPal can't fund an Alpaca account (funding is bank transfer, wire or Plaid), so the most impressive screen would not be PayPal's.
- Legally "a minor cannot use or trade in a custodial account," and an app that suggests investments is likely an investment adviser (investor.gov: robo-advisers "must comply with the securities laws applicable to … registered investment advisers").
- Whether custodial accounts are switched on by default in a fresh sandbox is unverified.
Roadmap slide: *"Level 4: savings can be invested. Zoe proposes, Amara approves, held in a custodial account."* That's the same "kid proposes, parent signs" pattern as the rest of Tether.

### D14 — Amara's savings as a second PayPal account: a day-1 test, not a promise (Claude's call; Tarik's idea)
PayPal US allows "1 Personal account and 1 Business account" per person, so a second *personal* account is out; a *business* account is allowed. If the D7 spike shows a saved-wallet charge can be sent to another account, a weekly charge can move Zoe's unspent allowance from Amara's PayPal into a sandbox account labelled "Zoe's savings (Amara's)". That fixes D3's weak spot — savings would be real money set aside, not a promise. Label on screen: *"In production this goes to Amara's PayPal Savings goal, which has no API today. This is the API we'd ask PayPal for."*
Unverified: whether PayPal treats a charge between one person's own personal and business accounts as a problem in production.

### D16 — Investing screens: borrow Greenlight's mechanics, not its hype (Claude's call; prompted by Tarik's Greenlight screenshots)
| Greenlight element | Tether | Why |
|---|---|---|
| Search with a **1-year change** label per result | **Keep** | A long-term frame, not a daily one. Show down years in the neutral style, never red (design system). |
| Guided **"Ask yourself…" questions** before buying | **Keep, as the proposal itself** | Zoe's answers in her own words travel with "Propose to Amara," so Amara decides on Zoe's reasoning. Include one risk question: *"How would you feel if this dropped by a third next year?"* |
| **Comparison with the S&P 500** | **Keep, as one fixed 5-year line on the fund page only** | The only chart form with evidence of changing behaviour is a single framed comparison (Levi, from the D12 research). This is the one exception to D12, and it lives on the fund page, not her home screen. |
| **1D / 1W / 1M toggles** | **Drop** | Short-term moves are noise and teach the opposite of saving. |
| **"Bella bought stock in Nvidia"** social cards | **Drop** | Showing what peers saved *reduced* saving (Beshears et al. 2015). |
| **"Nvidia could be a good fit!"** verdict | **Drop** | The app judging a stock is a recommendation (investment-adviser territory). Tether shows facts; Zoe judges; Amara decides. |
| "Performed 1160% better than the S&P 500" headline | **Replace** with a plain sentence that reads the same in up and down years: *"Over 5 years: this $X, the whole market $Y."* | Picking a past winner teaches hindsight, not judgement. |

Data notes: 1-year and 5-year changes and the market comparison (via an S&P 500 fund such as SPY) can be calculated from Alpaca's price history. **Competitor maps and company descriptions are not in the Alpaca data I verified.** The guided questions don't need them: Zoe answers in her own words. Don't copy Greenlight's visual design; build from Tether's design system.

### D17 — A web app installable to the phone (a PWA), not a native app (confirmed; already decided in `doc/Tether — UX plan …` §0)
A PWA (progressive web app: a website that can be added to the home screen and opens like an app). Reasons, in order:
1. **Judges must be able to run it.** A URL beats an app they'd have to install, and the rules accept "a hosted demo URL."
2. **Zoe gets a link, not an install** (UX plan: "A 15-year-old will not install her mother's chosen app. She will tap a link").
3. **Seven calendar days.** App-store review is slow and can reject; TestFlight-style betas still make judges install something.
4. **PayPal's save-your-wallet flow and both APIs are web-first.**

Caveats: on iPhone, web push notifications only work once the PWA is added to the home screen (UX plan, iOS 16.4+). Record the video on a real phone with the app installed to the home screen, because the rules want it shown "functioning on the device for which it was built."

### D18 — Zoe's propose-only shopping agent (Tarik approved, 2026-11-05)
Added so AI sits on Zoe's main path and agentic commerce is literal (judging: Technological Implementation; *Best Use of PayPal + AI*; *Best Use of Agentic Commerce*). Built per `doc/The Tether agent — how it works (1).md` §4, §10, §11, §13:
- Input: one sentence from Zoe. Tools: **read-only** Channel3 search (filtered to allowed shops' website IDs) and lookup. **At most 6 tool calls**, single-shot, no retry loop, human-initiated only.
- Output: 2–3 proposed carts (items, total, cart hash, one-line reason). Each runs through Gate 1 (and Gate 2 where a meaning rule applies) **before** display, so cards show their outcome label.
- The agent holds no signing key and no PayPal access; it cannot mint a token. Product text is treated as untrusted input; tests feed it a hostile page and assert no tool other than read-only search/lookup is ever called and the decision is unchanged.
- One text box, not a chat (UX plan §12).

### D19 — PayPal confirms settlement, and the record is reconciled against PayPal (Tarik approved, 2026-11-05)
- A purchase moves from "Paying…" to "Paid" on PayPal's `PAYMENT.CAPTURE.COMPLETED` webhook (verified via PayPal's verify-webhook-signature call), with the capture response as the fallback if the webhook is slow. Mock webhooks can't pass signature verification (PayPal docs), so test with real sandbox events.
- Amara's record compares Tether's receipts with PayPal's Transaction Search (`GET /v1/reporting/transactions`) and flags mismatches. **Requires "Transaction search" to be switched on in the sandbox app (currently off).**

### D20 — Amara's read-only "Ask about the month" assistant on PayPal's agent toolkit (Tarik approved, 2026-11-05)
`@paypal/agent-toolkit` (v1.11.0) lets an app "specify which actions should be allowed" (README). Tether enables only transaction listing (and merchant insights if read-only) and adds one read-only Tether tool for the record. No money-moving PayPal tool is ever loaded; a test asserts the exact tool set. All Tether AI calls use the Vercel AI SDK with Claude so the toolkit plugs in directly. Answers *Best Use of PayPal + AI* and keeps the rule "no AI moves money."

### D15 — Level-ups run on Zoe's own savings commitment (Tarik approved, 2026-11-05)
- **Zoe sets** a weekly savings amount toward a named goal (PRD FR-7.2). **Amara sets the floor**: at least 10% of the weekly allowance.
- The commitment can change only at the start of a week.
- **Kept four weeks running → promotion** to the next level.
- A missed week pauses progress and never demotes ("pauses progress but blocks nothing").
- A refused purchase never counts against her.
- **Only Amara can move her down a level**, and she must record a reason.
- This replaces the old "spent ≤ 90% and saved ≥ 30%" rule in `mandate_engine.py` (`compliance_history`). Under D3 those two conditions had become the same rule.
Levels (Claude's proposal, not yet confirmed):

| Level | Weekly | Shops | Approval |
|---|---|---|---|
| 1 | $20 | 2 online shops | over $10, or a shop she hasn't used before |
| 2 | $30 | + bookshop | over $20 |
| 3 | $50 | + clothing/sneakers; investing proposals (D13) | none inside her allowed shops |

## 5. How it works, step by step

**People:** Amara (parent, has a PayPal personal account). Zoe (15, has no PayPal account — PayPal and Venmo personal accounts require 18+; she exists only inside Tether).

### 5.1 Setup (Amara, once, about a minute)
1. Amara signs up on Tether and builds Zoe's first grant: weekly amount, allowed shops (picked from a list Channel3 helps fill), whether online buys need approval, an end date.
2. She reads the plain-English version of the rules and signs. No AI in this step.
3. **Saving her PayPal (the "vault").** Tether asks PayPal for a *setup token* — a pending permission request that expires after 3 days. Amara is sent to PayPal, logs in, and approves "Tether may charge my PayPal for future payments" (PayPal records this as a billing agreement). Tether exchanges the approved request for a *payment token* (a reference to her PayPal — not a password or card number, and usable only with Tether's app keys).
4. Amara gets a private link (or QR code) to send Zoe. That link is Zoe's way in — no app to install, no password.

### 5.2 A purchase (Zoe)
1. Zoe either pastes a product link, or searches inside her allowed shops (D6).
2. **Channel3** turns it into structured data — title, price, shop. Tether builds a cart and a cart hash (a fingerprint of exactly these items at these prices).
3. **Gate 1 (the rule engine, plain code):** allowed shop? within the week's budget? needs approval? Before the grant's end date? Unknown rule type → refuse.
4. **Gate 2 (a model, only if a rule is about meaning, e.g. "books only"):** returns a probability. ≥ 0.98 passes; 0.70–0.98 asks Amara; below 0.70 refuses; no answer or an error refuses. It can only tighten what Gate 1 allowed.
5. **If refused:** the model turns the engine's reasons into one or two plain sentences with the arithmetic and two ways forward ("$8 left this week; this is $15. Ask Amara, or it fits next week").
6. **If approval is needed:** Zoe taps Ask; Amara gets one notification, sees the cart and the budget effect, approves or declines in one tap. Approval is scoped to that cart and expires.
7. **If allowed:** the engine mints a single-use token for this cart. The payment step checks the token, then creates a PayPal order for the exact amount, paid with Amara's saved wallet, and captures it. Amara is not asked again.
8. PayPal returns a capture ID. Tether writes the receipt: capture ID, cart hash, grant version, which rules passed, approval ID if any. Ledger updates. Zoe sees her new "left this week."

### 5.3 End of week
The grant expires by design. Zoe sees "Your week's finished — Amara needs to renew" (existing mockup `teen-06`). Amara renews in one tap; unspent money is counted as saved (D3).

### 5.4 End of month — earned authority
The engine reviews the month's evidence: purchases all in bounds, savings at or above target, breaches. Promote / hold / demote, with the evidence shown to both. On promotion: new level (more shops, bigger budget, fewer approvals) and the savings release prompt to Amara (D4). Amara can override either way; the override is recorded with a reason.

### 5.5 Stopping it
- **Amara revokes in Tether:** grant ends immediately; Tether deletes the saved wallet via `DELETE /v3/vault/payment-tokens/{id}` ("The payer's payment method is no longer saved").
- **Amara cancels in PayPal:** *Settings → Payments → Subscriptions and saved businesses* (or *Automatic payments*) → select the merchant → cancel (PayPal help article help240). Tether's next charge then fails, and the engine shows "We can't charge right now, so nothing can be spent."

## 6. PayPal integration map

| Step | API | Status |
|---|---|---|
| Get app access | `POST /v1/oauth2/token` | standard |
| Save Amara's PayPal | `POST /v3/vault/setup-tokens` → Amara approves → `POST /v3/vault/payment-tokens` (`usage_type: MERCHANT`, `customer_type: CONSUMER`) | **Verified:** US is supported ("Americas (2): Canada, United States"); "Save payment methods" and "PayPal and Venmo" are **enabled** in Tarik's sandbox app (read from the dashboard, 2026-11-05). Live use needs PayPal review — irrelevant for the hackathon. |
| Charge for a purchase | `POST /v2/checkout/orders` with `payment_source.paypal.vault_id`, then `/capture` | Verified in docs ("Payers don't need to be present when charged"). Not yet run against the sandbox. |
| Refund (stretch) | `POST /v2/payments/captures/{id}/refund` | Verified in docs |
| Delete saved wallet | `DELETE /v3/vault/payment-tokens/{id}` | Verified in docs |
| Payouts | **Not used** (D2, D4) | — |
| Disputes | **Not in this build** | "Customer disputes" is **off** in the sandbox app |
| PayPal MCP server (`paypal-sandbox`, installed in Claude Code) | Only 5 tools: invoices, `list_disputes`, `list_transactions`. Useful for checking sandbox activity during development; it cannot save wallets, charge, or pay out, so the app calls REST directly. | Verified: authenticated, returned 0 transactions |
| PayPal Agent Toolkit | Covers orders/refunds but **not** the vault charge or payouts (its `create_order` takes no payment source). Say so in the submission. | From research, not re-checked |

**Sandbox accounts needed:** one **personal** (Amara, US) and one **business** (Tether, US — the app's own account; a default one exists: region US). **No account for Zoe.**

## 7. Channel3 integration

| Call | Cost | Use |
|---|---|---|
| `POST /v1/lookup` (product URL → product) | 1 credit | Pasted link → cart |
| `/search` with website filter | 1 credit | Teen search inside allowed shops (D6) |
| `/websites` | free | Parent's shop picker; store each shop's Channel3 website ID on its directory record |
| Price tracking | 1 credit/product/day | **Stretch:** Zoe's savings goal is a real product; if its price drops, the goal shrinks |

Hackathon key: 20,000 free credits with promo code `PAYPAL-HACKATHON-2026` (Channel3 sponsor page). Sign-up at trychannel3.com/developers. **Not yet verified:** the exact response field names for category and shop in `/lookup` and `/search`; the builder confirms on day 1.

## 8. Where AI is used (and where it is not)

| Use | Model may | Model may not |
|---|---|---|
| Refusal explanation | Turn the engine's structured reasons into teen-language with the arithmetic | Decide, call PayPal, see credentials |
| Gate 2 — one semantic rule ("books only") | Return a probability that tightens the outcome | Approve, widen, or settle |
| Guardian rule drafting (stretch) | Draft a rule from Amara's own words for her to sign | Sign it |

Not AI: the rule engine, the token, the ledger, levels, the consent screen.
The existing `semantic_gate.py` already supports a vendor-agnostic classifier (`ProxyProbabilityClassifier` works on any chat model via strict JSON).

## 9. Existing material to build on

- `doc/mandate_engine.py` — Gate 1; 15/15 self-checks pass, but has the D9 bug.
- `doc/semantic_gate.py` — Gate 2 with AND-composition and a 101-point sweep test; 20/20 pass.
- `doc/screens.html` + `doc/Tether — design system (1).md` — tokens, components, the four-state colour language (allowed / needs approval / refused-in-amber / locked-muted). **These are the visual source of truth** — recreate them, don't re-derive.
- `doc/Tether — UX plan …` — web not native; PWA; teen surface phone-only; guardian approvals on phone, authoring on laptop; demo storyboard.
- `doc/The Tether agent — how it works (1).md` — the token design (D9), capability tiers, threat model.
- `doc/The merchant directory — where Tether's rules get their names.md` — directory record fields (copied in from Downloads on 2026-11-05).

## 10. Scope for seven days

**Must (the demo spine)**
1. Fix D9 (per-purchase token) with the new test.
2. PayPal: save Amara's wallet; charge a cart; show the capture ID in a receipt.
3. Grant authoring + signing screen (guardian, laptop).
4. Teen: week view, paste-a-link and scoped search via Channel3, refusal sheet with model-written explanation, Ask.
5. Guardian: one-tap approve on phone.
6. Record screen with receipts tied to rule versions (guardian, laptop).
7. Month-end review: promotion with evidence; savings release prompt (D4).
8. Gate 2 with the "books only" rule, end to end.
9. Every sandbox seam labelled on screen.
10. Investing (D13): custodial account, parent's fund list as a Gate 1 rule, open market search where every result says "Propose to Amara", propose → approve → token → simulated deposit → dollar-amount order, receipt marked "can't be taken back", and a designed "queued for market open" state.
11. Zoe's propose-only shopping agent (D18).
12. PayPal settlement webhook and record reconciliation (D19).
13. Zoe's private link with **Reset Zoe's link** (PRD v0.6 F3).
14. README with run instructions, sandbox setup (PayPal **and** Alpaca), license; hosted demo URL.
15. Video (protect a whole day for it).

**Should** — permission grid (open / ask first / locked); week-ended state with the D12 reflection sentences; "sets your goal back N weeks" on approved purchases; weeks-to-goal on the goal screen; revoke flow; D14 savings account if the D7 spike passes.
**Won't** — refunds, disputes, roundups, payouts, in-person, AG Grid, Astropods, Zapier, native app, dark mode.

## 11. Seams to state on screen (honesty list)

- Sandbox only; no real money moves.
- The family relationship is simulated — PayPal has no notion of it.
- Every charge goes to one stand-in merchant (D7).
- Savings release is a parent action in Venmo; Tether records it as parent-confirmed (D4).
- Gate 2 thresholds are initial, not calibrated against labelled data.
- Signatures are HMAC with a shared secret, not production key custody.
- Demo clock: time is fast-forwarded for the demo (D10).

## 12. Risks

| Risk | Mitigation |
|---|---|
| The vault charge fails in sandbox in a way the docs don't show | Day 1: run setup → charge end to end before any UI. Fallback in PRD §14 #1. |
| Seven days is not enough for the Must list | Cut from the bottom of Must, never the video. |
| A judge reads "AI" and hears "the AI approves payments" | Lead with "a model can only make us stricter"; show the sweep test. |
| Channel3 response lacks a clean shop identifier for matching allowed shops | Fall back to matching on the product URL's domain. |
| Docs cite dead links | 4 of 6 `docs.paypal.ai` links in the PRD return 404 — replace with `developer.paypal.com` equivalents before submission. |
| Docs contradict each other | v0.4 PDF damage thresholds (0.90/0.60) vs PRD v0.5 and code (0.80/0.40); PDF uses red for a locked tile, which the design system forbids. This document and v0.5 win. |

## 13. Left to the builder

- Web framework and hosting (the UX plan suggests Next.js as a PWA; any host that gives judges a URL is fine).
- Database for the ledger, grants, receipts (append-only journal).
- Which chat model powers the explanation and Gate 2's proxy classifier.
- How the teen link is tokenised and how the guardian logs in (UX plan suggests magic link / passkey).
- Exact copy, within `PARENT-COPY` voice rules in the design system (kitchen-table language; never "AI-powered," "monitor," "parental controls").

## 14. Sources checked on 2026-11-05

- Devpost overview, resources, rules, Channel3 sponsor page — read in full.
- PayPal: save-without-purchase (US availability, Vault setting), Orders v2 reference (`usage_type` wording), Payouts test values and error codes (14767), Payouts overview, vault delete, help article on cancelling automatic payments, PayPal Savings FAQ (personal US accounts only; no developer API found).
- Venmo Teen FAQ (18+ for personal accounts; parent funds Teen Account by sending a payment; teens can't receive goods-and-services payments).
- PayPal user agreement age clause — from PayPal's own search-result text; the full page download was blocked.
- Channel3 developers page, lookup, search, pricing docs.
- Tarik's sandbox dashboard — feature checkboxes read directly.
- Both Python files run; the D9 bug reproduced.
