# Rehearsal: the landing page's two stories

Built with the stageshow skill and rehearsed in its preview (`examples/tether-shop`, `examples/tether-invest`), then moved here. `ShopStory.tsx` and `InvestStory.tsx` are the preview files with their imports rewritten for Next; keep the two in step.

## Shopping loop (`ShopStory.tsx`, top of How it works)

Gold: `device-pair` (a hero device pinned top, a second device straddling its right edge, lower and in front, the crop through the bottom). Kept: the straddle, one gutter on top, the hero shadow, the bottom bleed. Changed: two phones instead of a window and a phone, both in the app's own looks (teen indigo, guardian teal), the story moving between them. Borrowed: `phone-touch` (touch cursor, card-to-screen thinking, the in-app reset), `ai-cards` (an agent's options as cards with their own actions), the kit's `Expand` with `face` for the notification opening the app.

Beats: Zoe types "headphones under $30" and taps Find options ("Looking in your shops…") → three cards land below the forms; a flick brings them up (Over budget, Fits your week, Needs Amara's OK) → Why not? on the $25.30 Best Buy card opens the amber sheet with her numbers and two ways forward → Ask Amara: the sheet goes, her week page says "Sent." → Amara's lock screen gets the push → she opens it: budget consequence first → Approve $25.30, Working… → payoff holds: "Approved and paid — $25.30 at Best Buy" and the proof (PayPal ID, Rules v3, single-use permission slip, Matches PayPal). Reset: Amara's phone locks; Zoe's page gives way to a fresh Shop. Loop 17.3s wide, 17.7s compact (measured from the films).

Poster (reduced motion, thumbnails): the payoff on both phones; compact shows Amara's.

## Investing loop (`InvestStory.tsx`, the investing feature in the tour)

Gold: the shopping loop above (same pair, same look, on the teen band's color). Beats: VTI's page (One share costs $361.86, What's inside) → a flick to her three written answers → she types 5: "= about 0.0138 of one VTI share at $361.86." → Propose to Amara, Sending…, "Sent. Amara will see your answers and decide." → Amara's push → the request with her answer → Approve $5.00, Working… → payoff: Amara's "Bought." and Zoe's Invest page with her VTI card: You own 0.0138 share, too soon to tell. Loop 14.6s wide, 16.1s compact (the compact pans between the phones). Poster: that payoff on both phones; compact shows Zoe's card.

## Captured

- Widths: wide (1100 and 1000 viewports), 390 (compact designs, 358 stages), and in the real page at 1440 and 390.
- Looks: the app's light looks only (the landing page has no dark mode).
- States: `--states` sheets for both. Close beats: the investing flick at 80ms; the shopping launch and payoff from the frame-exact 30fps film, every third frame; the ask (finger lifting off) as a 3x still. The typing, Approve press and the reset were watched only at 1s intervals and in the films.
- Reduced motion: posters filmed with `--reduced`; the landing e2e checks both payoffs render under reduced motion.

## Gate

Last `film.mjs --gate` lines in the preview, on 22-frame loops at each width and on `--states`:

- shopping wide, 390 and states: `rehearsal passed`
- investing wide, 390 and states: `rehearsal passed`

In the real page the gate also prints 6 `kit override:` lines. They point at the kit's own `phone.css` rules: the check tells kit CSS from a demo's CSS by a `/kit/` file path, and Next bundles that CSS into a chunk without one. The same code passes in the preview, where the path is visible. No other line fails in the page.

## Film lines, and what was done

- `framing: off center` (two phones side by side, each judged alone) → Amara's phone now straddles Zoe's right edge, a step lower, covering only bezel and margin.
- `tight control` (button 6.4 to 7.1px under a field or chip at 0.79 scale) → form and card gaps 11pt.
- `uneven padding` (browser paragraph margins inside the stage) → paragraph margins reset in the stage.
- `empty pane`-like voids under the payoff and week screens → the real pages' next content (Find something, Search the whole market, her record as filler rows).
- `loose list` (filler records as separate cards) → one card of rows divided by hairlines, as the record is.
- `framing: real words cut by the crop` while scrolling in compact → the scroll is a flick: the finger travels a third and lifts, the page is thrown on with a CSS deceleration.
- `selection drift` (a drag that started over a field read as a text selection) → the flick starts on the screen's margin.
- Not fixed, judged to stand: `small text: "now" at 8.9 to 9.1px` in compact (the iOS notification stays at true size; the kit forbids enlarging it); `near aligned` labels vs field text (the app's own 14px input inset); `half-pixel glyph` on chip icons inside a 0.79-scaled phone.

## Review (done by the builder, the brief's fallback)

- The payoff's heaviest mark is Zoe's $13.02, not Amara's approval. Stands: it is the week page's one number by design, and it gives the approval its context; the eye reads left to right, ask then answer.
- After Ask Amara the finger rested over Find something, holding it pressed → the finger now lifts toward Amara's phone.
- The lock at the reset read as a double exposure for 380ms → 240ms.
- Two equal phones are flatter than the gold's window-and-phone. Partly stands: both sides carry the story; depth comes from position, overlap and z-order.

## Assumptions

- "Over-ear headphones" is the $25.30 item, to match the headphones search; the sandbox's own $25.30 request is a Monopoly game.
- Two compressions: the ask page's optional reason form is skipped, and her three investing answers are already written.
- The other two shopping cards ($9.99 Target, $12.49 newegg.com) and the PayPal ID are illustrative sandbox values.

## Not checked

- Real touch devices and Safari; only headless Chrome.
- Live frame pacing on a slow phone (the virtual clock proves geometry, not frame rate).
- The investing story inside the real page at widths between 560 and 1080, beyond the frames filmed.
- A deployed build; only `next build` and `next dev` locally.
