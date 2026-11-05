# Tether — UX plan (and the web-vs-native decision)

Companion to `HOW-IT-WORKS.md` (screens and copy), `PRD.md` (requirements) and `PARENT-COPY.md` (voice). Screen renders are in `screens/` and the editable source is `screens.html`.

---

## 0. The answer first: web, not native

**Build a responsive web app, installable as a PWA. Do not build a native app.** Five reasons, in order of weight:

1. **The teenager won't install your app.** This is the product argument, not a build shortcut. A 15-year-old will not install her mother's chosen app. She *will* tap a link her mum texts her. **So the teen surface should be a link, and the guardian surface can be an install.** A native app actively breaks the adoption model; web makes it work.
2. **The judges have to be able to try it.** A URL they can open beats an app they can't install. Devpost submissions reward accessible demos, and "Best Demo Delivery" is a prize.
3. **Five weeks, small team.** Native means two codebases, two signing setups, and app-store review with a multi-day (and rejection-prone) path. Web gets you to a demoable, clickable, installable product in a fraction of the time.
4. **PayPal's tooling is web-first.** The JS SDK v6 for Venmo and the vault/save flow are JavaScript browser surfaces. The technical spine and the delivery platform agree.
5. **A family/kids app in an app store triggers additional review requirements** and a slower path. Web sidesteps that entirely at this stage.

**When you would genuinely need native** — and why none of it bites here: background location, Bluetooth, OS-level parental-control integration (iOS `FamilyControls`/`DeviceActivity`, Android `UsageStats`), or a business requirement for store distribution. Note the irony worth saying out loud: **real parental-control-grade features require native — and Tether deliberately is not a parental-control product.** Our non-goal keeps us on the web.

**PWA gets you ~80% of "app" cheaply:** installable to the home screen, standalone window, offline shell, and web push on installed iOS PWAs (16.4+). Push reliability is the one real caveat, so: **guardian installs the PWA for push; notifications to the teen stay minimal** — which the product wants anyway.

## 1. Do we need this document?

Yes, for three non-optional reasons.

- **Design is 20% of the score**, and it is judged on coherence, not decoration. Two audiences with opposite needs cannot both be designed well from vibes.
- **The demo *is* the UX.** Three minutes of video is mostly screen time. The storyboard in §10 is a UX artefact.
- **The responsive behaviour isn't decided yet.** Every screenshot so far is a 360px phone. A guardian editing rules on a laptop is a different layout, and pretending otherwise is how you end up with a stretched mobile view on camera.

What this document is *not*: a place to invent more screens. Ten exist and the flows are settled. This decides **devices, states, and rules.**

## 2. Design principles

1. **Two apps, one system, opposite moods.** The teen surface is a scoreboard; the guardian surface is a document. They share components and nothing else.
2. **Every state is explainable in one tap.** No number, level or refusal appears without a "why?" behind it.
3. **The consent surface is the plainest screen.** No AI, no suggestions, no chat — ever — at the moment authority is granted or approved.
4. **One number per screen.** The teen app answers "how much is left?" before anything else.
5. **Quiet by default.** Absence of notification is a designed state, not a gap: *"Nothing needs you today."*
6. **No dead ends.** Every refusal carries two ways forward; every waiting state says what would end it.
7. **Colour states a fact, never a mood.** Four states — allowed, needs approval, refused, locked — and nothing decorative borrows their colours. **Refusal is amber, never red.** **Locked is muted, never alarming.**

## 3. Surfaces and devices

The important finding: **the guardian's two jobs happen on different devices.**

| Surface | Primary device | Job | Stance |
|---|---|---|---|
| **Teen app** | Phone only | Check what's left, spend, ask, save | Never a desktop view. Not once. |
| **Guardian — approve** | Phone | One tap on a request | Mobile-first, glanceable, 30 seconds |
| **Guardian — author & review** | **Laptop** | Write rules, read the record, monthly review | Desktop-first two-column layout |

