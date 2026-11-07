# 020 — Zoe sees how her investments are doing: one line per fund, against the whole market

**Decision** — Once Zoe owns part of a fund, her Invest screen shows one card for it: what it's worth today, how many shares she owns, and, once there's enough history, one line since she bought it next to the same money put into the whole market. It is an exception to decision 005 ("no charts on the teen's screens"), and it keeps every rule that D16 set for the one chart she already had: a fixed frame, no daily moves, no 1D/1W buttons, the same colours whether it went up or down (never red or green), and every number worked out by code, never written by an AI. Amara sees the same card on her Investing page, in her colours.

**Why this came up** — Before this, "Your investments" only listed what Zoe put in ("VTI · Bought · $5.00"). She could never see what her money became. Investing without ever looking back teaches nothing, but a chart that moves every day teaches the wrong thing (checking, reacting, selling in a dip). Getting it wrong either leaves her investing blind, or turns the app into the kind of stock ticker 005 and D16 were written to keep out.

**Options**
1. **No chart, a sentence only** ("Your $5.00 is worth $5.48. The same $5.00 in the whole market: $5.48."). Cost: the most faithful to 005, but a single number says nothing about the path, and a teen can't see at a glance whether she did better or worse than the market.
2. **One line per fund against the whole market (chosen).** The same chart form D16 already allows on the fund page, applied to her own money. Cost: it bends 005, and for weeks it has nothing to say: the line only appears after 5 market days, and under 30 days the card says plainly "Too soon to tell: funds like this are for years, not days."
3. **A full chart screen** (zoomable history, several funds on one chart, time ranges). Cost: exactly the daily-checking habit D16 dropped, more to build, and harder to keep neutral.

**What we chose and why** — Option 2. Tarik's call (2026-11-07), after seeing the mockups. One framed comparison is the only chart form with evidence of changing behaviour (the research behind D16), and comparing with the whole market (SPY, a fund that tracks the 500 biggest US companies) answers the one question that matters ("would I have done better just buying everything?") without ranking or judging. When the fund is down, the card reads back her own answer to "How would you feel if this dropped by a third?" and the fact ("It's down 5%."), and says nothing else: no "hold", no "don't worry", because that would be advice. All the numbers come from Alpaca, the broker: its own share count, its fill times and its daily closing prices, on real market dates, never the demo's moved-forward calendar.

**What we gave up** — Decision 005's purity: the teen side now has charts on two screens, not one. And for the demo itself the line can't say anything yet: her investments are days old, so judges will see the "too soon to tell" state, not the line.

**How we'll know if this was right** — In testing, a teen looking at a card with a line can say whether her fund did better or worse than the whole market without reading a number aloud. If teens instead ask for daily views or start checking the card several times a day, the frame is wrong.

**What actually happened** —
