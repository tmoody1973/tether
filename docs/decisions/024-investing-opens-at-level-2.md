# 024 — Investing opens at Level 2, with the same rules as before

**Decision** — Zoe can search the market, read a fund page and propose an investment from Level 2, not Level 3. Nothing about investing itself changes: the same facts-only fund page, the same fund list, Amara approves each one. Level 3 keeps its other gains: $50 a week, clothing and sneaker shops, and no approval threshold.

**Why this came up** — Investing was behind Level 3, which takes four kept savings weeks to reach, then four more. Judges and families reach Level 2 quickly, and Level 3 only after a month of play. Investing is the part of Tether that sits furthest from PayPal and closest to the AI work, so hiding it behind a month of play meant most people would never see it. Tarik's call, 2026-11-07: "Stock investing should be an option at Level 2 as well."

**Options**
1. **Keep it at Level 3.** Cost: the demo only shows investing after "Advance to end of month" in Demo controls, and a real family waits a month for the feature that most sets Tether apart.
2. **Open it at Level 2, same rules (chosen).** Cost: Level 3 loses its headline reward, and a Level 2 teen can propose investing while still needing Amara's OK on purchases over $20.
3. **Funds only at Level 2, single companies at Level 3.** A fund is a basket of many companies; a single company is one bet. Cost: two rule sets to build, explain and test, and Level 2 would still need a gate for companies. The whole-market search would split in two.

**What we chose and why** — Option 2, Tarik's call. One rule is easier to explain, to a parent and to a judge: investing needs Level 2 and Amara's approval. The code reads one flag on the level table (`investing`) everywhere, so every "opens at Level N" line now comes from the table and can't drift out of step with it.

**What we gave up** — Level 3's headline reward is now money and shops, not investing. A Level 2 family sees investing before the savings habit has run for a month, so the "earn it" story is weaker. Nothing is lost money-wise: each investment still needs Amara's approval, and the savings limits are unchanged.

**How we'll know if this was right** — In the demo, a visitor goes Zoe → Invest → VTI → propose without touching Demo controls. The local end-to-end test does exactly this for a Level 2 teen and Amara approves. The demo family starts at Level 2 with VTI already on its fund list, so a reset is enough to show it.

**What actually happened** —
