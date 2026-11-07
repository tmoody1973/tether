import { Phone } from "./bits";

const ROWS = [
  ["Consent", "PayPal Vault", "Amara saves her PayPal once, on PayPal's own page. Tether never sees her password."],
  ["Payment", "Orders v2", "Each approved cart is one charge to that saved wallet, carrying a single-use permission slip: valid two minutes, bound to that exact cart."],
  ["Proof", "Transaction Search, webhooks", "The slip's id travels inside the PayPal order. Tether checks its receipts against PayPal's transaction list and signed webhooks."],
  ["AI, read-only", "PayPal Agent Toolkit", "The month assistant reads PayPal's transaction list, filtered to the family. It has no tool that pays."],
] as const;

export function PayPal() {
  return (
    <section className="l-pp" aria-labelledby="pp-h">
      <div className="l-wrap">
        <h2 id="pp-h">PayPal is where consent is given and where the proof lives.</h2>
        <p className="l-lede">Zoe never has a PayPal account or a card. Every dollar moves from Amara&apos;s own PayPal, and every payment can be checked against PayPal&apos;s records.</p>
        <div className="l-pp__grid">
          <ul className="l-pp__rows">
            {ROWS.map(([k, api, line]) => (
              <li key={k}><span className="l-pp__k">{k}<small>{api}</small></span><p>{line}</p></li>
            ))}
          </ul>
          <figure className="l-pp__proof">
            <Phone src="amara-proof" width={290} alt="Proof for a $4.24 Best Buy payment: PayPal ID 2EA32089W60470113, allowed by Rules v3 signed by you, a single-use permission slip valid 2 minutes, checked against PayPal: Matches PayPal." />
            <figcaption>Proof, one tap from any payment: PayPal ID, the rules version, the permission slip, and whether PayPal&apos;s records match.</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
