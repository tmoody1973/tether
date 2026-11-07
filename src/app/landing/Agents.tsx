import { NoSign } from "./bits";

// Every fact here is read from the code (checked 7 Nov 2026): models in src/app/t/teenDeps.ts (agentModel) and
// src/app/api/g/ask/route.ts; limits in src/ai/agent.ts (6 tool calls), src/ai/monthAssistant.ts (5 steps, its tools),
// src/engine/gate2.ts (0.98 / 0.7), src/ai/classifier.ts (4 s), src/ai/explain.ts (240 chars), src/ai/fundWords.ts.

const SHOP_TOOLS = ["Search the shops Amara allowed, through Channel3", "Look up a product link Zoe pasted"];

const MONTH_TOOLS = [
  "Tether's receipts for a month",
  "PayPal's transaction list, through the PayPal Agent Toolkit, filtered to this family",
  "Whether the month's receipts match PayPal",
  "Zoe's level, her week and her next check-in",
  "How Zoe's investments are doing",
  "What's inside one of her funds",
  "Headlines: the market, or a company on her list or inside her funds",
];

type FlowCol = { key: string; title: string; sub: string; items: [name: string, note?: string][] };

const FLOW: FlowCol[] = [
  { key: "ai", title: "AI", sub: "proposes, explains, answers", items: [["Shopping agent"], ["“Is it a book?” check"], ["Refusal sentences"], ["Fund descriptions"], ["Month assistant"]] },
  { key: "code", title: "Code", sub: "decides", items: [["Rule engine", "the rules Amara signed"], ["Amara's approvals"], ["Permission slip", "single use, 120 seconds, one cart"]] },
  { key: "money", title: "Money", sub: "moves", items: [["PayPal", "charges Amara's saved wallet"], ["Alpaca", "deposit and order"]] },
];

function FlowArrow() {
  return (
    <div className="l-flow__arrow" aria-hidden="true">
      <svg width="28" height="16" viewBox="0 0 28 16"><path d="M2 8h22M18 3l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
}

export function Agents() {
  return (
    <section className="l-agents" id="agents" aria-labelledby="agents-h">
      <div className="l-wrap">
        <h2 id="agents-h">Meet the agents.</h2>
        <p className="l-lede">
          Two parts of Tether are agents: a model that loops, calling tools. Three more are single model calls whose answers code
          checks. Each one has a plain code fallback, so the app still works with the model switched off.
        </p>

        <div className="l-agents__pair">
          <article className="l-agent l-agent--teen" aria-labelledby="agent-shop-h">
            <h3 id="agent-shop-h">The shopping agent</h3>
            <p className="l-agent__model">Claude Haiku 5.5, for Zoe</p>
            <p>
              Zoe types &ldquo;headphones under $30&rdquo; or pastes a product link. The agent searches only the shops Amara allowed,
              in at most 6 tool calls, then proposes two or three carts with a short reason each. Code checks every cart against the
              signed rules and labels it &ldquo;Fits your week&rdquo;, &ldquo;Needs Amara&apos;s OK&rdquo; or &ldquo;Over budget&rdquo;
              before Zoe sees it.
            </p>
            <h4>Its two tools</h4>
            <ul className="l-tools">{SHOP_TOOLS.map((t) => <li key={t}>{t}</li>)}</ul>
            <p className="l-agent__cant"><NoSign />It can&apos;t buy, approve, change a rule or touch PayPal.</p>
          </article>

          <article className="l-agent l-agent--guard" aria-labelledby="agent-month-h">
            <h3 id="agent-month-h">The month assistant</h3>
            <p className="l-agent__model">Claude Sonnet 5.5, for Amara</p>
            <p>
              Amara asks about Zoe&apos;s month, her investments or the news: &ldquo;What did Zoe buy this month?&rdquo; It answers in
              at most 5 steps, from read-only tools. The cards under each answer are built by code from real data, never written by
              the model.
            </p>
            <h4>Its read-only tools</h4>
            <ul className="l-tools">{MONTH_TOOLS.map((t) => <li key={t}>{t}</li>)}</ul>
            <p className="l-agent__cant"><NoSign />It can&apos;t move money, advise, predict or rank. Without the data it says &ldquo;I can&apos;t see that.&rdquo;</p>
          </article>
        </div>

        <div className="l-checked">
          <h3>Three single calls, each checked by code.</h3>
          <p>One question in, one answer out, no tools. Code checks every answer, and anything off falls back to plain wording.</p>
          <ul className="l-checked__list">
            <li>
              <b>&ldquo;Is it really a book?&rdquo;</b>
              <span>
                Level 2&apos;s bookshop is for books only, and Barnes &amp; Noble also sells games. The model says how sure it is; code
                decides. 98% or surer, the cart goes through. From 70%, it needs Amara&apos;s OK. Below that, it&apos;s refused.
              </span>
              <span className="l-fallback">An error or no answer within 4 seconds counts as refused. It can only tighten the rules, never loosen them.</span>
            </li>
            <li>
              <b>Refusal sentences</b>
              <span>The rule engine&apos;s reasons, turned into one sentence for Zoe with two ways forward. It may use only the dollar amounts the engine gave it, never say a purchase is approved, and stays under 240 characters.</span>
              <span className="l-fallback">Otherwise a fixed template: &ldquo;You&apos;ve got $13.02 left this week and this is $25.30.&rdquo;</span>
            </li>
            <li>
              <b>Fund and company descriptions</b>
              <span>One plain sentence about what a fund or company is, on Zoe&apos;s investing screen. The model never sees prices and may write no numbers, comparisons or selling words.</span>
              <span className="l-fallback">Otherwise a template. Every price line is written by code.</span>
            </li>
          </ul>
        </div>

        <div className="l-flow" role="group" aria-labelledby="flow-h">
          <h3 id="flow-h">Who can touch money.</h3>
          <div className="l-flow__cols">
            {FLOW.map((col, i) => (
              <FlowStep key={col.key} col={col} last={i === FLOW.length - 1} />
            ))}
          </div>
          <p className="l-flow__note">
            Nothing in the AI group has a path to PayPal or Alpaca except through code that checks the rules Amara signed, and her
            approval where they ask for it. The month assistant only reads PayPal&apos;s list.
          </p>
        </div>
      </div>
    </section>
  );
}

function FlowStep({ col, last }: { col: FlowCol; last: boolean }) {
  return (
    <>
      <div className={`l-flow__col l-flow__col--${col.key}`}>
        <h4>{col.title}<small>{col.sub}</small></h4>
        <ul>
          {col.items.map(([name, note]) => (
            <li key={name}>{name}{note && <small>{note}</small>}</li>
          ))}
        </ul>
      </div>
      {!last && <FlowArrow />}
    </>
  );
}
