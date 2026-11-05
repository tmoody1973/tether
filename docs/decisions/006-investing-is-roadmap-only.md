# 006 — Investing stays on the roadmap, not in the hackathon build

**Decision** — No investing feature in this build; one roadmap slide describes it.

**Why this came up** — Tarik asked whether Alpaca's API could give teens an investing option. Investing is a natural next step for saved money, and a strong-sounding feature.

**Options**
1. **Build it with Alpaca's Broker API sandbox** (a test environment with simulated trades, free and self-serve). It supports custodial accounts (accounts an adult manages for a minor). Cost: about a day; the money leaves the parent's PayPal and legally becomes the teen's property; PayPal can't fund it, so the showcase screen isn't PayPal's; "a minor cannot use or trade in a custodial account"; an app suggesting investments is likely a regulated investment adviser.
2. **A labelled simulation on a paper-trading account.** Cost: 2–3 hours, and it's fake in a submission whose strength is honesty.
3. **Roadmap slide only.** Cost: no investing on screen.

**Update, 2026-11-05 (Tarik):** the sandbox refused custodial accounts, so investing is built now on an ordinary sandbox account labelled as a stand-in; the custodial path stays behind a one-setting switch (`ALPACA_CUSTODIAL_ENABLED`).

**Final decision, 2026-11-05 (Tarik):** investing is a **Must** and will not be cut. The day-1 Alpaca checks now decide *how* it's built, not *whether*. If the sandbox won't create a custodial account and Alpaca support hasn't enabled one by Sunday 8 Nov, a regular sandbox account stands in, labelled on screen as a stand-in. (This file keeps its original name so the history stays readable.)

**Earlier revision, same day (joint):** Tarik brought a plan that fixes two of the costs in option 1. The teen proposes and the parent approves, so the parent places the trade as the law requires. The parent keeps an allowlist of funds, so Tether recommends nothing. Investing is now a **one-day stretch**, attempted only if two 15-minute day-1 checks pass: a free Alpaca sandbox signup works, and the sandbox accepts a custodial account. Otherwise it falls back to option 3. Details: design doc, D13.

**Original choice** — Option 3. Claude's call. Seven days, and PayPal must be central to the submission. The slide still shows the idea fits Tether's pattern: *"Level 4: savings can be invested. Zoe proposes, Amara approves."*

**What we gave up** — A crowd-pleasing feature in the demo.

**How we'll know if this was right** — No judge feedback says "where's the investing?" more often than feedback praising focus; or, after the hackathon, the custodial sandbox test (checking whether custodial accounts work in a fresh sandbox) takes under a day.

**What actually happened** —
