# The problem Tether solves, and how it answers each part

Compiled 7 November 2026 from web research. Every figure says who measured it, when, how many people where the source
says, and where to read it. Two labels matter:

- **SECONDARY** means we read the figure only in news coverage or a summary of the source, not in the source itself.
- **Sponsor note** means whoever paid for the survey sells a product in this market.

Tether is a sandbox demo for the PayPal AI Hackathon. Each "How Tether answers it" section below says what the code
does today and points at the code or the decision record (a short plain-English note on why we chose something, in
[`docs/decisions/`](../decisions/)). Nothing below claims that Tether has been tested with real families or shown to
change anyone's behaviour. It hasn't.

There are five problems: the parent's, the teen's, two about what happens to the money she doesn't spend (saving and
investing), and the payment itself.

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
- **Freedom grows from her own track record**, not from a parent raising a limit: keeping her own savings promise
  moves her up a level (see Saving, below).

---

## 3. Saving: most teens don't put money aside for later

### What the data says

**Only about a third of teens save for their future.** In a February 2025 survey of 1,000 US teens aged 13 to 18,
"when they receive money, only 36% save a part for their future, 23% save for education, and 13% invest." (Junior
Achievement USA and MissionSquare Foundation, *Teens & Personal Finance*, Wakefield Research, 3–10 Feb 2025,
[JA press release](https://jausa.ja.org/news/press-releases/more-teens-are-participating-in-financial-literacy-courses-but-gaps-in-learning-evident-according-to-new-survey).
Sponsor note: MissionSquare is a retirement-plan firm. Self-reported answers to one question, not measured saving.)

**What the evidence says helps, and how close it is to teens.** None of these studies tested Tether's design or US
teenagers; we cite them as the closest evidence, and say who was studied.

- **Committing in advance works for adults.** In "Save More Tomorrow," employees committed ahead of time to save part
  of future raises; "average saving rates rose from 3.5% to 13.6% over 40 months." (Thaler & Benartzi, *Journal of
  Political Economy* 112(S1), 2004, [abstract](https://econpapers.repec.org/RePEc:ucp:jpolec:v:112:y:2004:i:s1:p:s164-s187).
  US employees at one firm.)
- **For children, a softer commitment beat a strict lock.** The only randomised trial of a savings commitment for
  children we found, in Ugandan primary schools, found that children saved *more* under the weaker commitment (they
  could take cash out) than under a strict account that locked the money. (Karlan & Linden, "Loose Knots," *Journal of
  Development Economics* 174, 2025, [NBER working paper](https://www.nber.org/papers/w19863). Primary-school children,
  not US teens; many other outcomes showed no effect.)
- **A named goal makes reminders work.** In field experiments with new savers, reminders raised saving "especially when
  they make a specific expense salient": reminders that named the saver's own goal helped, while the same reminder
  without the goal did not. (Karlan, McConnell, Mullainathan & Zinman, "Getting to the Top of Mind," *Management
  Science* 62(12), 2016, [NBER](https://www.nber.org/papers/w16205). Adults in Bolivia, Peru and the Philippines.)

The shape of the problem: most teens don't save for later, and the tools they're given (a card, an allowance) don't
ask them to commit to anything or show them what they're saving toward.

### How Tether answers it

- **What she doesn't spend becomes savings.** There is no separate savings account to move money into: the unspent part
  of each week counts as saved, and the money stays in the parent's PayPal until she releases it.
  [Decision 003](../decisions/003-savings-is-unspent-grant.md).
- **A weekly savings promise she sets herself.** Zoe chooses how much she'll save each week, at or above a floor the
  parent sets (10% of the allowance in the demo). Nothing is locked: she can still spend it, and the promise is only
  scored when the week ends. Keeping it is what gets rewarded; a missed week pauses her progress and never demotes her.
  This is a soft pledge, closer to the weaker commitment the Uganda trial above favoured than to a strict lock. Code:
  `commitmentKept` in `src/engine/ladder.ts`, `setTeenCommitment` in `src/flows/teenGoals.ts`.
- **Four kept weeks move her up a level.** Keeping her own promise four weeks in a row earns more money a week and more
  shops: freedom earned from her own promise, not a parent's number.
  [Decision 007](../decisions/007-level-ups-run-on-her-own-commitment.md).
- **One number on the goal screen: weeks to her goal.** She names what she's saving for and its price; the goal screen
  shows how many weeks her promise needs to get there (for example "12 weeks to noise-cancelling headphones"). Code:
  `weeksToGoal` in `src/ui/teenWords.ts`, `src/app/t/[token]/goals/page.tsx`.
- **Savings are released at month end.** At the monthly check-in the parent sees what Zoe saved plus the parent's
  match, sends it to her (Venmo, PayPal or cash) and records that she has.
  [Decision 003](../decisions/003-savings-is-unspent-grant.md).

**What is design, not evidence.** The weeks-to-goal number and earned freedom are design hypotheses grounded in the
studies above. We found no experiment that tests a weeks-to-goal number or earned freedom on teenagers, and Tether
hasn't measured either.

---

## 4. Investing: teens are interested, but don't know much, and their first step is often crypto

### What the data says

**Interest is high, knowledge is low.** In Schwab's survey (1,000 teens aged 13 to 17, Logica Research, 13–27 Oct 2025),
"seven in 10 teenagers (70%), ages 13-17, say they are very or extremely interested in investing," but "only 14% say they
know a lot about investing." ([Schwab press release](https://pressroom.aboutschwab.com/press-releases/press-release/2026/Early-Start-Long-Term-Mindset-Teens-Increasingly-Interested-in-Investing/default.aspx).
Sponsor note: Schwab sells a teen investing account.)

**Young investors start early, and often with crypto.** In a 2023 study of 2,872 investors aged 18 to 25 in four
countries, "82% of U.S. Gen Z investors began investing before 21," and 44% of US Gen Z investors started with crypto.
(FINRA Investor Education Foundation and CFA Institute, May 2023,
[FINRA release](https://www.finra.org/media-center/newsreleases/2023/finra-foundation-cfa-institute-research-focuses-gen-z-investors);
figures from the CFA Institute's release.)

**Investing as a child is becoming a federal default.** The US Treasury now opens a "Trump Account," an "individual
retirement account (IRA) for eligible children," with a one-time $1,000 federal contribution for US citizens born from
1 Jan 2025 through 31 Dec 2028. ([IRS](https://www.irs.gov/trumpaccounts), updated 21 Oct 2026.) It doesn't cover
today's 13–17-year-olds, but it shows where this is heading.

The shape of the problem: teens want to invest before they understand it, and the easiest first step on offer (crypto,
a trading app, a daily-moving chart) teaches checking and reacting rather than understanding what you own.

### How Tether answers it

- **From Level 2, funds or stocks.** Investing opens at Level 2, for a fund or a single company's stock, under the
  same rules. [Decision 024](../decisions/024-investing-opens-at-level-2.md),
  [decision 025](../decisions/025-stocks-alongside-funds.md).
- **Facts only.** A fund's page shows "What's inside" (its biggest holdings); a stock's shows "About the company"
  (sector, industry, where it's based). Once she owns something she sees one line since she bought it next to the same
  money in the whole market: no daily moves, no red or green, no advice, and every number is worked out by code, never
  written by an AI. [Decision 020](../decisions/020-zoe-sees-how-her-investments-are-doing.md),
  [decision 021](../decisions/021-financial-datasets-through-narrow-tools.md).
- **Her own reasons travel with the proposal.** To propose an investment she answers three questions in her own words,
  and the parent reads them on the request. Code: `proposeFromTeen` in `src/flows/teenInvest.ts`.
- **The parent approves each one.** Nothing is bought without the parent's yes on that investment.
- **Leveraged and inverse products are blocked** by their names, since they are built to move two or three times as
  fast as the market. Code: `src/engine/invest.ts` (a name-based rule of thumb, not a full check).
- **Invested money is hers.** On approval the parent is told the money "belongs to her and can't be taken back," and
  once money reaches the broker Tether never shows it back in her savings.
  [Decision 010](../decisions/010-investing-money-never-un-moves.md).
- **Sandbox stand-in.** Orders go to an ordinary Alpaca sandbox account labelled on screen as a stand-in for the
  custodial account (an account an adult manages for a minor) a real family would need.
  [Decision 023](../decisions/023-investing-stays-on-alpaca-not-etoro.md) explains why Alpaca rather than eToro.

---

## 5. Payments and AI: nobody has settled how an agent proves it was allowed to buy

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
5. **Saving claims we leave out.** "Money habits are set by age 7" (the Cambridge report says basic concepts develop
   by seven; it does not say habits are fixed, and the claim would undercut a teen product). "64% of teens don't save"
   (the 36% comes from one question whose options overlap). "Allowances increase saving" (a UK study of 11–15-year-olds
   found allowances linked to a *lower* chance of saving). The Philippines commitment-account result of "81 percentage
   points" (we saw it only in an excerpt), and the Peru goal-reminder percentage (from a secondary summary; we describe
   the finding without the number). And no adult study is presented here as evidence about teens.

## What we could not check

Some sources refused automated reading, so their figures are marked SECONDARY above. We found no recent (2022 or
later) figure for the share of US 13–17-year-olds who shop online, and no user counts for Venmo Teen.
