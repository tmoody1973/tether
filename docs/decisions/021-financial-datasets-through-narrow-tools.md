# 021 — Financial Datasets for what Alpaca lacks, through our own narrow calls, not its MCP server

**Decision** — Tether uses Financial Datasets, a paid market-data service, only for what Alpaca (the broker) can't give us: what's inside a fund (its biggest holdings, from its filings with the SEC, the US markets regulator), and later news for Amara. Tether calls it through two small functions of its own: one that lists which funds it covers, and one that fetches a fund's top ten holdings. Each is cached (kept for a while so the same question isn't paid for twice) and the paid one is capped (at most 40 paid calls per family per day). We don't connect its MCP server (a ready-made bundle of tools an AI can call directly).

**Why this came up** — Zoe was proposing to buy VTI without being able to see what VTI is: a fund that owns a slice of over 3,500 companies, the biggest being NVIDIA, Apple and Alphabet. Alpaca has prices but no holdings. Financial Datasets has holdings for 997 funds (VTI, SPY, VOO and QQQ checked). Its credits are real money (1,000 on the plan, about 7 used so far), and the demo is public, so anything that lets a stranger spend them unchecked is a real cost.

**Options**
1. **Its MCP server.** Plug the ready-made tool bundle into Tether. Cost: over 20 tools, any ticker, some calls cost 8 credits, and nowhere to put a per-family cap or a cache in between, so a public demo could drain the credits.
2. **Our own narrow calls (chosen).** About 90 lines of code: the free "which funds do you cover" list (kept for a day), and one paid "top ten holdings" call (kept for a week per fund, per family), each paid call first counted against the family's daily cap. Cost: we write and maintain the code, and each new kind of question (news, say) needs another function.
3. **No holdings at all.** Keep the fund page as it was. Cost: Zoe proposes to buy something she can't see inside, and Amara approves the same blind.

**What we chose and why** — Option 2. A joint call: Tarik asked for what's inside a fund; Claude recommended doing it through our own calls rather than the MCP server. Narrow calls give us the three controls the MCP server can't: a cap counted before every paid call, a cache so a fund's filing (which changes a few times a year) is paid for once a week at most, and a failure that simply hides the card instead of breaking the page. Companies (like Apple itself) aren't funds, so they get no card and cost nothing.

**What we gave up** — Writing about 90 lines ourselves (the estimate before building was 60) instead of plugging in a ready-made server, and the flexibility of letting an AI ask Financial Datasets anything. Also: Financial Datasets' $20 plan is a personal licence that doesn't allow redistributing its data (from its pricing page). Showing its holdings on a public demo may need a different plan; Tarik should check the terms before the demo goes public.

**How we'll know if this was right** — Over the judging period, the credits used stay close to (funds viewed) × (families) per week, never near the cap, and the fund page never fails because Financial Datasets is slow or down.

**What actually happened** —
