# Tether — learning log

Dated entries. Each answers: what did we expect, what happened, what do we now believe.

## 2026-11-05 — A passing test hid a broken engine

**Expected:** `mandate_engine.py` reported 15/15 checks passing, so the rule engine was assumed ready to build on.
**What happened:** Running it with one extra case — two ordinary purchases in the same week, both well under budget — refused the second one: "grant already consumed." The engine treats the whole weekly grant as single-use. The test named "a replayed grant cannot authorise a second charge" actually used two *different* purchases, so the bug passed as correct behaviour.
**What we now believe:** A test's name is a claim, not evidence. Before building on "all tests pass," run the one scenario the product depends on most (here: several purchases in a week).

## 2026-11-05 — The test environment hid a production blocker

**Expected:** Paying the allowance into the teen's Venmo would work, because PayPal's sandbox (its fake-money test environment) has a test value that returns success for Venmo payouts.
**What happened:** PayPal's own error table lists code 14767, "Unable to send Payouts because the recipient has a youth account." The sandbox only shows that error if you ask for it. Payouts also come from the sender's own balance, which would have made Tether hold the family's money.
**What we now believe:** A sandbox success shows that an API *call* works, not that the real-world *flow* works. For every money movement, check the production error list and ask "whose balance does this come out of?"

## 2026-11-05 — A cited source said something narrower than the claim

**Expected:** Our partners research said Alpaca's Broker API "does not support paper trading at all," citing an Alpaca forum post, so investing looked impossible to demo.
**What happened:** The forum post was about giving *end users* paper accounts. Alpaca's own setup page says the Broker API sandbox is free, self-serve, and "all trades … are simulated" with the paper-trading engine.
**What we now believe:** Check that a citation actually says what the sentence claims, especially when it's the reason something gets ruled out. (We still left investing out, for other reasons — see decision 006.)

## 2026-11-05 — "Retry safely" has an expiry date

**Expected:** Sending each PayPal charge with a request ID (an idempotency key: a label that makes a repeated request return the original result instead of charging again) would make retries safe forever, so Tether could keep re-asking PayPal about a charge it wasn't sure of.
**What happened:** A reviewer flagged it from memory and PayPal's own migration guide confirmed it: in the current Orders API, PayPal remembers a request ID for only 6 hours by default. After that, the same request silently becomes a brand-new charge, with no error to warn you.
**What we now believe:** Every safety mechanism has limits; read the fine print on the one you lean on most. Tether now re-sends only within 5 real hours, and after that only *looks up* what happened, never charges again.

## 2026-11-05 — The live site found what 400 local tests didn't

**Expected:** With 400+ tests passing locally and in CI, the first deploy would just work.
**What happened:** The live tests found two problems in an hour. Vercel had registered the project as a generic site rather than a Next.js app, so every page returned 404. And a 5-second "don't spam the shopping agent" rule refused a judge's very first search, because the demo's own reset creates a fresh purchase row that the rule mistook for a recent search. Neither could happen on a laptop.
**What we now believe:** Tests on your own machine prove the code; only a test against the real deployment proves the product. Run the live suite after every deploy, and treat "the demo resets itself" as a user of the system like any other.

## 2026-11-06 — A negative number isn't a refund

**Expected:** If PayPal's transaction list shows a negative row that points back at one of our payments, that payment was refunded. Tether's "checked against PayPal" panel was built on that rule.
**What happened:** On the live site, every single payment showed "Refunded in PayPal", yet no code in Tether can refund. PayPal's list carried an event code (a T-code: PayPal's label for what kind of money movement a row is) on every row. The negative rows were all T2002, "withdraw funds to partner account": the sandbox merchant account automatically sweeps each payment's net amount out. Of 61 rows that month, 30 were payments, 30 were sweeps and none were refunds.
**What we now believe:** A row's shape (negative, references a payment) is a guess; its label (the T-code) is the fact. When reconciling money, classify by what the provider says a row *is*, not by what it looks like. Tether now counts only reversal, refund and chargeback codes (T11xx, T12xx).

## 2026-11-07 — News for a fund was the wrong question

**Expected:** Financial Datasets would give Zoe the news for a fund she was looking at, next to what's inside it.
**What happened:** It has no news for funds: asking for VTI's news returned "No news found for VTI." For a single company it does, but Apple's three latest headlines were political stories and clickbait, nothing a 15-year-old could use to decide anything.
**What we now believe:** News belongs with the parent, on request (Amara asking her assistant), not pushed at the teen. A teen deciding on a fund needs to see what's inside it, not what happened today.

## 2026-11-07 — The "missed" request was the test suite answering itself

**Expected:** Amara had missed a request from Zoe to invest in VTI. Its page said only "This request has closed. It was already answered, or it ran out of time."
**What happened:** Nobody missed it. The live test suite runs against the shared demo family, and its own test approved the VTI ask a few seconds after pushing it. The page couldn't say which of the two had happened, so it looked like a lost request.
**What we now believe:** A closed request must say what happened to it (approved, declined, or ran out of time), because "closed" with no reason reads as a bug. And tests that write to the shared demo will be mistaken for people.
