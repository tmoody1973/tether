# 015 — Amara chooses Zoe's shops; levels only set the starting list

**Decision** — Zoe's shops are her level's default shops, plus any Amara added, minus any Amara removed. Amara's choices are saved per family, so they survive re-signing, a level change and a level-up. A shop Tether's catalogue doesn't know gets no level at all: it is in Zoe's rules only while Amara's "added" choice is there.

**Why this came up** — Until now a level decided Zoe's shops completely. Tarik decided that a parent should be able to open any shop at any level (Nike at Level 2) and take any shop away (Target), with one confirm, applied right away. The risk was a removed shop coming back without Amara noticing. Re-signing rebuilds the rules from the level, and so does a level-up. If either of those quietly brought Target back, Zoe could be charged at a shop her mother had closed.

**Options**
1. **Edit the rules in force only.** Adding or removing changes the current version and nothing else. Cost: the next signing or level-up rebuilds from the level and undoes her choice, which is exactly the silent failure above.
2. **Store her choices beside the rules (chosen).** A small table, `shop_choices`, keeps one row per family and shop: added or removed. Every place that builds rules from a level applies those rows on top. Cost: one more input into how rules are built, which every future way of building rules has to remember.
3. **Make shops a list Amara owns outright, with no level defaults.** Cost: a level-up would no longer open new shops by itself, and Tarik ruled that it should.

**What we chose and why** — Option 2. Tarik made the product call (levels are defaults, not gates; changes apply after one confirm; choices stick). Claude chose the storage and one detail. A shop outside the catalogue (Lego, Etsy) is saved with a "no level" marker, so it is in Zoe's rules only because of Amara's choice. Without the marker, such a shop would count as a level default. The demo reset clears the choices, and that shop would still come back at the next signing.

**What we gave up** — Two edge cases. First, a bookshop Amara opens early at Level 1 has no "books only" check, because Level 1 rules carry no such check. From Level 2 up, a bookshop she adds does join the check. Second, a shop Zoe suggests is saved under its web address (etsy.com), not its display name, because the request only records the address.

**How we'll know if this was right** — The automated test `a removed default stays removed after re-signing, a level change and a level-up` fails if any of those paths brings a removed shop back. The test `a purchase ask waiting at a removed shop is refused when Amara approves it` proves that a removed shop can't be charged, even for a purchase that was already waiting for approval when the shop was removed.

**What actually happened** —