That split is why the guardian experience needs two layouts and the teen needs one. Approvals happen standing in a kitchen; authoring happens at a desk on a Sunday evening.

## 4. Screen inventory

| # | Screen | Surface | Breakpoints |
|---|---|---|---|
| 1 | Your week | Teen | 390 only |
| 2 | Refusal sheet | Teen | 390 only |
| 3 | Goals | Teen | 390 only |
| 4 | Ask | Teen | 390 only |
| 5 | Level up | Teen | 390 only |
| 6 | Week ended *(new)* | Teen | 390 only |
| 7 | Money waiting *(new)* | Teen | 390 only |
| 8 | Home | Guardian | 390 → stacked |
| 9 | The grant | Guardian | 390 stacked · **1280+ two-column** |
| 10 | A request | Guardian | 390 primary |
| 11 | The record | Guardian | 390 stacked · **1280+ dashboard grid** |
| 12 | Monthly review | Guardian | 390 → 1024 two-column |
| 13 | Where your money works *(new — permission grid)* | Teen | 390 only |
| 14 | Pick shops *(new — merchant picker)* | Guardian | 390 stacked · **1280+ grid** |

Screens 13–14 came out of the merchant directory work (`MERCHANT-DIRECTORY.md` §5 and §8). Both are currently unmocked. Screen 13 is the one that makes the ladder *visible* rather than described, and it is the strongest individual UX idea in the project.

## 5. Responsive rules

**Breakpoints:** 390 (phone) · 768 (tablet) · 1280 (desktop).

- **Teen app:** fixed single column, `max-width: 460px`, centred, with generous vertical rhythm. Never reflows into columns — a teenager checks this standing up.
- **Guardian, 390:** everything stacks. Definition rows go label-above-value. The record becomes a list of cards.
- **Guardian, 1280:** sidebar navigation + content. The grant editor becomes **author left, live preview right** — the guardian should see exactly what Zoe will read while writing it. The record becomes a table with the evidence packet as an expandable row.
- **Targets:** ≥ 44×44 px everywhere; primary actions in the bottom third on phones.
- **Type:** 16px minimum body on the teen surface; the hero number scales 52→60px between 390 and 430.

## 6. The states everyone forgets

These are where a demo falls apart, and each one is a product statement. All are now mocked.

| State | Surface | What it says | Why it matters |
|---|---|---|---|
| **Week ended** (grant expired) | Teen | "Your week's finished. Sunday's $20 hasn't been loaded — Amara needs to renew your rules." + *Nudge Amara* | Grants expire by design, so authority is never renewed by accident. Also a natural weekly re-contact point. |
| **Money waiting** (unclaimed payout) | Teen | "$6.00 is waiting for your Venmo account" + 30-day warning | Handles the unclaimed-payout reality honestly instead of pretending money always lands. |
| **Empty week** | Teen | Quiet state, no shaming language | A day with no spending is not a failure state. |
| **Request declined** | Teen | "Amara said not this time." | Never a silent dead end. |
| **Loading** | Both | Skeleton, never a spinner on the hero number | Money numbers must not flicker. |
| **Engine unreachable** | Both | "We can't check your rules right now, so nothing can be spent." | Fail closed, visibly — and it's a trust-building moment, not an error. |
| **No connection at a till** | Teen | "You're offline. This one needs a signal." | Honest, and avoids blaming the kid. |

## 7. Navigation and interaction model

- **Teen:** four tabs — Week · Goals · Ask · Me. The refusal sheet and confirmations are modal sheets from the bottom, dismissible by swipe. One thumb, always.
- **Guardian:** four destinations — Zoe · Grant · Record · Settings. Requests arrive as a deep link, not as a place you navigate to.
- **Depth:** never more than two taps from any state to its explanation.
- **Motion:** used only to confirm a change in authority (the level-up) and to move a sheet. `prefers-reduced-motion` collapses both to opacity.

