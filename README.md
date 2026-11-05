# Tether

> A parent signs the rules. An AI agent proposes. Code decides. PayPal pays.

Tether lets a parent give a teenager real spending freedom online without handing over a card. The parent (Amara) signs a short set of weekly rules. Her teen (Zoe, 15) shops inside those rules. Every purchase is checked by plain code before a single PayPal call is made. Zoe earns more freedom by keeping her own savings promise four weeks in a row.

Built for the **PayPal AI Hackathon 2026** (Devpost). Submission deadline: **Thursday 12 November 2026, 12:00 PT**.

**Demo video:** _coming before submission_
**Live app:** _coming before submission (Vercel)_

---

## How it works

1. **Amara saves her PayPal once.** Tether stores a vault token (PayPal's way of letting a merchant charge you later without your password). Zoe never has a PayPal account; PayPal requires users to be 18+.
2. **Amara signs weekly rules.** Weekly amount, which shops, whether online purchases need her OK, how much Zoe promises to save. The signing screen reads like a contract. No AI is involved in it.
3. **Zoe asks the shopping agent** ("headphones under $30") or pastes a product link. The agent can only search the shops Amara allowed (via [Channel3](https://trychannel3.com)). It proposes 2–3 options. It cannot buy anything.
4. **Gate 1, code:** a deterministic rule engine checks the cart against the signed rules. Allowed, needs Amara's OK, or refused with one plain sentence saying which rule and what would change it.
5. **Gate 2, AI, can only tighten:** a model checks things code can't (is this item actually a book?). It can add friction; it can never remove it. *"A model may add friction. Only code may remove it."*
6. **PayPal charges Amara's saved wallet**, using a single-use permission slip (a signed token, valid 120 seconds, bound to that exact cart).
7. **Every week, what Zoe didn't spend becomes savings.** Four kept weeks in a row moves her up a level: more money, more shops, and at Level 3, investing.
8. **Investing (Level 3):** Zoe searches the whole market and proposes a fund. Tether shows facts only and recommends nothing. Amara approves each one; Tether places the order through Alpaca.
9. **Amara can ask about the month** ("How much at the bookshop in October?"). A read-only assistant answers from PayPal's transaction list and Tether's receipts. It cannot move money.

## How PayPal and AI are used

| What | How |
|---|---|
| **PayPal Vault** (save a wallet without a purchase) | Setup token → Amara approves → payment token. Charges use `payment_source.paypal.vault_id`. |
| **PayPal Orders v2** | Each approved cart is one order, charged to the vaulted wallet. Completes in one call, no separate capture. |
| **PayPal Webhooks** | Payment events reconcile Tether's ledger with PayPal. |
| **PayPal Agent Toolkit** (`@paypal/agent-toolkit`) | Read-only: only `list_transactions` is exposed, wrapped so the model sees only this family's rows (date, amount, status). |
| **Claude** (`claude-haiku-5-5` via the Vercel AI SDK) | The propose-only shopping agent, the "is it a book?" check, plain-English refusal sentences, fund descriptions, and the month assistant. Every model output is validated, with a code fallback. |
| **Channel3** | Product search scoped to the parent's allowed shops; turns a pasted link into a real cart. |
| **Alpaca Broker API** (sandbox) | Investing: account, deposit, dollar-amount orders; market search and price history. |

## The AI: two agents, three checked calls

Tether uses AI where judgement helps and keeps it away from anything that decides or moves money. Only two pieces are agents (a model that loops, calling tools); the other three are single model calls whose output is checked by code. Every one has a plain code fallback, so the app works with the model switched off.

**Who can touch money.** Every AI piece sits on the left. Nothing on the left has a path to PayPal or Alpaca except through code that checks the signed rules and a human approval.

```mermaid
flowchart LR
  subgraph AI["AI: proposes, explains, answers"]
    A1[Shopping agent]
    A2["Is it a book? check"]
    A3[Refusal sentences]
    A4[Fund descriptions]
    A5[Month assistant]
  end
  subgraph CODE["Code: decides"]
    R[Rule engine<br/>signed rules]
    AP[Amara's approvals]
    TK[Permission slip<br/>single use, 120 s]
  end
  subgraph MONEY["Money: moves"]
    PP[PayPal<br/>charge saved wallet]
    AL[Alpaca<br/>deposit and order]
  end
  A1 -- proposed carts --> R
  A2 -- can only tighten --> R
  R --> AP
  R --> TK
  AP --> TK
  TK --> PP
  TK --> AL
  A3 -. reads decisions .-> R
  A5 -. reads only .-> PP
```

```mermaid
flowchart LR
  Z[Zoe asks for something] --> A[Shopping agent<br/>proposes 2-3 carts]
  A --> G1{Gate 1: rule engine<br/>plain code}
  G1 -->|allowed| G2{Gate 2: AI check<br/>can only tighten}
  G1 -->|refused| E[Refusal sentence]
  G1 -->|needs OK| M[Amara approves<br/>one tap]
  G2 -->|still allowed| T[Single-use permission slip<br/>120 s, bound to this cart]
  G2 -->|tightened| M
  M --> T
  T --> P[PayPal charges<br/>Amara's saved wallet]
```

### 1. Shopping agent (agent) — `src/ai/agent.ts`

- **What it's for:** Zoe types "headphones under $30" or pastes a product link.
- **What it can see and do:** two tools — search the shops Amara allowed (Channel3), and look up a pasted product link. At most 6 tool calls, then it must answer.
- **What it returns:** 2–3 proposed carts, each with a reason of at most 80 characters. Each cart is run through the rule engine and labelled *fits*, *needs Amara's OK* or *over budget* before Zoe sees it.
- **What it cannot do:** buy anything, mint a permission slip, approve anything, change a rule, or touch PayPal. A test fails the build if this file imports anything that can. Product titles from shops are treated as untrusted data, never instructions. It can only propose items its own tools returned.

```mermaid
sequenceDiagram
  autonumber
  actor Zoe
  participant App as Tether server
  participant Model as Claude (shopping agent)
  participant Search as Tool: search allowed shops
  participant Lookup as Tool: look up a link
  participant C3 as Channel3
  participant Rules as Rule engine (code)
  Zoe->>App: "headphones under $30"
  App->>Model: request + allowed shop list (no rules, no money)
  loop at most 6 tool calls
    Model->>Search: query, max price
    Search->>C3: search, filtered to Amara's shops only
    C3-->>Search: products and offers
    Search-->>Model: id, title, price (titles are untrusted data)
    opt Zoe pasted a link
      Model->>Lookup: product URL
      Lookup->>C3: lookup
      Lookup-->>Model: product, or "not available from your shops"
    end
  end
  Model-->>App: 2-3 proposals (product ids + short reason)
  App->>App: drop any id the tools never returned
  App->>Rules: each proposed cart vs the signed rules
  Rules-->>App: fits / needs Amara's OK / over budget
  App-->>Zoe: cards with labels (nothing bought yet)
```

### 2. "Is it a book?" check (gate 2, single call) — `src/ai/classifier.ts`, `src/engine/gate2.ts`

- **What it's for:** rules code can't judge, like Level 2's "the bookshop, for books only" — Barnes & Noble also sells toys and games.
- **How it decides:** the model returns a probability; code turns it into an outcome using fixed thresholds.
- **What it cannot do:** loosen anything. Its outcome is combined with gate 1 so the stricter one wins. *"A model may add friction. Only code may remove it."*
- **When the model fails:** a 4-second timeout, an error or a nonsense answer all count as **refuse**, not allow.

### 3. Refusal sentences (single call) — `src/ai/explain.ts`

- **What it's for:** turning the rule engine's reasons into one kitchen-table sentence for Zoe, plus two ways forward (ask Amara, or wait).
- **Checks:** it may restate only the dollar amounts the engine gave it; it may never say a purchase is approved; it is capped at 240 characters. Anything else falls back to a fixed template.

### 4. Fund descriptions (single call) — `src/ai/fundWords.ts`

- **What it's for:** one plain sentence about what a fund is, on Zoe's investing screen.
- **Checks:** the model never sees prices and may write no numbers, no comparisons ("beat the market"), and no selling words ("great investment", "top pick"). The price lines are written by code. Anything off falls back to a template. Tether recommends nothing.

### 5. "Ask about the month" (agent) — `src/ai/monthAssistant.ts`

- **What it's for:** Amara asks things like "How much at the bookshop in October?"
- **What it can see:** two read-only tools — PayPal's transaction list (through the **PayPal Agent Toolkit**, configured with only `list_transactions`) and Tether's own receipts for the month. At most 5 steps.
- **Family-only:** every family's charges land in Tether's one PayPal account, so the PayPal tool is wrapped: the server picks the dates, keeps only rows whose payment id matches this family's receipts, and passes only date, amount and status. The model never sees other families, balances or free-text notes.
- **What it cannot do:** move money. No write tool exists in its toolset, and the toolkit can be imported only in this one file (enforced by lint). If the data isn't there it says "I can't see that."

```mermaid
sequenceDiagram
  autonumber
  actor Amara
  participant App as Tether server
  participant Model as Claude (month assistant)
  participant Rec as Tool: tether_record
  participant Tx as Tool: list_transactions (wrapper)
  participant Kit as PayPal Agent Toolkit
  participant PP as PayPal Transaction Search
  Amara->>App: "How much at the bookshop in October?"
  App->>App: check sign-in cookie, family id comes from it
  App->>Model: question + 2 read-only tools
  loop at most 5 steps
    Model->>Rec: month "2026-10"
    Rec-->>Model: this family's receipts (shop, amount, rule version, how allowed)
    Model->>Tx: month "2026-10" (no dates, no ids)
    Tx->>Kit: server-chosen start and end dates
    Kit->>PP: list transactions (read only)
    PP-->>Kit: every transaction on Tether's account
    Kit-->>Tx: raw rows
    Tx->>Tx: keep only this family's payment ids, keep date, amount, status
    Tx-->>Model: filtered rows
  end
  Model-->>App: answer
  App->>App: tools used are all on the allowed list? any rows at all?
  App-->>Amara: answer, or "I can't see that."
```

## Tech stack

| Layer | Technology |
|---|---|
| App | Next.js 16 (App Router, Cache Components), React 19, TypeScript (strict) |
| Installable | Progressive web app (planned) |
| Database | Postgres via Drizzle ORM: Neon in production, PGlite (Postgres in-process) for local dev and tests |
| AI | Vercel AI SDK 7, `@ai-sdk/anthropic`, Claude Haiku |
| Payments | PayPal REST (Vault, Orders v2, Webhooks, Transaction Search), PayPal Agent Toolkit |
| Commerce data | Channel3 SDK |
| Investing | Alpaca Broker API + Market Data (sandbox) |
| Tests | Vitest (unit, integration on PGlite), Playwright (end-to-end) |
| Hosting | Vercel (planned) |

## Status

Built and tested: the rule engine, permission slips, the AI gate, levels, the ledger, PayPal vault and charges (verified live in sandbox), Channel3 search (live), purchases and approvals, weekly close and monthly level-ups, savings release, revoke, investing (verified live in the Alpaca sandbox), market search and fund facts, the month assistant, and the first parent screens (sign-in link, home, signing the rules, connecting PayPal).

Still to build: the remaining parent screens (requests, the record, monthly review), Zoe's screens, demo data and demo clock, the installable app, and deployment.

## Sandbox stand-ins (said plainly)

| In this build | In production |
|---|---|
| Every purchase pays **one Tether sandbox business account**; the receipt records which shop it was for. A saved PayPal wallet can only be charged by the business that saved it (verified: `BILLING_AGREEMENT_NOT_FOUND`). | Tether pays shops as a PayPal platform partner, or through shops' own agent checkouts. |
| Zoe's investments sit in an **ordinary Alpaca sandbox account**, labelled on screen as a stand-in. The sandbox refuses custodial accounts. One setting (`ALPACA_CUSTODIAL_ENABLED=true`) switches to the custodial request. | A custodial account Amara manages for Zoe. |
| Savings release: Amara sends the money herself and taps "I've sent it". | Same. Tether never holds money. |
| A demo clock moves time forward so a month fits in a video. | Real time. |
| Sign-in is a private link (signed cookie). | Passkeys. |

## Quick start

### Prerequisites

- Node.js 22+ (the AI SDK requires it)
- pnpm 10 (`corepack enable`)
- Sandbox credentials: PayPal developer app, Anthropic API key, Channel3 API key, Alpaca Broker sandbox keys

### Install

```bash
git clone https://github.com/tmoody1973/tether.git
cd tether
git checkout build/hackathon
pnpm install
cp .env.example .env.local
# fill in .env.local (see below)
```

For local development, point the database at an on-disk PGlite folder. It sets itself up on first use, no server needed:

```bash
# in .env.local
DATABASE_URL=pglite:./.pglite/dev
```

Generate a signing key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Run

```bash
pnpm dev          # http://localhost:3000
pnpm test         # unit + integration tests (PGlite)
pnpm e2e          # Playwright end-to-end tests
pnpm typecheck
pnpm lint
```

A one-command demo seed (a family, shops, a month of history) is coming with the demo data step.

## Environment variables

| Variable | What it's for | Required |
|---|---|---|
| `DATABASE_URL` | Postgres URL (Neon), or `pglite:<folder>` locally | Yes |
| `TETHER_SIGNING_KEY` | Signs permission slips and the parent's sign-in cookie (64 hex chars) | Yes |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | PayPal sandbox app | Yes |
| `PAYPAL_BASE_URL` | `https://api-m.sandbox.paypal.com` | Yes |
| `PAYPAL_WEBHOOK_ID` | Verifies PayPal webhook signatures | For webhooks |
| `ANTHROPIC_API_KEY` | Claude, for the agent and AI checks | Yes |
| `CHANNEL3_API_KEY` | Product search | Yes |
| `ALPACA_BROKER_KEY` / `ALPACA_BROKER_SECRET` | Alpaca Broker sandbox (OAuth client credentials) | For investing |
| `ALPACA_BROKER_BASE_URL` | `https://broker-api.sandbox.alpaca.markets` | For investing |
| `ALPACA_DATA_BASE_URL` | `https://data.sandbox.alpaca.markets` | For investing |
| `ALPACA_CUSTODIAL_ENABLED` | `true` sends the custodial account request | No (default `false`) |
| `APP_BASE_URL` | Where PayPal returns Amara after saving her wallet | Yes |

Never commit `.env.local`. It is git-ignored.

## Project structure

```
src/
├── engine/      Pure rule engine: evaluate, decide, cart hash, permission slips, levels (no I/O, enforced by lint)
├── ai/          Shopping agent, "is it a book?" check, refusal sentences, fund words, month assistant
├── flows/       Purchase, approvals, week and month, investing: transactions under a per-family lock
├── adapters/    PayPal, Channel3, Alpaca clients
├── db/          Drizzle schema, repositories, client (Neon or PGlite)
├── ledger/      Append-only journal and savings maths
├── auth/        Parent sign-in cookie
├── clock/       Real or demo clock
├── ui/          Design tokens and components
└── app/         Next.js routes: /g (parent), /t/[token] (teen), /api
tests/           Mirrors src/; e2e/ for Playwright
drizzle/         SQL migrations
docs/            Design spec, build plan, decision records, spike results
doc/             Product docs and screen mockups
```

## Design decisions

The reasoning behind the main choices is written up in plain English in [`docs/decisions/`](docs/decisions/): why money stays with the parent, why savings is the unspent allowance, why no charts for the teen, why level-ups run on Zoe's own commitment, why the PayPal toolkit is read-only, and why money that reaches the broker never shows back in savings.

The full design is in [`docs/superpowers/specs/2026-11-05-tether-hackathon-design.md`](docs/superpowers/specs/2026-11-05-tether-hackathon-design.md).

## Team

Tarik Moody, built with Claude Code.

## License

[MIT](LICENSE)
