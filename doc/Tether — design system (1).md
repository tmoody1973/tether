# Tether — design system

The single source of truth for colour, type, space, and component behaviour. Companion to `UX-PLAN.md` (devices, states, principles), `PRD.md` §11 (non-functional requirements), `HOW-IT-WORKS.md` (screens and copy), `PARENT-COPY.md` (voice). Renders live in `screens/`; the editable source is `screens.html`.

---

## 0. Provenance, stated honestly

This system began as a **Bento-style design system for a culturally sensitive food-budget app** — a warm palette, an Inter/Lato pairing, grid-based card compartments, and a v0.dev prompt pack for generating mockups.

**The method transferred. The values did not.** A food-budget app's palette and its notion of cultural sensitivity do not describe a product about a parent's authority over a teenager's money. So:

| Taken as-is | Re-derived for Tether |
|---|---|
| Bento grid as the organising layout | **Scoped** — used only where the job is enumeration or review (§6). It must not touch the teen's hero screen |
| Warm, non-clinical register | Kept, and made load-bearing: a cold fintech palette would make the guardian feel audited and the teenager feel watched |
| Accessible type, clear hierarchy, consistent nav | Kept, and formalised into a scale (§4) |
| "Cultural sensitivity" | Translated into **household sensitivity** (§9) — family structure, language, money culture |
| v0.dev prompt pack | Kept, rewritten for Tether's six screens with the state semantics embedded (§11) |
| Explicit hex values (#4CAF50, #FFC107, #2196F3) | **Replaced.** Tether already has a palette in `screens.html`; that is canonical, and §1 records it |

**What this document actually does:** the existing tokens are coherent but the *scale* is ad hoc — eleven distinct font sizes from 9px to 19px, radii from 4px to 15px. This formalises them into a system, specifies the four-state colour language, and sets the rules that stop the system being applied where it would hurt.

## 1. Tokens (canonical)

Extracted from `screens.html`. Two audience systems sharing one ink scale.

### Shared ink

| Token | Value | Use |
|---|---|---|
| `--ink` | `#14121F` | Primary text |
| `--ink-2` | `#4B4A5A` | Secondary text |
| `--ink-3` | `#8A8899` | Tertiary, muted, locked states |
| `--line` | `#E6E4EF` | Borders, dividers |

### Teen surface (`--t-`)

| Token | Value | Use |
|---|---|---|
| `--t-accent` | `#5B4BFF` | Structure, focus, informational |
| `--t-accent-soft` | `#EEEBFF` | Informational containers |
| `--t-canvas` | `#F6F5FB` | Page background |
| `--t-surface` | `#FFFFFF` | Cards |
| `--t-ok` | `#12B76A` | **Allowed** |
| `--t-warn` | `#F79009` | **Needs approval** |
| `--t-warn-soft` | `#FFF4E6` | Refusal and approval containers |
| `--t-gold` | `#FFB020` | The savings goal, and the earn-it glow |
| `--t-warn-deep` | `#9A5B00` | **Refused** text and icon *(already present as a literal; promoted to a token here)* |

### Guardian surface (`--g-`)

| Token | Value | Use |
|---|---|---|
| `--g-accent` | `#0B6B5B` | Structure, focus, primary action |
| `--g-accent-soft` | `#E8F2EF` | Containers, the signed-clause panel |
| `--g-canvas` | `#F4F5F7` | Page background |
| `--g-surface` | `#FFFFFF` | Cards |
| `--g-ink` | `#1A1D21` | Primary text |
| `--g-line` | `#E3E6EA` | Borders, dividers |

### §1.1 Two accents, two audiences

This is the strongest thing in the existing system and it should not be diluted. The teenager gets **indigo** (`#5B4BFF`) — energetic, contemporary, not childish. The guardian gets **deep teal** (`#0B6B5B`) — institutional, calm, documentary. That is `UX-PLAN.md` §2's *"two apps, one system, opposite moods"* expressed as two variables, and it means the two surfaces are distinguishable at a glance in a video that cuts between them.

## 2. Colour encodes state, never decoration

Tether has exactly four states a user can encounter, and they are the same four in the UI, in the mockups, and in the architecture diagrams. **One language across product and documentation** — this is why the diagrams in this project use these hex values rather than a diagramming tool's defaults.

| State | Text / icon | Container | Icon | Copy |
|---|---|---|---|---|
| **Allowed / open** | `--t-ok` `#12B76A` | surface + `#12B76A` border | check | "Within your rules" |
| **Needs approval** | `--t-warn` `#F79009` | `--t-warn-soft` `#FFF4E6` | clock | "Amara needs to say yes" |
| **Refused** | `--t-warn-deep` `#9A5B00` | `--t-warn-soft` `#FFF4E6` | stop hand | "Not this time" |
| **Locked (future)** | `--ink-3` `#8A8899` | transparent + `--line` border | padlock outline | "Opens at Level 2" |
| *Informational* | `--t-accent` `#5B4BFF` | `--t-accent-soft` | info | — |

### Two rules worth stating explicitly

> **Refusal is amber, never red.** A refusal is a rule outcome, not an error, and the teenager is not a fault condition. Red would say *you did something wrong*; amber says *this doesn't fit the rules yet*. This is already how the mockups behave — it is recorded here so nobody "fixes" it.

> **Locked is muted, never alarming.** The ladder is a path, not a punishment. A locked merchant tile uses muted ink and a quiet border, because the correct emotional reading is *not yet*, not *denied*.

This also discharges `UX-PLAN.md` §8's requirement that status is never carried by colour alone: **every state ships with an icon and a label**, and colour is the third signal, not the first.

## 3. Type

**Inter**, sole family (`Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`). Inter was the right half of the source system's Inter/Lato pairing, and one family is correct here: a money product needs consistent numerals more than it needs contrasting textures.

**Georgia (serif) is reserved for exactly one thing:** the signed grant clause, on the consent surface. The guardian is reading a *document* at that moment, and the serif is what makes it feel like one. Nowhere else.

### Scale

The mockups use eleven sizes between 9px and 19px. Reduced to six steps:

| Role | Size / weight | Notes |
|---|---|---|
| Hero number | 60px / 800 | Teen "how much is left". `tabular-nums`. Scales 52→60 between 390 and 430 |
| Display | 34px / 750 | Level-up, empty states |
| H1 | 28px / 700 | Page title |
| H2 | 20px / 700 | Section, card title |
| Body | 16px / 400 | **Floor on the teen surface** (`UX-PLAN.md` §5) |
| Body-sm | 14px / 400 | Guardian secondary, captions |
| Label | 12px / 650 | Uppercase, `letter-spacing: .04em` — the section label |

Weights collapse to **400 / 500 / 600 / 700**, with 650 and 750 retained for optical balance in Inter's variable axis. The mockups' 800/750/700/650/600/500 spread is redundant.

### Money rules

- **`font-variant-numeric: tabular-nums` on every amount, everywhere.** Digits must not jitter between states, and columns must align in the record.
- Currency symbol and amount are one token — never split, never on separate lines.
- Negative states are expressed by *label*, not by a minus sign or parentheses.
- **Amounts never animate.** A money number that counts up is a money number you can't trust.

## 4. Space, radius, elevation

Extracted from the mockups (gaps of 7, 8, 9, 12; padding of 8–13), normalised to a 4px base:

| Scale | Value |
|---|---|
| `--s1` | 4px |
| `--s2` | 8px |
| `--s3` | 12px |
| `--s4` | 16px |
| `--s5` | 24px |
| `--s6` | 32px |
| `--s7` | 48px |

**Radius:** `6px` small controls · `10px` inputs and chips · `14px` cards and sheets · `99px` pills · `50%` avatars. (The mockups' 4/5/7/8/9/11/13/14/15 spread collapses to these four.)

**Elevation:** three levels only.
- `0 1px 2px rgba(20,18,31,.05), 0 0 0 1px rgba(20,18,31,.045)` — card at rest
- `0 1px 3px rgba(20,18,31,.12)` — raised
- `0 26px 52px -22px rgba(20,18,31,.38)` — phone frame (mockups only, never in product)
- The gold CTA keeps its warm glow: `0 12px 26px rgba(255,138,61,.34)` — the one piece of decoration the system permits, and only on the "earn it" action.

**Page width:** teen `max-width: 460px` centred; guardian desktop container `max-width: 1400px`.

## 5. Layout — Bento, scoped

![Two gates, composed with AND](https://private-us-east-1.manuscdn.com/sessionFile/z1WmEoe9zcCtwaTZyZdthu/sandbox/ascsbObTcIm7uJYTl0ms2V-images_1791514910160_na1fn_L2hvbWUvdWJ1bnR1L3RldGhlci9kZWNpc2lvbi1nYXRlcw.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvejFXbUVvZTl6Y0N0d2FUWnlaZHRodS9zYW5kYm94L2FzY3NiT2JUY0ltN3VKWVRsMG1zMlYtaW1hZ2VzXzE3OTE1MTQ5MTAxNjBfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwzUmxkR2hsY2k5a1pXTnBjMmx2YmkxbllYUmxjdy5wbmciLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTM0OTEyMDB9fX1dfQ__&Key-Pair-Id=K2QY5QTL8JSY6C&Signature=MEUCICBPWuwNpUegak4ucFBBdJZemepfJOszsrF~Y-Yfhb~QAiEA5KZPfDkkVwITIFknivZkjnBXOp7hVEPjMfajqBC-zeU_)

*The diagrams are part of the system, which is why they use these tokens.*

The source system says Bento everywhere. **Tether must scope it**, because `UX-PLAN.md` §2 principle 4 is *"one number per screen"* and a Bento grid is many compartments. Applied indiscriminately, the Bento principle would quietly destroy the teen's hero screen.

**Where Bento applies** — the job is *enumeration or review*:

| Screen | Why |
|---|---|
| Guardian · the record (1280) | Already specified as a "dashboard grid" in `UX-PLAN.md` §4 |
| Guardian · the grant editor (1280) | Rules grouped into compartments, author left / live preview right |
| Guardian · pick shops (1280) | The merchant directory picker |
| Teen · where your money works | The permission grid — the ladder as a place |
| Teen · goals | Two or three tiles; naturally compartmentalised |

**Where Bento must not apply** — the job is *one decision*:

| Screen | Why not |
|---|---|
| Teen · your week | One hero number. A grid here contradicts the core principle and makes the answer harder to find |
| Teen · refusal sheet | Sequential, not simultaneous: the arithmetic, *then* the routes. Order carries meaning; tiles would scatter it |
| Guardian · a request | One tap, one decision, 30 seconds |

**Bento principles, as this product uses them:**

1. **One compartment, one decision or one fact.** Never a decorative tile.
2. **Separation by subtle border or surface, not by heavy shadow.** The product should feel like paper, not like a dashboard.
3. **Responsive collapse is a re-flow of priority, not a squeeze.** At 390 the grid becomes a single ordered column, most-important-first.
4. **No compartment may be a promotion.** See §7.
5. **A chart is a guardian instrument, not a teen one.** Charts exist to compare periods and categories, which is a guardian's job when reviewing a month. The teenager is owed an answer, not a dataset, so no chart appears on any surface they can see. Charts are permitted in the guardian's record and monthly review only, and they obey the same colour semantics as everything else — refusal amber, never red.

## 6. Components

| Component | Variants | Note |
|---|---|---|
| **Card** | fact · rule · merchant · evidence | One subject per card; the Bento compartment |
| **State chip** | allowed · needs approval · refused · locked | Colour **and** icon **and** label, always all three |
| **Button** | primary · secondary · ghost · destructive-quiet | No destructive red. "Remove" is quiet and confirmed, not alarming |
| **Sheet** | refusal · confirmation · approval | Bottom sheet on teen (swipe to dismiss); modal on guardian |
| **Form row** | label-above (390) · label-inline (1280) | Per `UX-PLAN.md` §5 |
| **Progress** | budget bar · goal progress | One bar per screen maximum. No charts |
| **Number** | hero · inline · delta | Tabular. Never animates |
| **Nav** | teen tabs (4) · guardian sidebar/bar (4) | Fixed; never a fifth destination |
| **Empty state** | quiet · waiting · ended | "Nothing needs you today" is a designed state |

## 7. Accessibility (WCAG 2.1 AA floor)

Carrying and extending `UX-PLAN.md` §8:

- **Contrast ≥ 4.5:1** for body text, ≥ 3:1 for large text and UI borders. The amber refusal colour exists to pass against `--t-warn-soft`, not for aesthetics.
- **Never colour alone.** Every state carries an icon and a label.
- **Targets ≥ 44×44px**, primary actions in the bottom third on phones.
- **Survives 130% text scaling.** Verify at `font-size: 130%` on every teen screen — this is where the 60px hero number is most likely to break.
- **`prefers-reduced-motion` collapses** level-up and sheet motion to opacity (`UX-PLAN.md` §7).
- **Semantic HTML, real focus rings, full keyboard traversal** on guardian desktop surfaces.
- **Screen-reader order matches visual order** — a Bento grid makes it easy to get this wrong, so the DOM order is the priority order and CSS Grid does the placing.

## 8. Household sensitivity

The source system's cultural sensitivity, translated. Tether is used by *families*, and families differ in ways the interface must not presume:

| Dimension | Rule |
|---|---|
| **Structure** | Never presume two parents, or one. The PRD's own persona has shared custody. Say **"your adult"**, **"whoever set your rules"** — the guardian's name is the default, and there may be more than one |
| **Authority** | The guardian is not always a parent. Guardian, carer, older sibling, grandparent — the model is "whoever holds the account of record", and the copy should follow the model |
| **Language** | Every refusal must survive translation without losing its arithmetic. Numbers and periods are locale-formatted (currency, `$1,500` vs `1.500 $`, week start day), and the explanation model must be given the locale rather than assuming it |
| **Money culture** | No moralising. Spending is not virtue or vice, and a refusal is a rule outcome, not a character judgement. This is also why savings are never framed as "good behaviour" |
| **Household income** | Never compare a family to a norm, offer a benchmark, or suggest an amount. A parent setting $10 a week should not be told what is typical |

## 9. Dark mode — token set only

`UX-PLAN.md` §12 says design it, do not build it in the hackathon window. The mapping, so it exists:

| Light | Dark | Note |
|---|---|---|
| `--t-canvas #F6F5FB` | `#12111A` | |
| `--t-surface #FFFFFF` | `#1C1A26` | |
| `--ink #14121F` | `#F2F1F7` | |
| `--ink-2 #4B4A5A` | `#B9B6C7` | |
| `--ink-3 #8A8899` | `#807D91` | |
| `--line #E6E4EF` | `#2A2836` | |
| `--t-accent #5B4BFF` | `#8B80FF` | Lightened for contrast |
| `--t-warn-deep #9A5B00` | `#FFB020` | Refusal text must **lighten**, not darken |
| `--t-warn-soft #FFF4E6` | `#2A2118` | |

The one non-obvious rule: **the refusal colour must invert in the opposite direction to everything else.** On light it is darker than its container; on dark it must be lighter. Getting this backwards is the most common dark-mode failure for semantic colours.

## 10. v0.dev prompt pack

Six prompts for generating Tether mockups. **Every prompt must carry the constraints block** — without it, a generator will produce generic fintech, and specifically it will produce red errors and promotional tiles, both of which are wrong here.

**Constraints block (append to every prompt):**

> Layout is Bento-style: a grid of distinct card compartments, each separated by a subtle 1px border rather than a heavy shadow. Use Inter for all text except the signed-clause block, which uses Georgia. Money is set with tabular figures and never animates. Colour is state, never decoration: allowed `#12B76A`, needs-approval `#F79009` on `#FFF4E6`, refused `#9A5B00` on `#FFF4E6`, locked muted `#8A8899`. **There is no red anywhere in this product** — a refusal is amber, and a locked item is muted, not alarming. Every state carries an icon and a text label as well as colour. **No tile may be a promotion, an advert, a recommendation, or a price.** No charts, no badges, no streaks, no gamification. Body text is at least 16px. Respect `prefers-reduced-motion`.

1. **Teen · Your week** — *single column, not a grid*
   > A 390px-wide mobile screen for a 15-year-old's allowance app. **Single column, centred, max-width 460px — deliberately not a grid.** The hero is one enormous number: "$25.00" at 60px weight 800 in tabular figures, with the label "left this week" beneath it. Below, one simple progress bar showing the week's budget. Then two quiet rows: "Saved toward Headphones · $18 of $60" and a single full-width primary button, "Ask for something", in `#5B4BFF` with a warm gold `#FFB020` accent. One small state chip in the top area reading "Within your rules" in `#12B76A` with a check icon. Calm off-white background `#F6F5FB`, white cards, generous vertical rhythm. Nothing else on the screen.

2. **Teen · Where your money works** — *the permission grid*
   > A 390px mobile screen showing a grid of merchant cards in a Bento layout, two columns, each card a distinct compartment with a subtle 1px border. Each card shows a merchant name, a category label such as "Books" or "Groceries", and a state chip. Three states appear: **open** — a green check chip `#12B76A` reading "Open"; **needs approval** — an amber clock chip `#F79009` on `#FFF4E6` reading "Ask first"; **locked** — a muted `#8A8899` padlock chip reading "Opens at Level 2". Locked cards use a muted border and muted text — quiet, not alarming. A short header reads "Where your money works" with the subline "Your rules open more as you earn more". **No prices, no promotions, no ratings, no recommendations, no adverts.** Inter throughout, tabular figures.

3. **Teen · Refusal sheet** — *sequential, not Bento*
   > A bottom sheet over a dimmed phone screen, 390px wide, rounded 14px top corners. **The content is sequential, not a grid.** First a heading "Not this time" with an amber stop-hand icon in `#9A5B00`. Then a compartment showing the arithmetic plainly: "$15.00 hoodie" and, beneath it, "You have $8.00 left of your $20.00 this week" — money in tabular figures. Then two clearly separated route-forward cards, each a full-width tappable compartment with a title and one line of body: "Save for it" and "Ask Amara". At the bottom, small muted text: "You keep 100% of what you save." Amber `#9A5B00` on `#FFF4E6`. **No red, no error styling, no shaming language.** A "Why?" link is visible.

4. **Guardian · The grant editor** — *desktop two-column*
   > A 1280px desktop screen, guardian surface, two-column layout with a left sidebar navigation in deep teal `#0B6B5B`. Left column: a Bento grid of rule compartments — "Weekly amount", "Where Zoe can shop", "Online purchases", "Ends on" — each a distinct white card with a subtle border and an inline label/value row. Right column: a live preview panel showing exactly what the teenager will read, styled as a document including one paragraph set in Georgia serif representing the signed clause, with an `#E8F2EF` soft teal container. At the bottom of the right column, a single primary button "Sign these rules" in `#0B6B5B`. Neutral grey background `#F4F5F7`. Documentary and calm, not dashboard-like. No charts.

5. **Guardian · A request** — *one decision*
   > A 390px mobile screen for the guardian, one decision only. Top: a small header card with the teenager's name and avatar. Centre: one white card containing the request — a product name, "$15.00", and the merchant — with **the budget consequence shown first and most prominently**: "This leaves $5.00 for the rest of the week" in secondary ink. Below, two large full-width buttons, 44px minimum height: "Approve" in deep teal `#0B6B5B` and "Not this time" as a quiet outlined secondary. A small note at the bottom reads "You'll only hear from me when it matters." Calm, glanceable, one decision, no grid.

6. **Guardian · The record** — *desktop dashboard grid*
   > A 1280px desktop dashboard in a Bento layout: a grid of distinct white cards with subtle 1px borders on a `#F4F5F7` background. A wide summary card across the top with the month's totals in tabular figures. Below, a two-thirds card holding a table of payments, each row showing date, merchant, amount in tabular figures, and a state chip. Beside it, a narrower card with "Proof of every decision" describing the evidence packet, and a smaller card showing the authority level and its evidence. One row expands to reveal the evidence packet details. **No charts, no graphs.** Documentary, teal accents `#0B6B5B`, Inter throughout, generous spacing.

## 11. What we will not build

Carried from `UX-PLAN.md` §12, now expressed as design rules:

No chat interface. No charts or graphs — one bar per screen at most. No badges, streaks or points: the levels are *evidence*, and gamifying them would undermine the thesis. No promotional compartment, ever. No red state. No dark mode in the hackathon window (designed in §9, not built). No desktop teen view. No settings screen a teenager can wander into. No animated money.