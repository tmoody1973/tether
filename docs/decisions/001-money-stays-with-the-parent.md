# 001 — The money stays in the parent's PayPal; no allowance payout to the teen

**Decision** — The weekly allowance is a number Tether tracks, not money sent to the teen; every purchase is charged to the parent's saved PayPal only after the rule engine approves it.

**Why this came up** — The original plan paid the allowance into the teen's Venmo every week. Checking PayPal's documentation showed that this would fail for a real 15-year-old, and that once money sits in the teen's Venmo, Tether's rules no longer apply to it. Getting this wrong would mean a demo that works in the test environment and a product that breaks on day one.

**Options**
1. **Pay the allowance to the teen's Venmo weekly (original plan).** Cost: PayPal refuses payouts to youth accounts (error code 14767, "the recipient has a youth account"); payouts come out of Tether's own PayPal balance, so Tether would have to collect and hold the parent's money first, which brings money-transmitter rules (laws for companies that hold and move other people's money) into play; and the teen could spend it on her Venmo card where no Tether rule applies.
2. **Keep the money in the parent's PayPal and charge it per approved purchase.** Cost: the teen never holds cash through Tether, so in-person spending isn't covered (see 002); and "savings" is a promise the parent's balance has to honour later.
3. **Pay the allowance to the parent's own Venmo.** Cost: pointless — it's the parent's money moving to the parent.

**What we chose and why** — Option 2. Joint call: Tarik brought the ledger-based plan; Claude supplied the PayPal evidence. It is the only option where every dollar passes the rule engine and Tether never holds funds.

**What we gave up** — The simple "here's your allowance" moment, and any in-person spending through Tether. The "Money waiting" screen is dropped.

**How we'll know if this was right** — In the sandbox, a full week of purchases runs through the vault charge with no payout call anywhere in the code, and a judge asking "where is the money?" gets a one-sentence answer.

**What actually happened** —
