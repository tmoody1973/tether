import type { ReactNode } from "react";

// The five questions a parent asks after the demo (parent feedback relayed by Tarik, 8 Nov 2026).
// Every answer is checked against the code; tests/app/landing-faq.test.ts pins the facts. Native <details>: keyboard and
// screen-reader friendly, no script. Say only what is built; "In this demo" marks what a real launch would do differently.
export const FAQ: { q: string; lead: string; body: ReactNode }[] = [
  {
    q: "Will my teen's savings still be there if I spend the money in my PayPal?",
    lead: "Not automatically. Savings is a promise Tether records, not money it holds.",
    body: (
      <>
        <p>Each week, what your teen doesn&apos;t spend is recorded as an amount you promise them. Tether doesn&apos;t hold, reserve or move that money, and it doesn&apos;t check your PayPal balance. If you spend it, their number stays the same, and the promise is still yours to keep.</p>
        <p>At the monthly check-in, Tether asks you to pay it out yourself (Venmo, PayPal or cash) and record the payment, so the promise stays small. Money your teen invests is different: with your OK it moves into their own investing account (simulated in this demo).</p>
      </>
    ),
  },
  {
    q: "Can my teen buy something without asking me?",
    lead: "Yes, within the limits you sign. Anything over them comes to you.",
    body: (
      <>
        <p>Signing the rules is standing permission. At Level 1 your teen can spend $20 a week, and anything over $10, or at a shop they haven&apos;t used, comes to you first. At Level 2 it&apos;s $30 a week, and anything over $20 comes to you. At Level 3 it&apos;s $50 a week, and nothing inside their shops needs your OK.</p>
        <p>Every purchase gets a single-use permission slip, and code re-checks your rules before PayPal is charged. The AI can suggest; it can never approve. To stop all spending at once, use the Stop button on your teen&apos;s rules page.</p>
      </>
    ),
  },
  {
    q: "What happens when an order is canceled or refunded?",
    lead: "If PayPal declines, nothing is charged. A store refund shows on the receipt.",
    body: (
      <>
        <p>If PayPal declines a payment, nothing is charged and the money goes back into your teen&apos;s week. When a store refunds a purchase, Tether checks it against PayPal&apos;s own records and marks the receipt &ldquo;Refunded in PayPal&rdquo;. Returning that money to your teen&apos;s week or savings is being added now.</p>
        <p>In this demo every purchase pays one stand-in shop, so there&apos;s no shipping and nothing to return. In a real launch, the store ships and handles returns under its own policy, and its refund comes back to your PayPal.</p>
      </>
    ),
  },
  {
    q: "What happens when my teen wants something from a store Tether doesn't support?",
    lead: "They can't buy it through Tether, but they can ask you.",
    body: (
      <>
        <p>Your teen&apos;s shopping agent only searches the shops you&apos;ve allowed, and more kinds of shop open as they level up. If they want something their rules can&apos;t pay for, they can send you an ask, and nothing is charged. You can add a shop from the rules page.</p>
        <p>In this demo, purchases go to one stand-in merchant. A real launch needs each store&apos;s own checkout.</p>
      </>
    ),
  },
  {
    q: "Who can see my teen's information, and can I delete it?",
    lead: "You and your teen. In this demo, a family is removed after 7 days.",
    body: (
      <ul className="l-facts">
        <li><span><b>Who sees it:</b> you, signed in with PayPal or through your private link, and your teen, through their own link. Their link works like a key: you can reset it, and the old one stops working.</span></li>
        <li><span><b>What&apos;s stored:</b> your teen&apos;s first name, their rules, asks and purchases, and your PayPal account ID, email and first name. No analytics or ad tracking.</span></li>
        <li><span><b>What leaves Tether:</b> shopping requests and your questions to the month assistant go to Anthropic&apos;s Claude; product searches go to Channel3; payments go to PayPal; notifications go through OneSignal. In this demo, the investing account at Alpaca uses made-up identity details; only your teen&apos;s first name is real.</span></li>
        <li><span><b>Deleting:</b> 7 days after it starts, this demo removes the family. Both links stop working, the names and your PayPal details are wiped, and your saved PayPal is deleted. The money record (purchases, asks, savings) is kept, because it&apos;s the proof of what happened and can&apos;t be edited. A real launch would add export and full deletion.</span></li>
      </ul>
    ),
  },
];

export function Faq() {
  return (
    <section className="l-faq" id="faq" aria-labelledby="faq-h">
      <div className="l-wrap">
        <h2 id="faq-h">Questions parents ask.</h2>
        <p className="l-lede">Straight answers, including what this demo doesn&apos;t do yet.</p>
        <div className="l-faq__list">
          {FAQ.map(({ q, lead, body }) => (
            <details key={q} className="l-faq__item">
              <summary><span>{q}</span></summary>
              <div className="l-faq__a">
                <p className="l-faq__lead">{lead}</p>
                {body}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