## 8. Accessibility

WCAG 2.1 AA as the floor, because the teen surface is used one-handed, in sunlight, on the move:

- Contrast ≥ 4.5:1 for body text; the amber refusal colour was chosen to pass against the sheet background, not for aesthetics.
- Status is never conveyed by colour alone — the refusal carries a label ("Not this time"), not just an amber tint.
- Semantic HTML, real focus rings, full keyboard traversal on the guardian's desktop surfaces.
- Dynamic type respected on the teen surface; layouts must survive 130% text scaling.
- Money set in tabular figures so digits don't jitter between states.
- Full token set, component specs, the four-state colour language and the v0.dev prompt pack: `DESIGN-SYSTEM.md`.

## 9. Voice

Rules live in `PARENT-COPY.md` §11. The short version: kitchen-table language, verbs not nouns, numbers not adjectives. Say *allowance, rules, earned, proof, practice*. Never *financial literacy, AI-powered, monitor, parental controls*.

## 10. Demo storyboard (screens × timings)

Three minutes, and this is the UX specification for the video.

| Time | Beat | Screen | Surface |
|---|---|---|---|
| 0:00–0:20 | The problem, one line: *"every limit in your house is enforced by your face"* | — | — |
| 0:20–0:50 | **The grant is signed.** Rules written, plain-words clause read aloud | 13 · Grant editor | Desktop |
| 0:50–1:35 | **The refusal.** $15 hoodie, arithmetic, two ways forward, the earn-more-freedom line | 2 · Refusal sheet | Teen phone |
| 1:35–2:05 | **Ask → approve.** Request arrives, one tap, budget consequence shown first | 4 · Ask → 10 · A request | Both phones |
| 2:05–2:30 | **Capture + proof.** Balance updates; open the record and show the receipt | 11 · The record | Desktop |
| 2:30–2:55 | **Earned authority.** Level 3 with its evidence, both sides | 5 · Level up → 12 · Monthly review | Phone + desktop |
| 2:55–3:00 | The closer: *"when they're eighteen, we're finished"* | 8 · Home | Guardian |

Three screens must be unmistakable: **the grant, the justified refusal, and the earned upgrade.**

## 11. Implementation approach

- **One codebase, two experiences.** React (Next.js) or the managed WebDev stack; the tokens are already defined in `screens.html` and port over directly.
- **Tokens first.** Colour, type scale, radii, and spacing as CSS variables. `DESIGN-SYSTEM.md` is the canonical set, and the mockups already use this pattern. Note the scale needs normalising: the current renders use eleven type sizes and nine radii, which collapse to six and four respectively.
- **PWA:** manifest + icons + service worker for an offline shell. Install prompt for the guardian only.
- **Auth:** magic-link/SMS for the teen (no password to forget, no app to install), passkey or email for the guardian.
- **Notifications:** web push for the guardian's three alert types; minimal for the teen.
- **Teen access:** a tokenised URL the guardian can text or show as a QR code. That single decision is what makes the teen surface actually get used.
- **Admin/ops views** (spend by constraint, refusals, promotions, goal progress) double as the AG Studio dashboard for the $8k sponsor track.

## 12. What we will not build

No chat interface. No graphs or charts **on the teen surface** — one bar per screen is enough, and charts invite comparison rather than decisions. Charts are scoped to the guardian's review surfaces only (the record, the monthly review) and never appear anywhere the teenager can see them; see `DESIGN-SYSTEM.md` §5. No badges, streaks or points — the levels are *evidence*, and turning them into a game would undermine the entire thesis. No settings screen a teenager can wander into. No desktop teen view. No dark mode in the hackathon window (design it, don't build it). **No promotional compartment, ever** — not in the directory, not in the record, nowhere the teenager can see it (FR-14.2). **No red state**: a refusal is amber, and a locked item is muted. No animated money.