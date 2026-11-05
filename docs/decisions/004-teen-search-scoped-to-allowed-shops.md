# 004 — The teen can search, but only inside shops the parent allowed (Channel3)

**Decision** — The teen gets product search powered by Channel3, filtered to the parent's allowed shops, with no recommendations and no affiliate links.

**Why this came up** — The original design kept the teen's side free of anything that could drive a purchase, and limited Channel3 to the parent's shop picker. Tarik asked why the teen couldn't search within the shops her parent already allowed.

**Options**
1. **Paste-a-link only.** Cost: clunky for a teen, and a thin use of Channel3, whose sponsor prize requires the API to be "a meaningful part of the product experience."
2. **Search scoped to allowed shops.** Cost: shows prices and products on the teen side, which edges toward a shop window; Channel3 also pays commissions on sales, which would contradict the "nobody can buy their way onto the list" pitch if left on.
3. **Open search across all shops.** Cost: turns Tether into a shopping app for minors — the thing the anti-persona section rules out.

**What we chose and why** — Option 2. Tarik's idea; Claude adopted it with guardrails. Channel3's search has a website filter, so results can only come from allowed shops. Each result is labelled with the rule outcome ("fits your week" / "needs approval" / "over budget"), not ratings. No "similar products" calls, no affiliate user-ID header, no clickable buy-links. The permission grid screen stays price-free.

**What we gave up** — A little of the "the teen's side never shows prices" purity; it now does, inside the Ask flow.

**How we'll know if this was right** — In testing, no search ever returns a product from a shop not on the allowed list, and no network request carries Channel3's affiliate user-ID header.

**What actually happened** —
