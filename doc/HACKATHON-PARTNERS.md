# Brokerage rails and hackathon partners for Tether

Companion to `PRD.md`, `MERCHANT-DIRECTORY.md` and `DESIGN-SYSTEM.md`. Written against the PayPal AI Hackathon rules and the five sponsor pages supplied.

The submission deadline is **Thursday 12 November 2026 at 12:00 pm Pacific** — seven days from now [1]. That single fact decides most of what follows, because it rules out anything needing a partner contract, a KYC review, or a compliance sign-off. Judging is on five equally weighted criteria: technological implementation, design, potential impact, innovation, and presentation [1]. Note that only one of those five rewards more features.

## Alpaca or DriveWealth

**Neither goes into the hackathon build as a live teenage-investing loop, and the reason is onboarding, not fit.**

DriveWealth is the better *product* fit and the worse hackathon fit. Its Teen account is owned by an adult who grants trade authorisation to a minor, with parental controls built in — trades above $25 require parent or guardian approval, withdrawals always do, and the account is limited to stocks [8]. That is Tether's approval model already implemented at the custodian, which is genuinely rare and worth naming in the submission. But DriveWealth is sold as brokerage-as-a-service to partners, not to developers: onboarding runs through "connect with us", fully disclosed partner agreements, customer account agreements and disclosures [7] [12]. There is no self-serve key. Seven days is not enough, and pretending otherwise wastes the week.

Alpaca is the better *hackathon* fit and the worse product fit. The Trading API is self-serve, and paper trading is the sandbox — anyone can sign up and get keys immediately [11] [14]. But its custodial UGMA/UTMA accounts exist only for Broker API partners, and Broker API does not support paper trading at all [10] [15]. So the minor-account path is closed this week. Its IRA is real and API-enabled, but contributions and distributions run through Alpaca's web portal rather than the API [9], so it cannot be driven by an agent end to end.

The practical answer is to build the investing leg behind a single adapter interface, then demo it against **Alpaca paper trading** so there is one genuine, live API call producing a real fractional-share order — clearly labelled as paper — and name **DriveWealth** in the roadmap as the production partner, with the Teen account as the stated reason. That gives you a real integration without a fictional one.

One thing to drop: **do not demo a Roth IRA.** A Roth contribution must be backed by earned income and capped at the lesser of the annual limit or what was actually earned [13], and both providers require an adult US taxpayer with an SSN [7] [9]. A teenager's allowance is not earned income, so an IRA cannot be the destination for it. Demo a teen or custodial *taxable* account, and say why the IRA is out of reach. That candour is worth more to a judge than a feature.

The larger point: the brokerage is not the product. Tether's strength is authority, evidence and design. A live securities integration is a liability for design, impact and innovation in a seven-day window, and the savings commitment in the PRD already delivers the "save toward something" behaviour without securities risk.

## What is actually winnable

The prize rules allow a project to take **one Grand Prize plus one Sponsor Prize, or one Honorable Mention plus one Sponsor Prize** [1]. So the correct strategy is a strong core submission aimed at the general prizes, plus exactly one sponsor prize chased properly rather than five chased badly.

Tether is naturally positioned for **Best Use of Agentic Commerce** and **Most Impactful** among the $5,000 honorable mentions, and for **Best Demo Delivery** if the three-minute video is disciplined. Stage One is a pass/fail screen on whether the project applies the required APIs, and PayPal integration must be central — sponsor tools are explicitly optional [1].

Of the five tools supplied, only two carry sponsor money that suits Tether. Channel3 is $1,500 for one winner; AG Grid is $5,000, $2,000 and three $1,000 prizes; APIMatic is three $1,000 prizes. Zapier and Astropods appear on the tools list but have **no sponsor prize in the prize table** [1], so they are technical choices rather than prize plays.

## Channel3 — this is the merchant directory

Channel3 returns clean, normalised product data — titles, images, prices, variants, availability and buy links — across 100 million products from 25,000 retailers, through one API or an MCP server. Hackathon keys come with 20,000 free credits, and the stated requirement is that your project must actually call it rather than merely reference it [2].

This is the most valuable partner for Tether, because it closes a gap the PRD already admits. The `allowed_merchants` constraint needs identifiers to enforce against, and there is no consumer merchant-directory API in existence — ACP says discovery is unresolved. Channel3 is the nearest thing to that registry, and it supplies exactly the fields the directory's deterministic path needs: who the retailer is, what the canonical domain is, whether an item is available, and where it can be bought.

The guardrail matters as much as the integration. Tether's directory may never become a shopping feed, and its teen view may show no prices, promotions or recommendations. So Channel3 belongs in two places only: resolving a payee to a canonical merchant record for gate 2's ground truth, and powering the **guardian's** picker. Never as a browse surface for the teenager. Used that way, the partnership reinforces the thesis instead of contradicting it.

## AG Grid — the evidence record

AG Studio bundles dashboards, charts and grids into one component, with a built-in data engine, cross-filtering, and a Studio Agent Framework that lets agents build, query and edit dashboards. The award is judged on polish — custom widgets, theming, layout tools — and explicitly rewards taking the agent framework for a spin [3].

Tether's guardian record screen is already specified as a desktop dashboard containing a payments table and an expandable evidence packet, which is AG Grid's native use case rather than a contrivance. The Studio Agent Framework then maps onto a genuinely useful guardian affordance: asking, in plain language, what the teenager spent on books in October, and getting a live widget rather than a chart to interpret. AG Grid's own example ideas include an anomaly agent that flags refund spikes, which suits a product that already tracks refunds, disputes and constraint failures [3].

