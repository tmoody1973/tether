import type { Llm } from "./llm";

export interface FundFacts {
  name: string; symbol: string; exchange: string; fractionable: boolean;
  /** Dollar values from adjusted daily bars. */
  oneYear?: { todayDollars: number; yearAgoDollars: number };
  /** Whole-dollar value of $100 over 5 years. */
  compare?: { thisFundDollars: number; marketDollars: number };
}

const MAX_LEN = 300;
const SCHEMA = { type: "object", properties: { text: { type: "string" } }, required: ["text"] };
const BANNED = [/\bbuy\b/i, /\bgood fit\b/i, /\brecommend/i, /\bshould\b/i];
const LINK = /https?:|www\.|\]\(|\b[a-z0-9-]+\.(?:com|org|net|io|co|gov)\b/i;
// 1 and 5 appear in fixed phrases ("a year ago", "Over 5 years"); 100 is the starting $100.
const FIXED_NUMBERS = [1, 5, 100];

const SYSTEM = `You restate facts about one investment fund for a teenager in two or three plain sentences.
Use only the facts you are given. Add no claims, opinions, predictions or advice. Do not say whether it is good or bad.
Never tell the reader to act. Do not include links. Use only numbers that appear in the facts.
Reply as JSON: {"text": "..."}.`;

const money = (n: number) => `$${n.toFixed(2)}`;

function template(f: FundFacts): string {
  const parts = [
    `${f.name} (${f.symbol}) is listed on ${f.exchange}.`,
    f.fractionable ? "It can be held in part-shares." : "It can only be held in whole shares.",
  ];
  if (f.oneYear) parts.push(`${money(f.oneYear.todayDollars)} today, ${money(f.oneYear.yearAgoDollars)} a year ago.`);
  if (f.compare) parts.push(`Over 5 years, $100 became: this $${f.compare.thisFundDollars}, the whole market $${f.compare.marketDollars}.`);
  return parts.join(" ");
}

const numbersIn = (s: string): number[] =>
  (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((m) => parseFloat(m.replace(/,/g, "")));

function valid(text: unknown, f: FundFacts): text is string {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_LEN) return false;
  if (BANNED.some((re) => re.test(text)) || LINK.test(text)) return false;
  const allowed = new Set<number>([
    ...FIXED_NUMBERS,
    ...numbersIn(`${f.name} ${f.symbol}`),
    ...(f.oneYear ? [f.oneYear.todayDollars, f.oneYear.yearAgoDollars] : []),
    ...(f.compare ? [f.compare.thisFundDollars, f.compare.marketDollars] : []),
  ]);
  return numbersIn(text).every((n) => allowed.has(n));
}

/** The model sees only `facts`; any violation, or no model, gives the plain template. */
export async function fundWords(llm: Llm | null, facts: FundFacts): Promise<string> {
  const fallback = template(facts);
  if (!llm) return fallback;
  try {
    const out = await llm.json<{ text: string }>({ system: SYSTEM, user: JSON.stringify(facts), schema: SCHEMA, maxTokens: 160 });
    const text = out?.text?.trim();
    return valid(text, facts) ? text : fallback;
  } catch {
    return fallback;
  }
}
