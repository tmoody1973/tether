# Can we connect the agent to Venmo? (API + sandbox)

## Short answer

**Venmo has no public API of its own — but yes, you can reach it, through PayPal's platform.** Venmo closed its API to new developers back in 2016 ("Venmo Halts New Developer Access To Its API"). Since Braintree owns it and PayPal owns Braintree, the only ways in are PayPal's own products. There are three, and they behave very differently.

## The three routes

| Route | What it does | Sandbox reality |
|---|---|---|
| **Payouts API** — `recipient_wallet: VENMO` | Send money **to** a Venmo account | **Yes, genuinely works.** Payouts is enabled by default in the sandbox, and test value `POSPYO003` returns a 201 "FOR VENMO". Needs a **US mobile number and a `note`** (`ERRPYO013` without it). |
| **Braintree Venmo** | Accept Venmo **at checkout** | **Limited.** Shape only — see below. |
| **PayPal JS SDK v6 (Venmo)** | Checkout with Venmo, and **save Venmo** for future payments (vault) | Same limits as Braintree. |

## What the Braintree sandbox actually gives you

Their docs are unusually blunt about this, which is helpful:

> "Sandbox behavior is **limited to testing the app switch flow** that returns a payment method nonce."

Specifically:

- The app switch shows a test merchant with **Braintree's logo**, not your business.
- A successful app switch always returns a nonce for a test user called **VenmoJoe**.
- **"Purchases made in sandbox will not be reflected in the Venmo app."**
- Use the static test nonce **`fake-venmo-account-nonce`**.
- Disconnecting Venmo from a sandbox app isn't allowed (400 response).
- **Production needs an application:** "set up Venmo in your production Control Panel and complete your application… We will review your application and enable Venmo payments for your production environment upon approval."

And a Braintree engineer on their iOS SDK repo: *"To test Venmo in sandbox, you will need **production funding instruments linked in a Venmo account**. These transactions, when initiated from the Braintree SDK in sandbox, will not be charged."*

**So the checkout leg is testable in *shape*, not in *substance*** — and an app-switch flow is awkward for an automated agent anyway. Don't put it on the critical path.

## What you cannot do

- **No Venmo Teen Account in sandbox.** Sandbox models users and merchants, not families. There's no 13–17 account and no "parent approves" relationship. **The teen relationship is the one thing you simulate yourself** — which is fine, because it's your product logic, not a payment feature.
- **No P2P "send money to a friend" endpoint.** The consumer Venmo flow isn't exposed.
- **No standalone Venmo API.** Closed to new developers since 2016.

## Bonus find: a repeatable way to generate a dispute

Small but genuinely useful, given I earlier flagged that sandbox won't hand you disputes for free. With `fake-venmo-account-nonce`, **two transaction amounts create a dispute:**

| Amount | Result |
|---|---|
| `$62.00` | Under Review |
| `$62.01` | Open |

That's a documented, on-demand dispute generator. Worth knowing even if Tether doesn't use it.

## What to actually build

| Leg | Use | Why |
|---|---|---|
| **Allowance: guardian → teen** | **Payouts with `recipient_wallet: VENMO`** | Sandbox-supported, test value exists, and it's the real production path |
| **Spend: teen → merchant** | **PayPal Orders v2 + saved (vaulted) method** | Fully sandbox-supported; we verified the charge-without-payer-present flow |
| *Optional flourish: pay with Venmo* | Braintree Venmo + `fake-venmo-account-nonce` | Works but limited — keep it off the critical path |
| **The teen relationship itself** | **Your own model** | PayPal has no notion of it — and that *is* the product |

## The line for the video

> "Venmo has no public API — it closed to new developers in 2016. But we don't need one. The allowance goes out through PayPal's Payouts API straight into a Venmo account, and the teenager's spending runs on PayPal Orders with a saved method. The only thing we simulate is the family relationship — because that's our product, not a payment feature."

## Sources

- Braintree Venmo — Testing and Go Live: https://developer.paypal.com/braintree/docs/guides/venmo/testing-go-live
- Braintree Venmo overview / enablement: https://developer.paypal.com/braintree/articles/guides/payment-methods/venmo
- Braintree engineer on sandbox Venmo testing requirements: https://github.com/braintree/braintree_ios/issues/966
- Venmo API closed to new developers: https://www.fintechfutures.com/digital-banking/in-resource-shift-venmo-closes-api-to-new-developers
- Payouts destinations and `recipient_wallet`: https://developer.paypal.com/api/payouts
- Payouts test values (Venmo 201, Venmo note error, youth account, self-pay): https://docs.paypal.ai/growth/payouts/reference/payouts-api-test-values
- Save Venmo with the JS SDK v6: https://docs.paypal.ai/payments/save/sdk/venmo/js-sdk-v6-vault-w-purchase
- Venmo Teen Account FAQ: https://help.venmo.com/cs/articles/teen-account-faq-for-parents-guardians-vhel117