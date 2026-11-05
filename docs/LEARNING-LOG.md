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
