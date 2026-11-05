# 008 — Build stack: one TypeScript web app, engine ported from Python

**Decision** — Build Tether as a single Next.js (React web framework) app in TypeScript, hosted on Vercel, with a Neon Postgres database; port the Python rule engine to TypeScript; no real login for the demo family.

**Why this came up** — The design left the stack to the builder. The existing rule engine is in Python, the screens are web, and there are seven calendar days. Two languages means two deployments and two places for money logic to drift apart.

**Options**
1. **Next.js + TypeScript everywhere, port the engine.** Cost: about half a day to port roughly 400 lines of Python and its 35 checks.
2. **Next.js front end + the Python engine as a separate service.** Cost: two runtimes, two deployments, a network hop between the app and the only component allowed to approve money.
3. **Python web app (e.g. FastAPI with server-rendered pages).** Cost: the PayPal save-your-wallet flow and the PWA work are JavaScript-first; the design system is already written as web tokens.

**What we chose and why** — Option 1. Claude's call; Tarik left the stack to the builder. One language keeps the money path in one place and one test runner. The Python files stay in `doc/` as the reference the port is checked against. Hosting on Vercel with Neon (a hosted Postgres database) because both are already connected in Tarik's tools; tests use an in-memory Postgres (PGlite) so CI needs no database. The AI calls use Anthropic's Claude Haiku model, which is fast and cheap enough to sit on the refusal path, called through the Vercel AI SDK (a JavaScript library for calling AI models with tools) so PayPal's agent toolkit plugs in directly (see 009). The demo family has no login (design D11); the teen's link carries a random token.

**What we gave up** — The Python engine's exact code (we keep its behaviour, not its text); a real sign-in system.

**How we'll know if this was right** — Every one of the original 35 Python checks has a passing TypeScript equivalent by the end of day 2, and the hosted URL works for a judge with no setup.

**What actually happened** —
