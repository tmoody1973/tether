# The problem Tether solves, and how it answers each part

Compiled 7 November 2026 from web research. Every figure says who measured it, when, how many people where the source
says, and where to read it. Two labels matter:

- **SECONDARY** means we read the figure only in news coverage or a summary of the source, not in the source itself.
- **Sponsor note** means whoever paid for the survey sells a product in this market.

Tether is a sandbox demo for the PayPal AI Hackathon. Each "How Tether answers it" section below says what the code
does today and points at the code or the decision record (a short plain-English note on why we chose something, in
[`docs/decisions/`](../decisions/)). Nothing below claims that Tether has been tested with real families or shown to
change anyone's behaviour. It hasn't.

There are three problems, one for each side of the table: the parent, the teen, and the payment itself.

---

## 1. Parents: kids spend parents' money without real permission

### What the data says

**Regulators keep finding it, at scale.** The US Federal Trade Commission (FTC) has made four companies refund parents
for charges their children ran up without permission:

| Company | When | What the FTC secured | Source |
|---|---|---|---|
| Apple (in-app purchases) | 15 Jan 2014 | Refunds of at least $32.5 million. Apple didn't tell parents that typing a password "would open a 15-minute window" for further charges. | [FTC](https://www.ftc.gov/news-events/news/press-releases/2014/01/apple-inc-will-provide-full-consumer-refunds-least-325-million-settle-ftc-complaint-it-charged-kids) |
| Google Play | 4 Sept 2014 | Refunds of at least $19 million, for children's charges "ranging from 99 cents to $200". | [FTC](https://www.ftc.gov/news-events/news/press-releases/2014/09/google-refund-consumers-least-19-million-settle-ftc-complaint-it-unlawfully-billed-parents-childrens) |
| Amazon (Appstore in-app) | Court ruling Apr 2016; refunds opened May 2017 | More than $70 million in charges made eligible for refunds (charges from Nov 2011 to May 2016). | [FTC, 2017](https://www.ftc.gov/news-events/news/press-releases/2017/05/refunds-now-available-amazon-unauthorized-app-purchases) |
| Epic Games (Fortnite) | 19 Dec 2022 | $245 million in refunds, part of $520 million in total. Epic let children "rack up unauthorized charges without any parental involvement" and "ignored more than one million user complaints." | [FTC](https://www.ftc.gov/news-events/news/press-releases/2022/12/fortnite-video-game-maker-epic-games-pay-more-half-billion-dollars-over-ftc-allegations) |

**Handing over a card is still the normal workaround.** In a 2025 survey of 1,000 US teens aged 13 to 18, 21.6% said
"their parents allow them to use their credit cards, often for purposes such as online shopping or other expenses."
Only 12.6% get money on a prepaid card. (Junior Achievement Fintech Survey, run by Wakefield Research, analysed by the
MissionSquare Research Institute, July 2025, [report PDF](https://research.missionsq.org/content/media/document/2025/6/113053_How%20Teens%20Handle%20Money_S.pdf).
Sponsor note: MissionSquare Foundation.)

The shape of the problem: today's choice is to hand over a card and check the statement afterwards, or to say no.
Neither gives the parent a say *before* the money moves on a specific purchase.

### How Tether answers it

- **No card changes hands.** The parent (Amara in the demo) saves her PayPal once, on PayPal's own page. Tether keeps
  a vault token (PayPal's way of letting a business charge you later without your password). Her teen never has a
  PayPal account or a card. [Decision 001](../decisions/001-money-stays-with-the-parent.md).
- **The parent signs the week's rules.** How much, which shops, whether online purchases need her OK, how much her teen
  promises to save. A signed set of rules lasts one week and every change makes a new version. No AI is involved in
  writing or signing them. Code: `src/engine/ladder.ts`.
- **Every cart is checked by code before PayPal is called.** A rule engine (plain code with no AI in it, which gives the
  same answer every time) decides: allowed, needs the parent's OK, or refused. Code: `src/engine/decide.ts`.
- **A single-use permission slip bound to one cart.** When a cart passes, Tether makes a signed slip that is valid for
  120 seconds, covers that exact cart and amount, and can be used once. Code: `src/engine/token.ts`
  (`TOKEN_TTL_MS = 120_000`).
- **Over-limit asks reach the parent quickly.** Something over the weekly budget goes to the parent instead of being
  refused outright. If she has turned on notifications, she gets one push ("Zoe is asking for $25.30 at Best Buy");
  tapping it opens the request with the budget consequence first, and one tap approves and pays. On iPhone the push
  only arrives once Tether is added to the Home Screen.
  [Decision 013](../decisions/013-amara-can-approve-a-one-off-over-budget.md),
  [decision 017](../decisions/017-push-notifications-through-onesignal.md).
- **Every payment carries its proof.** Each payment keeps its PayPal ID, the rules version that allowed it, and the
  permission slip. The slip's id travels inside the PayPal order itself (PayPal's `custom_id` field,
  `src/adapters/paypal/orders.ts`), and Tether checks its receipts against PayPal's own list of charges.
  [Decision 011](../decisions/011-reconcile-by-permission-slip.md), code: `src/flows/reconcile.ts`.

---

## 2. Teens: they want autonomy, and classes barely change behaviour

### What the data says

**Teens want more control than parents want to give.** In Charles Schwab's survey (1,000 teens aged 13 to 17 and 1,000
parents of teens, online, run by Logica Research, 13–27 Oct 2025, released 28 Apr 2026), 64% of teens "would want their
parents to have only a little control over their investment decisions." 50% of parents want to be "heavily involved in
deciding how much money goes into investments." ([Schwab press release](https://pressroom.aboutschwab.com/press-releases/press-release/2026/Early-Start-Long-Term-Mindset-Teens-Increasingly-Interested-in-Investing/default.aspx).
Sponsor note: Schwab sells a teen investing account.)

**Classes alone barely move behaviour.** A meta-analysis (a study that pools the results of many studies) of 201
studies across 168 papers found that "interventions to improve financial literacy explain only 0.1% of the variance in
financial behaviors studied," and that "even large interventions with many hours of instruction have negligible effects
on behavior 20 months or more from the time of intervention." The authors see a "real but narrower role for 'just in
time' financial education tied to specific behaviors it intends to help." (Fernandes, Lynch & Netemeyer, *Management
Science* 60(8), 2014, [SSRN](https://papers.ssrn.com/abstract=2333898), DOI 10.1287/mnsc.2013.1849. SECONDARY: quoted
from the abstract. This is older than the other sources but is still the standard meta-analysis; some later work finds
larger effects, and we haven't checked it.)

**Most of today's teens won't get a class anyway.** "35% of public high schoolers in the Class of 2026 were required to
take a standalone Personal Finance course to graduate." 30 states now have the requirement; it reaches 76% of students
only with the Class of 2031. (Next Gen Personal Finance, *2026 State of Financial Education Report*, April 2026,
[PDF](https://d3f7q2msm2165u.cloudfront.net/aaa-content/user/files/Files/NGPF_Annual_Report_2026.pdf).)

The shape of the problem: teens want to make their own choices, and the teaching that works best happens at the moment
of a real decision, which is exactly when today's tools say nothing more than "declined."

### How Tether answers it

- **The teen shops herself, inside the rules.** Zoe asks a shopping agent ("headphones under $30") that searches only
  the shops her parent allowed and proposes two or three options. She chooses. Code: `src/ai/agent.ts`,
  [decision 004](../decisions/004-teen-search-scoped-to-allowed-shops.md).
- **Refusals teach at the moment of decision.** A refusal is one plain sentence using her real numbers, plus two ways
  forward (for a budget refusal: "Ask Amara" or "It fits next week"). The sentence may only use dollar amounts the rule
  engine gave it, and it falls back to a fixed template if the AI is down. Code: `src/ai/explain.ts` (`routesFor`).
  This is our design reading of the "just in time" finding above. We have not measured whether it changes behaviour.
- **Freedom grows from her own track record.** What she doesn't spend each week becomes savings. Keeping her own
  savings promise four weeks in a row moves her up a level: more money, more shops.
  [Decision 007](../decisions/007-level-ups-run-on-her-own-commitment.md).
- **Investing from Level 2, with facts, her own reasons and her parent's approval.** Zoe can search the whole market
  for a fund or a stock and read a facts-only page ("What's inside" for a fund, "About the company" for a stock).
  Tether recommends nothing. To propose an investment she answers three questions in her own words, and her parent
  approves each one. Leveraged and inverse products are refused by their names. Code: `src/flows/teenInvest.ts`,
  `src/engine/invest.ts`; [decision 024](../decisions/024-investing-opens-at-level-2.md),
  [decision 025](../decisions/025-stocks-alongside-funds.md).

---

## 3. Payments and AI: nobody has settled how an agent proves it was allowed to buy

### What the data says

**The payments industry names authorization as an open question.** Google's Agent Payments Protocol (AP2), announced
16 Sept 2025 with PayPal among its named partners, lists the questions agent payments must answer, including:

- "Proving that a user gave an agent the specific authority to make a particular purchase."
- "Determining accountability if a fraudulent or incorrect transaction occurs."

Its proposed answer is signed "mandates" in which users specify "price limits, timing, and other conditions."
([Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol).)

**Agent shopping is coming, but people won't let agents buy unsupervised.** Morgan Stanley Research estimates that
"agentic shoppers could represent $190 billion to $385 billion in U.S. e-commerce spending by 2030, capturing 10% to
20% of market share." ("Here Come the Shopping Bots," 8 Dec 2025,
[Morgan Stanley](https://www.morganstanley.com/insights/articles/agentic-commerce-market-impact-outlook).) In a survey
of more than 3,300 US and UK consumers, "only 7% of fashion shoppers said they would allow an AI assistant to make
purchases without approval." (ACI Worldwide, reported 23 Sept 2026. SECONDARY, via
[Retail Dive](https://www.retaildive.com/news/consumers-trust-ai-advise-do-not-consent-purchasing-them/830990/).
Sponsor note: ACI sells payments software.)

**Minors are outside both PayPal's terms and the agent-payment frameworks.** To open a US PayPal account you must be
"at least 18 years old, or the age of majority in your state of residence"
([PayPal User Agreement](https://www.paypal.com/us/legalhub/paypal/useragreement-full); quoted from PayPal's own help
pages, as the full agreement wouldn't load for us). Venmo's teen account makes the parent "responsible for all such
activity" ([Venmo User Agreement](https://venmo.com/legal/us-user-agreement)). None of the AP2, Visa or Mastercard
agent-payment announcements we read mentions a parent authorising an agent on a child's behalf.

The shape of the problem: an agent that buys for someone needs proof that it was allowed to, and the most supervised
case of all, a parent and a teen, isn't covered by anyone yet.

### How Tether answers it

- **A parent-signed mandate, in the same shape AP2 describes.** Amara's signed weekly rules are the standing
  permission (limits, shops, dates); the per-cart permission slip is the record of one exact purchase. Tether does not
  implement the AP2 protocol itself; it is the same idea, built for the parent-and-teen case.
- **The agent only proposes.** The shopping agent can search and suggest. It has no tool that buys or moves money.
  PayPal's Agent Toolkit is used read-only, for the parent's month assistant.
  [Decision 009](../decisions/009-paypal-agent-toolkit-read-only.md).
- **Code decides; a model can only add friction.** After the rule engine, a second check by a model can catch things
  code can't judge ("is this really a book?"), but it can only make a decision stricter. A timeout, an error or a
  nonsense answer counts as a refusal. Code: `src/ai/classifier.ts`. *A model may add friction. Only code may remove it.*
- **Proof is checkable against PayPal's ledger.** Because the permission slip's id is written into each PayPal order
  before PayPal is called, any charge in PayPal's records can be traced to one family's slip, rules version and cart.
  [Decision 011](../decisions/011-reconcile-by-permission-slip.md).
- **The money stays with the adult PayPal requires.** Every charge is to the parent's own saved PayPal, which is the
  route PayPal's terms allow, not a workaround.

What the sandbox stands in for: every purchase pays one Tether sandbox account (the receipt records which shop it was
for), investing runs on an ordinary Alpaca sandbox account labelled as a stand-in, and a demo clock fast-forwards time.
See the README's "Sandbox stand-ins (said plainly)".

---

## Claims we avoid, and why

1. **"Nearly half of teens secretly spend on their parents' cards."** This comes from LendingTree's 46% (January 2022,
   1,051 parents). The survey covers parents of children of every age under 18, not teens; the top category was in-app
   and in-game purchases, not online shopping; and LendingTree runs a credit-card marketplace. If we ever use it, it is
   "46% of parents (LendingTree, 2022)," never a teen online-shopping rate.
2. **Hype-scale AI numbers.** We don't use Adobe's "693% growth in AI traffic" (clicks, not purchases, from what Adobe
   calls a "modest" base), Salesforce's "$67 billion AI-influenced" (modelled by a company that sells the tools, and
   "influenced" includes recommendations), or McKinsey's "$1 trillion" (we saw it only second-hand, and its definition
   is broad). Morgan Stanley's $190–385 billion is the most conservative and most citable forecast.
3. **Dated or unsourced figures about money arguments at home.** These are often quoted as current but aren't: T. Rowe
   Price's "41% of parents reluctant to talk money" (about 2020, parents of 8–14-year-olds), Capital One's "29% argue
   monthly" (undated, probably a decade old), Pew's teen online-shopping figures (2001), and Junior Achievement's "55%
   heard their parents argue about money" (2021; the best of these, but only with its year).
4. **"US teens are below average in financial literacy."** The OECD's PISA 2022 test puts the US mean (505) level with
   the average of the countries tested (498); the difference isn't statistically significant.

## What we could not check

Some sources refused automated reading, so their figures are marked SECONDARY above. We found no recent (2022 or
later) figure for the share of US 13–17-year-olds who shop online, and no user counts for Venmo Teen.
