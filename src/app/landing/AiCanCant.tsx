const CAN = [
  ["Propose", "Two or three options, only from shops Amara allowed."],
  ["Explain", "Why a cart doesn't fit, in one plain sentence with the real numbers."],
  ["Add friction", "Ask “is this really a book?” and hold the cart for Amara's OK, or refuse it. Never the other way."],
  ["Answer, read-only", "Amara's questions about the month, her investments and the news, from receipts and PayPal's list."],
] as const;

const NEVER = [
  ["Decide", "Plain code checks every cart against the signed rules."],
  ["Loosen a rule", "Only Amara changes the rules, and each change asks her once."],
  ["Move money", "No model in Tether has a tool that charges, buys or invests."],
  ["Recommend an investment", "Fund and stock pages show facts only. Zoe proposes; Amara decides."],
] as const;

export function AiCanCant() {
  return (
    <section className="l-ai" id="ai" aria-labelledby="ai-h">
      <div className="l-wrap">
        <h2 id="ai-h">What the AI can do, and what it never can.</h2>
        <div className="l-ai__grid">
          <div className="l-ai__col">
            <h3>
              <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="12" fill="#E7F8EF" /><path d="M8 13.5l3.2 3.2L18 9.5" fill="none" stroke="#0E8A52" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              It can
            </h3>
            <ul>{CAN.map(([b, s]) => <li key={b}><b>{b}</b><span>{s}</span></li>)}</ul>
          </div>
          <div className="l-ai__col">
            <h3>
              <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="12" fill="rgba(255,255,255,.12)" /><circle cx="13" cy="13" r="6.5" fill="none" stroke="#fff" strokeWidth="2" /><path d="M8.6 17.4l8.8-8.8" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
              It never can
            </h3>
            <ul>{NEVER.map(([b, s]) => <li key={b}><b>{b}</b><span>{s}</span></li>)}</ul>
          </div>
        </div>
      </div>
    </section>
  );
}
