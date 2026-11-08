# 028 — A parent with several teens adds each one, and switches between them in Settings

**Decision** — Amara can have more than one teen on Tether. Each teen is a separate family behind the scenes, with its own rules, budget, record, investing account, teen link and saved PayPal. A new Settings page lists her teens, switches between them with one tap, and has an "Add another teen" button that sends her through Log in with PayPal again. The menu grows to five items: Home, {Teen}'s rules, Investing, Activity, Settings.

**Why this came up** — A parent with two or three teens couldn't add the second one. Tether already stored "one parent, several families" (decision 026: one row per parent-and-teen pair, all sharing her PayPal id), but nothing on screen let her make the second family, and once signed in she couldn't move between teens: her sign-in cookie names one family only. The "Which teen?" page existed but in practice nobody reached it. Getting this wrong on a money app means one teen's rules or money showing up under another teen's name, or one person's browser opening someone else's family.

**Options**
1. **One family, several teens inside it (rejected).** Rework the data so a family holds many teens. Cost: every rule, budget, record, investing and payment query assumes one teen per family; days of rework four days before the deadline, with a real chance of mixing two teens' money.
2. **One family per teen, a switcher on top (chosen).** Keep the data model. Add "Add another teen" (a fresh PayPal login, then the same teen form as starting), remember who PayPal said she is in a sealed cookie (signed by the server so it can't be edited, holding only her PayPal id), and a Settings page that lists and switches. Cost: she saves her PayPal once per teen, and each teen's family is retired on its own 7-day clock.
3. **Several teens, one shared saved PayPal.** Like option 2, but copy the first teen's saved PayPal to the second. Cost: retiring one family deletes its saved PayPal at PayPal, which would silently break the sibling's payments. Rejected for that reason.

**What we chose and why** — Option 2. Tarik asked for it on 8 Nov 2026; Claude made the design calls. The details that matter:

- *"Add another teen" re-proves it's her.* The button goes to Log in with PayPal with an "add" flag. That flag is sealed into the same signed cookie that protects the login round trip (the "state", a random value that proves the browser coming back from PayPal is the one that left). The return page reads the flag only from that sealed cookie, never from the address bar, so pasting `?add=1` onto a link changes nothing.
- *Switching re-checks everything on the server.* The switch button posts the family's id; the server signs her in to it only if the PayPal she last logged in with owns both the teen she's on now and the one she picked, and both are live. Signed in through a private guardian link or the shared demo family, Settings shows only the current teen and says "Log in with PayPal to see or add your other teens."
- *The shared judge login stays per browser.* Judges all use one PayPal sandbox account (decision 026). For that login, the list Settings shows and the switch route accepts comes from the browser's own cookie: the families THIS browser made, at most the last 10, and only those that are still live and still owned by that PayPal. Never another judge's family, never a list built from the PayPal id alone. Logging back in with the shared login opens the newest family this browser made.
- *The one-per-browser-per-hour limit doesn't apply to adding a teen.* Starting a family sets a one-hour cookie that refuses a second start from the same browser. That would stop a real parent adding two teens back to back, so a teen added through "Add another teen" skips it. The site-wide cap of 30 new families a day still applies to every add; when it's used up she sees "Today's new families are used up, so no teen was added. Nothing changed." and stays signed in to the teen she was on.
- *Settings-type cards moved off Home.* The notifications card and Reset demo moved from Home to Settings, and the teen's link (send and reset) moved there from the rules page, where it had gone only because there was no Settings page. Home keeps the first-run checklist, which still links to the send-link page, and its demo clock.
- *The fix that came with it.* Links styled as filled buttons (Home's "Save your PayPal" step among them) showed dark text on green because a general link rule outranked the button style. One CSS rule fixes all of them.

**What we gave up**
- She saves her PayPal once per teen. One PayPal approval per teen is a minute each, but it is repetition a real product would remove.
- The hourly per-browser limit is weaker: anyone can now make several families an hour by going through "Add another teen". The daily site cap of 30 is the limit that actually holds; the hourly cookie was always easy to clear.
- On the shared judge login, a teen added in one browser can't be reached from another browser, and the list remembers only the last 10 families per browser.
- Settings knows she logged in with PayPal only for 7 days after her last PayPal login (the life of the remembered-PayPal cookie). After that, Settings shows one teen until she logs in with PayPal again.
- The teen's link no longer appears on the rules page; a parent used to it there has to find it in Settings.

**How we'll know if this was right** — On the deployed sandbox: a parent who logs in with PayPal, makes a family, adds a second teen straight away, and switches back and forth sees each teen's own name on that teen's rules page, with no teen's rules, money or link ever shown under the other's name. Two judges on the shared login in two browsers each see only their own teens in Settings. The usage_pool table never shows more than 30 family starts in a day.

**What actually happened** —
