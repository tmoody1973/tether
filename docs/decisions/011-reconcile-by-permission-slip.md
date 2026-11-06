# 011 — Amara's record is checked against PayPal by matching each charge to its permission slip

**Decision** — When Tether compares Amara's record with PayPal's own list of charges, a PayPal charge counts as her family's only if it carries the id of one of her family's permission slips (the single-use authorisation Tether makes for every purchase). Every other row on PayPal's list is ignored and never shown.

**Why this came up** — All families' purchases are charged through one Tether business account, so PayPal's list (Transaction Search, PayPal's searchable history of an account's charges) holds everyone's payments, plus Tether's own balance rows. The record has to catch two problems: PayPal took money and Tether has no receipt for it (for example, Tether crashed between charging and writing the receipt), or Tether has a receipt PayPal doesn't confirm or later refunded. Matching on the receipt's payment id alone can't catch the first problem, because in that case there is no receipt to match. Getting it wrong either hides a real charge from Amara or shows her another family's payments.

**Options**
1. **Match on PayPal's payment id only.** Already used by the month assistant. Cost: blind to a charge with no receipt, which is the most important thing to catch.
2. **Match on the permission-slip id, which Tether writes into every PayPal order (`custom_id`) and now stores against each purchase when the slip is used.** Cost: one new column and a migration; a charge made without a slip id would be invisible (Tether never makes one).
3. **Give each family its own PayPal business account.** Cost: not possible in the hackathon, and PayPal limits business accounts per person.

**What we chose and why** — Option 2 (the controller's ruling R35, built by Claude). The slip id is recorded *before* PayPal is called, so even a charge whose receipt was never written can be traced back to exactly one family's purchase.

**What we gave up** — Two smaller things. (a) PayPal's list can lag a few hours, so a brand-new receipt may briefly show "Receipt not confirmed by PayPal"; the page says so next to the flag. (b) The end-to-end tests use a small stand-in PayPal server on the test machine, so the app now accepts a `localhost` PayPal address outside production. Production still accepts only PayPal's sandbox.

**How we'll know if this was right** — In the demo, a purchase charged with its receipt deleted by hand appears as "PayPal charged, Tether has no receipt", and no other family's charges or Tether's balance rows ever appear on Amara's record. Before Task 20, confirm live that PayPal's `transaction_id` equals the capture id Tether stores.

**What actually happened** —