There is one honest tension. `UX-PLAN.md` says no charts, on the grounds that charts invite comparison rather than decisions, and that the teen surface answers one question with one number. The resolution is to scope charts to the **guardian's desktop review only** and keep them off the teen surface entirely. That keeps the product principle intact while satisfying the sponsor, and it is a better story than abandoning either one.

## APIMatic — publishing Tether as a mandate API

APIMatic turns API contracts into SDKs, documentation portals, and Context Plugins for AI coding agents, all generated from one source of truth. PayPal is already enabled in its Context Plugin, so no extra credentials are needed [4].

There are two layers here and they are worth separating. The Context Plugin is a build accelerator — it feeds your coding agent the PayPal API context, which helps satisfy the requirement cheaply and costs nothing to adopt. The more interesting artifact runs the other direction: write the mandate engine as an OpenAPI specification and let APIMatic generate the SDK, the docs portal and an agent-facing context plugin from it. That reframes Tether from an app into infrastructure — the mandate layer that other wallets could call — which is a much stronger answer to the "potential impact" criterion than another screen.

With three $1,000 prizes available and a spec you may already have, this is the cheapest sponsor prize on the board [1].

## Astropods — a runtime for the one agent that should have no authority

Astropods describes itself as an agent operating system: models, knowledge bases, tool integrations, observability, plus runtime and guardrails. Agents are defined with a declarative spec, built and pushed with a CLI, and deployed through an API or dashboard, with a documented path to Slack [5].

Tether has exactly one component that belongs on an agent runtime, and it is the explanation agent — the part that reads untrusted merchant content and writes the sentence a teenager reads. Giving that component managed guardrails, tool scoping and observability is a real technical fit, and the Slack path is a plausible home for guardian approvals.

The decision engine must never run there. Tether's entire argument is that the component that authorises money is deterministic code with no model in the path, and putting the engine on an agent platform would undermine it. Framed correctly, though, this is a strong line for the video: we ran our agent on a production agent OS and gave it no authority over money. No sponsor prize is attached, so it is worth doing only after PayPal and Channel3 are working [1].

## Zapier — use the reporting half, never the acting half

Zapier MCP lets AI tools take real action across more than 9,000 apps, including PayPal, with Zapier handling logins and permissions. New accounts get a 14-day Professional trial [6].

Taken at face value, this is close to the anti-pattern Tether is built against. An agent that can act across nine thousand applications, PayPal among them, is precisely what a guardian should refuse to hand to a teenager's allowance. So the integration has to be scoped in code, not in intent: Tether uses Zapier for **outbound notification and household workflow** — a level change, the monthly review delivered, an allowance-day reminder landing in a calendar — while the decision path is given no access to Zapier's PayPal tools at all.

That is not a workaround for a sponsor requirement. It is the thesis, demonstrated on camera. "We wired our agent to a platform with nine thousand apps of real action, and gave it none of the ones that move money" is a better sentence than any feature list.

## Sequencing the seven days

The pass/fail gate is PayPal centrality, so the PayPal sandbox spine — Orders v2 with a vaulted method, Payouts for the allowance — and the mandate engine wired to it comes first, and it is non-negotiable.

Channel3 goes in second, because it is both a $1,500 prize and the thing that makes the merchant directory real rather than seeded by hand. The guardian record on AG Studio comes third, since the screen is already specified and the prize is the largest one available. Alpaca paper trading slots in behind the adapter as a single genuine order call, labelled as paper. Astropods and Zapier come last, and only if there is room, because neither carries prize money.

The video deserves a protected day. It is a scored criterion, judges are not required to watch past three minutes, and the rules require a working build they can actually run — a mockup or static prototype does not qualify [1]. Freeze scope before that day arrives, not on it.

## References

[1]: https://paypalaihackathon.devpost.com/rules "PayPal AI Hackathon Official Rules"
[2]: https://paypalaihackathon.devpost.com/details/channel3 "Channel3 sponsor page"
[3]: https://paypalaihackathon.devpost.com/details/aggrid "AG Grid sponsor page"
[4]: https://paypalaihackathon.devpost.com/details/apimatic "APIMatic sponsor page"
[5]: https://paypalaihackathon.devpost.com/details/astropods "Astropods sponsor page"
[6]: https://paypalaihackathon.devpost.com/details/zapier "Zapier sponsor page"
[7]: https://developer.drivewealth.com/apis/docs/retirement-accounts "DriveWealth retirement accounts"
[8]: https://developer.drivewealth.com/apis/docs/teen-custodial-accounts "DriveWealth teen and custodial accounts"
[9]: https://alpaca.markets/blog/alpaca-introduces-individual-retirement-accounts-for-trading-api-users "Alpaca IRA accounts announcement"
[10]: https://alpaca.markets/blog/alpaca-launches-custodial-accounts-for-broker-partners "Alpaca custodial accounts for Broker API partners"
[11]: https://docs.alpaca.markets/us/docs/paper-trading "Alpaca paper trading documentation"
[12]: https://www.drivewealth.com/contact/ "DriveWealth contact and partner onboarding"
[13]: https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-ira-contribution-limits "IRS IRA contribution limits"
[14]: https://alpaca.markets/support/can-i-have-access-to-the-sandbox-environment "Alpaca sandbox and paper trading"
[15]: https://forum.alpaca.markets/t/403-for-paper-trading/14118 "Alpaca forum: Broker API does not support paper trading"