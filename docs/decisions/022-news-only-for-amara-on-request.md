# 022 — News appears only for Amara, through her assistant, when she asks

**Decision** — Headlines about the market, or about a company inside one of Zoe's funds, appear in one place only: under an answer from Amara's "Ask about Zoe's month" assistant, when she asks for them. Zoe's screens never show news.

**Why this came up** — Financial Datasets (decision 021), the data service Tether already uses for what's inside a fund, also serves news. The investing mockups of 7 November 2026 raised the question of where, if anywhere, headlines belong. What was at stake is the promise Tether makes to Zoe (D16): facts that hold for years, no daily moves, no picks. A headline is the opposite of that, a reason to react today. The real data made the point. These are the three Apple headlines Financial Datasets returned on 7 November 2026, word for word:

- "If I Could Buy and Hold Only 1 Artificial Intelligence (AI) Stock Through a Democratic Congress, It Would Be This One - Yahoo Finance"
- "EXCLUSIVE: Apple's autocomplete restrictions include 'Dictator Trump' and 'Sleepy Joe,' researcher finds - Reuters"
- "Democrats prepare corporate probe wave targeting Apple, Meta, Musk cos.: report (AAPL:NASDAQ) - Seeking Alpha"

One is a stock pick, two are politics. And for VTI, the fund Zoe actually holds, the answer was a 404 (not found): "No news found for VTI". A fund has no news of its own.

**Options**
1. **News on Zoe's company pages.** Each company inside her fund would show its latest headlines. Cost: headlines like the three above, on a 15-year-old's investing screen, next to a fund she is meant to hold for years. Stock picks and political fights are exactly the "do something now" signal D16 keeps off her screens. Her own fund would show nothing, since funds have no news. And every page view could spend a paid call.
2. **Amara's assistant only, when she asks (chosen).** A read-only `news` tool: market news with no ticker, or one company's news, but only for a company inside one of Zoe's funds. Cost: Zoe never sees news at all. The tool has to be scoped so a visitor can't spend credits on any ticker they type. And each question can spend a paid call (cached for an hour per family, capped at 40 Financial Datasets calls a family a day).
3. **No news anywhere.** Cost: nothing to build, but Amara can't ask "Is something going on with Apple?" when she sees a headline elsewhere and wonders about Zoe's fund.

**What we chose and why** — Option 2, Tarik's call on 7 November 2026, after seeing the mockups. Amara is the adult who decides on every investment, and she may reasonably want to know what's in the news. Zoe gets the facts that hold for years. The assistant's prompt adds: "Facts only: never advise, predict, rank or say what she or Zoe should do. For news, say what the headlines are about; don't explain why a price moved beyond what the headlines say." Asking for one of Zoe's funds gets the answer "Funds don't have their own news; ask about one of the companies inside it" without a paid call. The headlines card shows title, source and date only, and draws a link only when it is an ordinary `http` or `https` web address.

**What we gave up** — Zoe doesn't learn to read financial news through Tether. Headlines are other people's words: Tether passes on titles as written, sensational or not, and doesn't filter them. "Don't explain why a price moved" is a rule in the model's instructions, not something code can enforce. The model could still overreach in its sentence, though the card under it shows only the headlines. For a company, the check that it is inside one of Zoe's funds reads that fund's top holdings, which can take one Financial Datasets call when it isn't cached yet that week.

**How we'll know if this was right** — On the live demo: "What's the news on Apple?" comes back with up to five headlines, each with a source and date, and a sentence that describes them without advice; "Any news about VTI?" says funds don't have their own news; and no headline appears anywhere on Zoe's screens. If, during testing, Amara never asks for news, option 3 was enough and the tool can go.

**What actually happened** —
