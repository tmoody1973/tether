# 017 — Amara hears about Zoe's asks by push, through OneSignal

**Decision** — When Zoe asks for something, Amara's phone or browser gets one push notification ("Zoe is asking for $25.30 at Best Buy"). Tapping it opens that request. The pushes are sent through OneSignal. Email and SMS come later, through the same OneSignal account.

**Why this came up** — Tarik asked how Amara finds out about a request when she isn't on the site. She didn't: the original design promised "Amara gets one notification", but the build never had one. The product's central moment, "Zoe asks, Amara approves in one tap", depends on Amara knowing there is something to approve.

**Options**
1. **Plain web push, built in.** Tether sends pushes itself with the browser standard. Free, no new vendor. Cost: email or SMS later means a second system.
2. **OneSignal (chosen).** One service for push now and email or SMS later, with delivery stats. Cost: a third-party script on Amara's pages, and its service worker (the small background script a browser runs for a site) has to live beside Tether's own offline worker. It also isn't in Vercel's marketplace, so its keys are set up by hand.
3. **Email first, through Resend.** Works for everyone with no install. Cost: email needs a sending domain Tether doesn't own yet, and the shared demo family has no real inbox, so judges couldn't see it work.

**What we chose and why** — Option 2, push only for now. Tarik chose OneSignal because "it has email and other channels". Claude recommended against also adding Resend: two services would do overlapping jobs. Push is also the only channel a judge can watch working: turn on notifications as Amara, ask as Zoe, and their own browser buzzes.

**What we gave up** — On iPhone, a push only arrives after Amara adds Tether to her home screen (iOS 16.4 or newer). The text of every notification also passes through OneSignal. For real families, a softer default ("Zoe has a request for you") may be better than showing amounts on a lock screen. Email still needs a domain before it can ship.

**How we'll know if this was right** — OneSignal's delivery stats for the demo app show pushes as delivered (not just sent). The test: ask as Zoe on one device and see Amara's notification arrive on another within a few seconds.

**What actually happened** —
