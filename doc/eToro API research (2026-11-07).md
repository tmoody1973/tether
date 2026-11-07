# eToro API vs Alpaca Broker API: research for Tether (PayPal AI hackathon)

Researched 2026-11-07. Web only, no code changes. Hackathon deadline: Thu 12 Nov 2026.

Method: raw page text pulled with curl and read directly (not summarised by a model), so quotes are verbatim.
Raw copies of the pages were kept locally during the research (not in this repo).

Legend:
- OFFICIAL = quote taken from an eToro-owned page (etoro.com, api-portal.etoro.com, builders.etoro.com, help.etoro.com) or an Alpaca-owned page.
- UNVERIFIED = could not confirm from an official eToro page. Third-party sources are named where used and are never treated as confirmation.
- CONFLICT = two official eToro pages disagree.

---------------------------------------------------------------------

## 1. eToro's public API

### 1a. Official docs
- API portal (Mintlify): https://api-portal.etoro.com , index for agents: https://api-portal.etoro.com/llms.txt (256 pages, every page also served as `.md`)
- Builders portal (marketing + tutorials): https://builders.etoro.com , index: https://builders.etoro.com/llms.txt
- Base URL: `https://public-api.etoro.com` (OFFICIAL, https://api-portal.etoro.com/core/getting-started/authentication.md)

### 1b. How a third-party app authenticates (two separate routes)

**Route A: personal API keys (self-serve, no approval step documented).**
> "Access to the API requires two specific keys to ensure secure interaction between the application and the user account. Public API Key: Identifies the application. User Key: Identifies your user account."
> "To access your own account data, you must generate a user-specific key through the etoro platform."
> Steps: Settings > Trading > API Key Management > Create New Key. Fields: Key Name; "Environment: Select either "Demo" or "Real". Each key can only be used for one environment. If you need to use both, please create two keys."; "Permissions: Select "Read" if you only need to access your portfolio data. Select "Write" if you need to execute trades."; optional "IPS Whitelist" and "Expiration Date". An SMS/phone-call verification code is required.
> Headers: `x-request-id` (UUID), `x-api-key`, `x-user-key`.
Source: https://api-portal.etoro.com/core/getting-started/authentication.md

Prerequisite for the key option to even appear:
> "Note: To access the API, your etoro account must be verified. If the API key isn't showing in your settings, please finish the verification process."
Source: https://api-portal.etoro.com/index.md
> "A verified eToro retail account (KYC completed). Your API key is tied to your verified eToro account"
Source: https://builders.etoro.com/get-started

**Route B: OAuth 2.0 / OpenID Connect "Sign in with eToro" for apps with their own users (needs a registered app).**
> "The API key pair authenticates you as yourself: it is generated in your own etoro settings and acts on your own account. This guide covers the other case — an application that signs other etoro users in and acts on their behalf, with their consent."
> "Register your application. Registration produces a clientId and a clientSecret... Register through the etoro Builders portal, or programmatically with POST /api/v1/sso/applications."
Source: https://api-portal.etoro.com/core/getting-started/sso-oauth.md
> "Your request enters a review queue. eToro may ask clarifying questions about security, data use, or UX. If approved, you receive credentials or configuration for the registered application"
Source: https://builders.etoro.com/app-registration
Note: the registration form "reviewers typically need" includes redirect URIs, scopes, and "Links or attachments that help reviewers test: staging URL, demo video, or test account notes". Review time is not stated (UNVERIFIED).

**Route C: Partners API (eToro creates accounts for your customers, KYC, money movement).**
> "Access to the Partners API is granted per partner. If you are not yet onboarded as an etoro partner, contact your etoro representative — these endpoints are not available with standard API keys."
Source: https://api-portal.etoro.com/partners/introduction.md
> "etoro has to enable your application before step 1." (credentials, permissions, API key and server IP allow-listing are set up by eToro)
Source: https://api-portal.etoro.com/partners/start-here.md and https://api-portal.etoro.com/partners/guides/user-onboarding.md

### 1c. Endpoints that exist (from the API reference index, https://api-portal.etoro.com/llms.txt)
Core API groups (count of endpoints): market-data (11), trading--real (17), trading--demo (17), balances (6), transfer (7), cash-accounts (1), sub-accounts (2 + 6 eToro-trading), watchlists (18), users-info (6), user-stats (4), rankings (7), copy-trading (5 real + 5 demo), agent-portfolios (7), price-alerts (4), identity (1), notifications (2), sso-applications (5), sso-scopes (1), plus a WebSocket API (rates, candles, private portfolio updates).

- Market data: instrument search by symbol (`GET /api/v1/market-data/search?internalSymbolFull=...`), bid/ask rates, candles. 
- Place orders: `POST /api/v2/trading/execution/orders` (real) and `POST /api/v2/trading/execution/demo/orders` (demo); also v3 async orders `POST /api/v3/trading/execution/orders`. Close: `POST /api/v1/trading/execution/market-close-orders/positions/{positionId}`.
  > "Order size must use exactly one of amount, units, or contracts." / "A 200 response means the order was accepted for processing, not that it was executed."
  Source: https://api-portal.etoro.com/api-reference/trading--real/create-an-order.md
- Portfolio/positions/PnL: `GET /api/v1/trading/info/real/pnl` (real; https://api-portal.etoro.com/api-reference/trading--real/get-account-pnl-and-portfolio-details.md) and `GET /api/v1/trading/info/demo/portfolio` (demo; named in https://builders.etoro.com/blog/building-your-first-trading-bot.md). Aggregate snapshots also exist for both (https://api-portal.etoro.com/core/changelog.md).
- Account balance: `GET /api/v1/balances` and the rest of the `balances/*` group (6 endpoints) plus guide "Calculate Available Cash" (https://api-portal.etoro.com/core/guides/calculate-available-cash.md).
- Deposits: NOT initiatable in the Core API. The only deposit endpoints are in the Partners API (partner-only): `POST /api/v1/money/deposit/notify` (partner tells eToro about a deposit that happened on the partner's platform), crypto deposit intents, first-time-deposit reads.
  > "`POST /api/v1/money/deposit/notify` reports an approved deposit. etoro processes the notification asynchronously and determines from it whether the deposit is the user's first"
  Source: https://api-portal.etoro.com/partners/integration.md
  The word "paypal" appears zero times in the whole 256-page API index and in every doc page I downloaded (core and partners).
- Internal transfers between a customer's own eToro accounts (trading/options/cash): `POST /api/v1/money/transfers`, https://api-portal.etoro.com/core/guides/internal-transfers.md

### 1d. Demo vs real and how demo is selected
Two selectors, both required:
1. The key's environment, chosen when creating it ("Each key can only be used for one environment").
2. The URL path: demo = `.../trading/execution/demo/orders` and `.../trading/info/demo/portfolio`; real = no `demo` segment.
> "Demo Environment: When testing, use POST /api/v2/trading/execution/demo/orders to avoid risking real capital."
Source: https://api-portal.etoro.com/core/guides/market-orders.md
> "Your User Key is issued per environment (Virtual vs Real). A key that works for demo portfolio endpoints must not be assumed to work for live trading"
Source: https://builders.etoro.com/blog/from-demo-to-production-trading-bot.md

### 1e. Rate limits
> "Limits are tracked per user key and are measured over a 1-minute rolling window." / "Most standard GET requests for retrieving data allow up to 60 requests per minute." / "Endpoints that execute trades, modify state, or run heavier queries are limited to 20 requests per minute." (trading execution in both Real and Demo; shared quota across order create/cancel/close)
Source: https://api-portal.etoro.com/core/getting-started/rate-limits.md
Over the limit returns `429 Too Many Requests`.

### 1f. Cost
> "Is the eToro API free? Yes. Access to the eToro API is free for eligible users; there is no separate API subscription fee. Usage is still subject to eToro terms, fair use, and rate limits."
Source: https://builders.etoro.com/faq
"Eligible" is not defined on that page. eToro's trading fees still apply to real trades (see Q3).

Launch context: public APIs were announced 29 Oct 2025, "now available to select users" (no country list). Source: https://www.etoro.com/news-and-analysis/press-releases/etoro-marks-15-years-of-social-investing-with-launch-of-public-apis-and-expansion-of-copytradertm-to-the-us/

---------------------------------------------------------------------

## 2. Terms: third-party apps, personal-use limits, partner programmes

Governing document: "eToro Builders' Economy: Public API & eToro App Store, Terms of Use, [February 17, 2026]", marked "BETA PRODUCT".
PDF: https://www.etoro.com/wp-content/uploads/2026/03/Master_eToro_Builders_Economy_Terms_17-Feb-2026-clean_R.pdf (linked from https://builders.etoro.com/faq as "API & App Store Terms")

**Answer: No. Using a user's keys to trade on their behalf is outside the Permitted Use for the self-serve keys.**
> "'Permitted Use' means using the API, Vibe Coding Environment, or App Store to access and manage your own eToro trading account, develop and test tools for personal use in connection with your account, and, where expressly authorized, publish tools through the App Store for use by other eToro users, but excluding any commercial redistribution of eToro data or use on behalf of third parties or other uses prohibited under this Agreement." (Part I, 1.2)
> Prohibited: "use the Builders' Economy for or on behalf of any third party except as permitted for Listed Tools;" (Part V, 1.5)
> "Access Credentials are confidential; you must not share, sell, or transfer them." (Part II, cl. 1)
> "To use the Public API you need to apply through means as detailed in the API portal which may be granted, denied, or revoked at any time." (Part II, cl. 1)
> "All execution order placed via external tools connected through the Public API shall be subject to the same limitations, rules, and restrictions that apply to your eToro Trading Account" (Part II, 2.7)
> Licensed Content (prices, charts, news) may be "for personal use only"; no redistribution (Part II, 3).

The only documented route to serve other people's accounts:
- App Store "Listed Tools" (publish an app that eToro approves, "Upon approval"), Part IV of the same terms; and
- OAuth registered app (https://builders.etoro.com/app-registration: "Register an application when you need production-grade integration, identity flows for third-party users, SSO-style OAuth, or partner-level access"); and
- Partners API (partner agreement, "contact your etoro representative").
The self-serve page says personal keys are for "personal use, learning, and smaller projects where you are the primary user or your software acts only on your behalf within documented limits." Source: https://builders.etoro.com/app-registration

Is there a partner / white-label / broker programme? Yes, a Partners API for "approved partners" who "onboard and manage end users on etoro", incl. registration, KYC, cash accounts, deposits ("uses etoro as the brokerage and identity layer underneath"). It is gated, per-partner, with contract negotiation: https://api-portal.etoro.com/partners/introduction.md , https://api-portal.etoro.com/partners/guides/user-onboarding.md . Whether it is open to a hackathon team, and to US users, is UNVERIFIED (no application form or eligibility criteria published).

Hackathon-side obligation (Devpost rules): "If a Project integrates any third-party SDK, APIs and/or data, Entrant must be authorized to use them in accordance with any terms and conditions or licensing requirements of the tool." Source: https://paypalaihackathon.devpost.com/rules (retrieved by curl)

---------------------------------------------------------------------

## 3. Fractional dollar-amount buys of a US ETF (VTI), minimums, real vs CFD

**API supports buying by dollar amount.**
> "You can specify exactly one sizing field: amount, units, or contracts. ... Method 1: By Amount (Cash). ... You specify the cash value (e.g., $1,000) and the API calculates the units based on the current market price."
Source: https://api-portal.etoro.com/core/guides/market-orders.md
> `amount`: "The monetary amount to invest in the order currency. ... Must be greater than 0." / `orderCurrency`: "Only USD is currently supported."
Source: https://api-portal.etoro.com/api-reference/trading--real/create-an-order.md

**Per-instrument minimums and fractional flag are only exposed per account** by `POST /api/v2/trading/info/eligibility`: fields `minPositionExposure`, `unitsQuantityType` ("`whole`... `fractional`"), `leverageConfigs[].settlementType` (values `cfd`, `real`, `realFutures`, `marginTrade`; "`real` - the real instrument held in full value ... `cfd` - contract for difference"). The doc's sample response shows `minPositionExposure: 50` for AAPL, but that is an illustrative example, not a rule. 
Source: https://api-portal.etoro.com/api-reference/trading--real/check-instrument-trading-eligibility.md
UNVERIFIED: the actual values for VTI on a US account. Needs a real key.

**Minimum trade size for US (UI, stocks/ETFs):**
> "Invest in in fractional stocks for as little as $10, with zero commission" (US launch, Jan 2022) - https://www.etoro.com/wp-content/uploads/2022/01/eToro-U.S.-stocks-launch-press-release.pdf
> "Remember, you can invest in a fractional share for as little as $10 — that's true for any ETF on etoro." - https://www.etoro.com/en-us/investing/how-to-invest-in-etfs/
So a US floor of $10 is documented for the app. Tether's "$1+" proposals would be below it (UNVERIFIED whether the API enforces the same $10 floor; the eligibility endpoint is where it would show).

**Fractional shares are real shares, held in custody:**
> "Fractional shares make investing more accessible... and enable clients to invest in real shares without using complex instruments." / "Fractional shares are held in custody under the same terms as whole shares" / "fractional shares cannot be transferred outside of the eToro platform." / "We support voting rights for fractional shares only for US securities."
Source: https://help.etoro.com/articles/en_GB/Knowledge/what-is-a-fractional-share (en_GB article; the same wording is not confirmed on a US-specific page)

**Real vs CFD for US users:**
- OFFICIAL structure: US stocks/ETFs are offered by a broker-dealer, cleared by Apex: "eToro USA Securities Inc. (stocks, ETFs, and options trading)... Funds are then transferred to other firms to purchase the relevant investments (Apex Clearing Corporation, which is eToro's securities clearing broker, to purchase stocks/ETFs and options...)". Source: https://www.etoro.com/wp-content/uploads/2021/10/eToro-US-Funds-Availability_Jan-2026.pdf
- US fees page: "We charge zero commissions when you buy or sell a stock." and tabs only for "Crypto / Stocks & ETFs / Options". Source: https://www.etoro.com/en-us/trading/fees/
- UNVERIFIED (no explicit sentence on an official page): "US accounts cannot hold CFDs". Third-party reviews say so (e.g. https://machow2.com/etoro-usa-review/, https://en.globes.co.il/en/article-1001377449), but I did not find it stated by eToro. Caution: the US demo page FAQ says "CFD trading and leverage are both available in the demo" (https://www.etoro.com/en-us/trading/demo-account/), which looks like shared copy.
- UNVERIFIED: that VTI is tradable on a US eToro account. The international VTI page exists (https://www.etoro.com/markets/vti , "Vanguard Morningstar Total Stock Market ETF", price shown) but the US page is a script-rendered shell with no extractable text.

---------------------------------------------------------------------

## 4. Eligibility

**Minimum age 18. No custodial/minor/teen product found.**
> "You must be at least 18 years of age to use our Services." (eToro USA LLC Terms, Last Updated December 2, 2018, cl. 1.1) - https://kyc.etoro.com/api/v1/tnc/documents/113.pdf
  Note: this is the older crypto-entity document. The stocks/ETF entity is eToro USA Securities Inc., whose customer agreement I could not retrieve (UNVERIFIED for that entity).
> "You must make sure that you are the only person with access to your Account at all times. You must make sure that no minors have access to your Account." (same document, cl. 11.3)
> eToro Service TMD (Australia): target market excludes "any person under 18 years of age" - https://www.etoro.com/wp-content/uploads/2026/03/eToro-Service-TMD.pdf (AU entity; not US).
No official eToro page offering custodial, UGMA/UTMA, teen, or family accounts was found. Absence is not proof; UNVERIFIED either way, but nothing points the other way.

**Can one account trade on behalf of another person?** Not under the API terms (Permitted Use above). In the app, the closest thing is a joint account for a spouse/first-degree relative:
> "etoro does not allow third-party payments. A third-party payment is a deposit that is not in the same name as the owner of the etoro account... if you wish to use a method of payment belonging to your spouse or another first-degree family member, we can set up a joint account for you. This means that both parties will be allowed access to deposit/withdraw funds, but only the account owner will be permitted to trade."
Source: https://www.etoro.com/en-us/customer-service/deposit-faq/

**eToro available to US residents?** Yes for the app. Entities: "eToro USA LLC (cryptocurrency trading), eToro NY LLC (cryptocurrency trading for New York residents), and eToro USA Securities Inc. (stocks, ETFs, and options trading)". Source: the Jan 2026 funds PDF above. "Crypto trading ... is not available in HI, NV, Puerto Rico and the US Virgin Islands" (https://www.etoro.com/en-us/trading/demo-account/ footer). State-by-state rules for stocks/ETFs: UNVERIFIED on official pages.

**Is the API available to US residents?** UNVERIFIED. 
- No eToro page says US residents can or cannot create API keys. The press release says only "now available to select users" with no country list. Terms: "eToro may cancel or limit the availability of the Builders' Economy, or any part of it, to any user, area, or jurisdiction at any time."
- Third-party data point (StockBrokers.com guide, dated 2 Nov 2026): "eToro launched AI connectors in October, but neither they nor its Agent Portfolios are offered to U.S. clients." That is about AI connectors and Agent Portfolios, not the key-based REST API. https://www.stockbrokers.com/guides/ai-agent-brokers
- Partners API registration has a `CountryBlocked` error ("Registration is not available for this country") and the docs use `US-TX` as an example region code, so US appears at least representable. Not proof of availability. https://api-portal.etoro.com/partners-api-reference/registration/partner-registers-a-new-etoro-user.md

**Assets for US users:** crypto (via eToro USA LLC / eToro NY LLC), stocks and ETFs (eToro USA Securities Inc., cleared by Apex), options. Source: Jan 2026 funds PDF; fees page tabs "Crypto / Stocks & ETFs / Options".

---------------------------------------------------------------------

## 5. Funding

**PayPal is a deposit method for US users.** Two official eToro pages, and they conflict on numbers:

- US Deposit FAQ (undated): "There are currently four payment methods available to US users" - Debit Card $50 min; Bank Account $50 min; **PayPal $50 min, $10,000 per transaction, instantly**; Wire $500. "What is the minimum First Time Deposit? The minimum deposit is $50 and the maximum deposit is $10,000 per day." https://www.etoro.com/en-us/customer-service/deposit-faq/
- US Customer Funds Availability, Jan 2026: "The firm currently has an initial deposit minimum of $100 that is subject to change." Table (eToro Investment App): ACH $10 / $10,000 per day; Wire $500; Debit Card $10 / $40,000; **PayPal $10 min / $10,000 per transaction / Instantly**. https://www.etoro.com/wp-content/uploads/2021/10/eToro-US-Funds-Availability_Jan-2026.pdf
- CONFLICT: first deposit $50 (FAQ) vs $100 (PDF, newer, dated); PayPal min $50 (FAQ) vs $10 (PDF). The Jan 2026 PDF is the dated one, so it is more likely current. The authoritative figure is the "Deposit" screen after sign-in (UNVERIFIED which one it shows). The US help-centre article the FAQ points to (help.etoro.com/en-us/s/article/what-are-the-maximum-and-minimum-deposit-amounts-US) is script-rendered and returned only "CSS Error".
- The US ETF how-to also says: "linking your bank account or PayPal and initiating a transfer" and "at least $10" to invest. https://www.etoro.com/en-us/investing/how-to-invest-in-etfs/

**Other regions (international FAQ):** PayPal row: "Instant ... USD, GBP, EUR and AUD ... $10,000 ... Must have an active PayPal account with funds available on the account balance or a credit/debit card linked to it." Not supported for eToro (UK) Ltd, eToro (Seychelles) Ltd, or a long country list (Algeria ... Belgium, Brazil, India, Saudi Arabia, United Kingdom ...). "PayPal is available only after the first deposit" in Bulgaria, Croatia, Cyprus, Czech Republic, Denmark, Estonia, Finland, France, Greece, Hungary, Ireland, Israel, Malaysia, Malta, Netherlands, New Zealand, Norway, Poland, Singapore, Spain, Sweden, Switzerland, South Africa and others. First-time deposit minimum: "Depending on your region and country regulations, the minimum first-time deposit to private accounts varies between $10 and $10,000." Later deposits: "All deposits other than the First Time Deposit ... are required to be at least $50. For deposits made by wire transfer, the minimum required is $500." (international page; the US PDF shows lower subsequent minimums). https://etoro.com/customer-service/deposit-faq

**Must the PayPal account be in the account holder's own name?** Yes, in effect:
> "etoro does not allow third-party payments. A third-party payment is a deposit made using a payment method that is not in the same name as the owner of the etoro account. As stated in our terms and conditions, the owner of the trading account should be the owner of the funds. Therefore, there is no option to make a deposit using someone else's payment method."
Source: https://etoro.com/customer-service/deposit-faq
US version: "If you attempt to use a third-party payment method without a joint account, your account will be closed and any remaining balance refunded." https://www.etoro.com/en-us/customer-service/deposit-faq/
Also: "using any corporate method of payment to deposit into a personal etoro trading account is against our terms and conditions." (a PayPal Business account is a problem).

**Can deposits be initiated or tested via the API?** No evidence. The word "paypal" occurs zero times across the API index and docs. Core API has no deposit endpoint. Partner API only lets an approved partner report ("notify") deposits made on the partner's own platform, and crypto deposit intents. So PayPal deposits happen on eToro's site/app only (UNVERIFIED as a negative; I could only show absence from the documentation).

**Test/sandbox deposits:** None documented. Demo account is pre-funded with virtual money (Q6).

---------------------------------------------------------------------

## 6. Demo account

> "Get $100,000 in virtual funds to build the practice portfolio of your dreams." / "A virtual account on etoro mirrors a real trading account, with the same features and the same live market conditions, except every trade is simulated." / "Every etoro account is credited with $100,000 in virtual funds ... To top up or reset, open a ticket with Customer Service ... The maximum we can add to your virtual balance is $100,000. We can also bring your virtual balance back down to a minimum of $2,000." / "Trades placed in the Virtual Portfolio use virtual funds only, with no fees and no impact on your real account balance."
Source (US site): https://www.etoro.com/en-us/trading/demo-account/

**Demo API keys without a verified or funded real account?**
- Verified: required. "To access the API, your etoro account must be verified." (https://api-portal.etoro.com/index.md); "Account shows as verified in settings; API Key Management is visible under Settings > Trading" (https://builders.etoro.com/get-started). Demo keys are created in the same screen as real keys (Environment = Demo), so they sit behind the same verification gate. Nothing says a demo key skips it.
- Funded: not stated anywhere I could find. UNVERIFIED whether an unfunded but KYC-verified account can create a demo key (docs list only "verified").
- A separate, non-API fact: you can open a demo-only account without KYC on the website ("Log in to etoro, or open a free account. Choose Virtual Portfolio..."), but that does not mean the API Key Management screen appears for it. UNVERIFIED.

**Demo API coverage:** Yes, full. "The Real and Demo APIs share the same shape: demo is a full-fidelity sandbox with simulated balances." Place/cancel orders (`POST /api/v2/trading/execution/demo/orders`, v3 async demo), close positions, read portfolio/PnL/orders/history (`trading--demo` group, 17 endpoints). Sources: https://builders.etoro.com/products/trading , https://api-portal.etoro.com/core/changelog.md . Demo copy-trading is also available.

---------------------------------------------------------------------

## 7. Is eToro a sponsor or listed resource of the PayPal AI hackathon?

No. Neither page mentions eToro (zero matches for "etoro" on either page, checked on raw HTML text).
- https://paypalaihackathon.devpost.com/ : "You may also use one of our sponsors' tools: AG Grid, APIMatic, Astropods, Bryntum, Channel3, Elastic, KERNEL, Postman, Render, Zapier." 
- https://paypalaihackathon.devpost.com/resources : "Sponsor Resources: AG Grid, APIMatic, Astropods, Bryntum, Channel3, Elastic, KERNEL, Postman, Render, Zapier" plus PayPal developer docs, PayPal AI toolkit and MCP server. No brokerage, trading, or Alpaca entry either.
- Requirement: "Build or update an application that integrates the PayPal developer platform (using the free sandbox environment) along with an AI tool, model, or platform of your choice." Any AI tool works "as long as PayPal integration is central to the project."
(Devpost returned HTTP 403 to the fetch tool; curl with a browser user-agent returned 200 and the real page.)

---------------------------------------------------------------------

## 8. Alpaca comparison

**PayPal as a funding source in Broker API: not documented.** The Funding Accounts page lists ACH (via Plaid), wire (domestic and SWIFT), and sandbox simulated transfers; the words "paypal" appear zero times in the funding page, the custodial page, the custodial launch blog, and Alpaca's docs `llms.txt`. Related products: Funding Wallets, Instant Funding (pages in the sidebar; not PayPal).
> "For US ACH, you will need to use Plaid to obtain the user's bank account information. You then pass the information to Alpaca using ACH API to create a Bank Link object."
> "When creating an ACH relationship with a Plaid processor token, Alpaca compares the bank account owner name from Plaid with the name on the Alpaca account. If the names do not match, the relationship is rejected and transfers cannot be initiated on that link."
> "In the sandbox environment, Transfer API simulates deposits and withdrawals to/from an account. The target account is immediately credited or debited upon such a request. Once an account is credited, the account can start trading with the Orders API."
Source: https://docs.alpaca.markets/us/docs/funding-accounts
UNVERIFIED as a negative (Alpaca could support it through a partner contract, but nothing public says so).

**Custodial (UGMA/UTMA) accounts for minors in production: yes, launched 11 May 2026.**
> "A custodial account enables an adult to open an account on behalf of a minor, who otherwise does not have the capacity to enter into a legal contract to open a brokerage account. Alpaca currently supports two custodial account types: Uniform Transfers to Minors Act (UTMA) and Uniform Gifts to Minors Act (UGMA)... Furthermore, a minor cannot use or trade in a custodial account as they are only the beneficiary. Custodial accounts do not support shorting, margin, or pattern day trading. ... any KYC checks will be run on the adult."
Source: https://docs.alpaca.markets/us/docs/custodial-accounts
> "We are excited to announce the launch of custodial accounts for Alpaca's Broker API partners. ... partners can enable parents and guardians in US households to start investing on behalf of the next generation" ... "UGMA accounts are recognized in all 50 US states, and UTMA accounts are available in every state except for South Carolina and Vermont." ("May 11, 2026")
Source: https://alpaca.markets/blog/alpaca-launches-custodial-accounts-for-broker-partners/
Caveat: the docs/blog show it is open to Broker API partners; whether a hackathon sandbox key can create `account_type: "custodial"` accounts is UNVERIFIED (I did not call the API).

---------------------------------------------------------------------

## Things that surprised me
1. eToro's own API terms (Feb 2026, beta) limit personal keys to "your own eToro trading account" and exclude "use on behalf of third parties". An app where Amara's approval triggers a trade in Zoe's account is outside that, and Zoe (15) cannot hold an eToro account (18+). The legitimate eToro routes are OAuth app registration (review queue) or the Partners API (per-partner contract); neither looks achievable by 12 Nov.
2. eToro does have a real partner/white-label style API (register users, KYC, cash accounts, deposit reporting), which is closer to what Tether needs than the personal keys, but it is gated "contact your etoro representative".
3. PayPal never appears in eToro's API docs. PayPal deposit is a website/app flow only, so the founder's "eToro accepts PayPal" point does not translate into anything an API call can do or test.
4. Third-party-payment rule: the PayPal account must be the account holder's. eToro offers a joint account for spouse/first-degree relative where "only the account owner will be permitted to trade", so a parent funding a child's real account is not supported by the documented rules.
5. eToro US deposit numbers contradict each other (first deposit $50 vs $100; PayPal minimum $50 vs $10) across two official pages.
6. Alpaca is the better fit on paper for the custodial story (adult custodian, minor_identity, KYC on the adult), but it also has no PayPal funding; its funding is ACH via Plaid with an owner-name match, and sandbox funding is simulated instantly.
7. eToro's documented US minimum buy is $10, not $1.
8. A 15-year-old's account type in the US that does exist on Alpaca (UGMA/UTMA) means the custodian (Amara) is the legal trader; "minor cannot use or trade" matches Tether's approve-then-execute design.

## Not read / not done
- eToro USA Securities Inc. customer agreement (stocks/ETFs entity) was not retrieved; age rule for that entity rests on the older eToro USA LLC terms plus the AU TMD.
- help.etoro.com US articles (script-rendered) returned an error shell; the US deposit-minimums article was not readable.
- No API calls were made (no keys), so VTI availability, the real `minPositionExposure`, and whether US accounts can see "API Key Management" were not tested.
- Partner API reference pages other than registration were not read in full.
