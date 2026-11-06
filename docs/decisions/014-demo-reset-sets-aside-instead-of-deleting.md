# 014 — Reset demo sets judges' activity aside instead of deleting it

**Decision** — The "Reset demo" button puts the shared demo family back to how it was set up (Level 2, four kept weeks, the same requests waiting, the demo clock back to Monday 28 December) without deleting any money records. Purchases judges made since setup stay in the record with their PayPal receipts; they just stop counting toward Zoe's week, budget and savings.

**Why this came up** — Judges all use one demo family (decision D11 in the design doc). After one judge approves a purchase, jumps the clock to month end and promotes Zoe, the next judge should still see the starting state, or the level-up moment can't be shown again. But Tether's journal (the append-only list of every money movement) refuses edits and deletions on purpose, and every seeded purchase is a real sandbox PayPal charge. Deleting rows that match real charges would make the record lie about what PayPal did.

**Options**
1. **Delete everything written after setup**, switching off the journal's no-delete guard during the reset. Cost: the record would no longer match PayPal, and a guard that can be switched off is weaker for everyone.
2. **Re-run the seed on every reset.** Cost: about 13 new sandbox charges per reset, a minute of waiting, and a record that keeps growing.
3. **Mark a "set aside" window.** The family remembers when setup finished and when the last reset happened; journal rows written in between still show in the record but count in no total. Non-money state written since setup (open requests, weeks closed, level changes, releases) is cleared, and the setup rules are signed again as a new version. Cost: one more rule inside the money arithmetic (a row written in that window doesn't count), which every total has to respect.

**What we chose and why** — Option 3, Claude's call within Tarik's ruling R43 ("never delete rows that match real PayPal charges"). Nothing that matches a real charge disappears, and the reset costs no new charges. The setup week is also chosen so the month ends mid-week (1 January 2027 is a Friday), so "Advance to end of month" always reviews exactly the four seeded weeks, whatever a judge did this week.

**What we gave up** — The record shows charges that no longer count toward Zoe's totals, and a reader has to be told why (the reset message says so). A charge that was still waiting on PayPal when a reset happened, and later fails, writes its "nothing spent" row after the window closes, so Zoe's week could briefly show slightly more room than it should. A Revoke that deleted Amara's saved PayPal can't be undone by a reset at all: re-saving needs Amara to approve it at PayPal, so the page says so and points to the sandbox login.

**How we'll know if this was right** — After any sequence of judge actions and a reset, Amara's home shows Level 2, $16.98 of $30.00 spent this week, the $25.30 Best Buy ask and the etsy.com suggestion, and "Advance to end of month" promotes Zoe to Level 3 again. The automated test `reset restores level 2, pending approvals cleared, teen token unchanged` checks this, and it fails if the set-aside rule is removed.

**What actually happened** —
