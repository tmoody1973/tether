import { compareSentence, oneYearLine, type Change, type MarketCompare } from "@/adapters/alpaca/data";
import type { Llm } from "./llm";

export interface FundFacts {
  name: string; symbol: string; exchange: string; fractionable: boolean;
  /** From adjusted daily bars, with their real span (R42). Never shown to the model. */
  oneYear?: Change;
  /** $100 over 5 years (or since it started trading). Never shown to the model. */
  compare?: MarketCompare;
}

const MAX_LEN = 200;
const SCHEMA = { type: "object", properties: { text: { type: "string" } }, required: ["text"] };
const BANNED = [
  /\p{Nd}/u, /%/,
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion|half|third|quarter|double[sd]?|twice|triple[sd]?|percent)\b/i,
  /\b(beat|beats|outperform\w*|underperform\w*|better|worse|more than|less than|higher|lower|gain\w*|loss\w*|grew|growth|returns?)\b/i,
  /\b(buy\w*|bought|invest\w*|recommend\w*|should|best|top|great|smart|solid|safe|worth|consider\w*|pick|good (fit|choice|idea))\b/i,
];
const LINK = /https?:|www\.|\]\(|\b[a-z0-9-]+\.(?:com|org|net|io|co|gov)\b/i;

const SYSTEM = `You describe what one fund is, for a teenager, in one plain sentence.
Use only the name, symbol, exchange and whether it can be held in fractions. Write no numbers, no comparisons, no opinions, no advice, no links.
Reply as JSON: {"text": "..."}.`;

const description = (f: FundFacts) =>
  `${f.name} (${f.symbol}) is listed on ${f.exchange}. ${f.fractionable ? "It can be held in part-shares." : "It can only be held in whole shares."}`;

/** The only numbers a reader sees: fixed sentences written by code, never by the model. */
function numeric(f: FundFacts): string[] {
  return [
    ...(f.oneYear ? [oneYearLine(f.oneYear)] : []),
    ...(f.compare ? [compareSentence(f.compare)] : []),
  ];
}

function valid(text: unknown, f: FundFacts): text is string {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_LEN || LINK.test(text)) return false;
  // The fund's own name may contain digits or words ("S&P 500", "Total Bond").
  const rest = text.split(f.name).join(" ").split(f.symbol).join(" ");
  return !BANNED.some((re) => re.test(rest));
}

const CACHE_MAX = 500;
/** Validated model sentences by symbol: what a fund is doesn't change, so the model is asked once per process. */
const said = new Map<string, string>();

export async function fundWords(llm: Llm | null, facts: FundFacts): Promise<string> {
  let sentence = said.get(facts.symbol) ?? description(facts);
  if (llm && !said.has(facts.symbol)) {
    try {
      const user = JSON.stringify({ name: facts.name, symbol: facts.symbol, exchange: facts.exchange, fractionable: facts.fractionable });
      const out = await llm.json<{ text: string }>({ system: SYSTEM, user, schema: SCHEMA, maxTokens: 100 });
      const text = out?.text?.trim();
      if (valid(text, facts)) {
        sentence = text;
        if (said.size >= CACHE_MAX) said.delete(said.keys().next().value as string); // oldest first
        said.set(facts.symbol, text);
      }
    } catch { /* model down: plain description, asked again next time */ }
  }
  return [sentence, ...numeric(facts)].join(" ");
}
