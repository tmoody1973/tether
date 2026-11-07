import { REPO_URL } from "./bits";

// Every figure and quote is from docs/research/problem.md, which carries the full citations and sample sizes.
const FACTS = [
  {
    who: "Parents",
    fig: "$245M",
    what: <>refunded by Epic Games for children&apos;s charges made without a parent&apos;s OK. It &ldquo;ignored more than one million user complaints.&rdquo;</>,
    cite: "FTC, 2022",
    answer: "No card changes hands. Code checks every cart against the rules the parent signed, before PayPal is called.",
  },
  {
    who: "Teens",
    fig: "0.1%",
    what: <>of the differences in money behaviour explained by financial-education classes, across 201 studies. The authors point to &ldquo;just in time&rdquo; teaching.</>,
    cite: "Fernandes, Lynch & Netemeyer, 2014",
    answer: "A refusal explains itself at the moment she decides, with her real numbers and two ways forward.",
  },
  {
    who: "Payments and AI",
    fig: "$190–385B",
    what: <>of US online sales could go through AI shopping agents by 2030. Proving who allowed each purchase is still an open question.</>,
    cite: "Morgan Stanley, 2025; Google AP2, 2025",
    answer: "The agent only proposes. Each payment carries the rules version and a one-cart permission slip, checkable in PayPal.",
  },
] as const;

export function Problem() {
  return (
    <section className="l-problem" aria-labelledby="problem-h">
      <div className="l-wrap l-problem__grid">
        <h2 id="problem-h">Hand over a card and hope. <em>Or say no to everything.</em></h2>
        <div className="l-problem__body">
          <p>That&apos;s the choice when a fifteen-year-old wants headphones online. Neither teaches her anything.</p>
          <p>AI shopping agents make it worse: nobody has settled who is responsible when software spends on someone&apos;s behalf.</p>
          <p><strong>Tether&apos;s answer: the parent writes the rules, the AI only proposes, and plain code decides before PayPal is ever called.</strong></p>
        </div>
      </div>
      <div className="l-wrap">
        <ul className="l-numbers" aria-label="The problem in numbers">
          {FACTS.map((f) => (
            <li key={f.who}>
              <span className="l-numbers__who">{f.who}</span>
              <b className="l-numbers__fig">{f.fig}</b>
              <p>{f.what} <cite>{f.cite}</cite></p>
              <p className="l-numbers__answer"><strong>Tether&apos;s answer:</strong> {f.answer}</p>
            </li>
          ))}
        </ul>
        <p className="l-numbers__src"><a href={`${REPO_URL}/blob/main/docs/research/problem.md`}>Sources and sample sizes</a></p>
      </div>
    </section>
  );
}
