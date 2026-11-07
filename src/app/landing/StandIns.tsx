const ROWS = [
  ["Every purchase pays one Tether sandbox account; the receipt records which shop it was for.", "Tether would pay shops through PayPal's platform and agent-checkout programs."],
  ["Zoe's investments sit in an ordinary Alpaca sandbox account, labelled on screen as a stand-in.", "A custodial account Amara manages for Zoe."],
  ["A demo clock moves time forward so a month fits in a few clicks.", "Real time."],
  ["The demo family is shared, and resets itself.", "One family per household."],
] as const;

export function StandIns() {
  return (
    <section className="l-honest" aria-labelledby="honest-h">
      <div className="l-wrap">
        <h2 id="honest-h">What the sandbox stands in for, said plainly.</h2>
        <table>
          <thead><tr><th scope="col">In this demo</th><th scope="col">In production</th></tr></thead>
          <tbody>{ROWS.map(([demo, prod]) => <tr key={demo}><td>{demo}</td><td>{prod}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
