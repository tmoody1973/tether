// The investing story's words, built with the app's own (client-safe) word functions; the rest are checked against
// the app's source by tests/app/landing-stories.test.ts.
// One consistent moment: Monday 9 Nov, 10:42 New York time, the market open. The latest close is Friday's (6 Nov,
// $361.86). Zoe has $41.50 saved and proposes $5.00; Amara approves while the market is open, so the order fills
// ("Bought.", approveWords('inv-filled')) and Zoe's card is dated that day. A fill hours old reads "1 day".
import { formatCents } from "@/ui/grantWords";
import { closeWords, dayMonth, dayMonthYear, requestShareWords, shareCount, shareLine, shareWords, tooSoonWords, youOwnWords } from "@/ui/investWords";
import { QUESTIONS } from "@/ui/investQuestions";
import { approveWords, requestTitle } from "@/ui/approveWords";

const PRICE = 36186; // cents, Friday's close
const AMOUNT = 500;
const SAVED = 4150;
const CLOSE_DAY = new Date("2026-11-06T21:00:00Z"); // Friday 6 Nov, after the 4pm close in New York
const BOUGHT_AT = new Date("2026-11-09T15:42:00Z"); // Monday 9 Nov, 10:42 in New York
const SHARES = AMOUNT / PRICE;

type Request = Parameters<typeof requestTitle>[0];
const share = shareWords(AMOUNT, PRICE, true, "VTI");

export const INVEST = {
  time: "10:42",
  // src/app/t/[token]/invest/[symbol]/page.tsx
  name: "Vanguard Morningstar Total Stock Market ETF",
  listing: "VTI · ARCA",
  price: formatCents(PRICE),
  close: closeWords(CLOSE_DAY),
  // InsideCard: the fund's biggest holdings (public/landing/zoe-fund-top.png)
  inside: [
    ["NVIDIA", 6.4],
    ["Apple", 5.9],
    ["Alphabet", 5.2],
    ["Microsoft", 3.8],
    ["Amazon.com", 3.2],
  ] as const,
  onList: "VTI is on Amara's investing list. Propose an amount and she decides.",
  // QUESTIONS in src/ui/investQuestions.ts; her answers are the invest mockups' sample text
  answers: [
    [QUESTIONS.why, "I want a little bit of every company, not just one."],
    [QUESTIONS.sell, "If I needed it for a car. Not before."],
    [QUESTIONS.drop, "Nervous, but I'd leave it. It's for years from now."],
  ] as const,
  amount: String(AMOUNT / 100),
  shares: shareLine(AMOUNT, PRICE, "VTI"),
  limits: `At least ${formatCents(100)}, and no more than you've saved. The exact slice is set when the market fills the order.`,
  sent: "Sent. Amara will see your answers and decide.",
  request: requestTitle({ teenName: "Zoe", investment: { amountCents: AMOUNT, symbol: "VTI" } } as Request),
  // the push body's second line (src/flows/notify.ts)
  push: `${share[0].toUpperCase()}${share.slice(1)}. Tap to decide.`,
  shareSub: requestShareWords(AMOUNT, { cents: PRICE, fractionable: true }, "VTI"),
  saved: formatCents(SAVED),
  put: formatCents(AMOUNT),
  approve: `Approve ${formatCents(AMOUNT)}`,
  bought: approveWords("inv-filled", "Zoe").text,
  // holdingSentence(h, 'guardian') with no line yet: worth equals what she put in
  herSentence: `Her ${formatCents(AMOUNT)} is worth ${formatCents(AMOUNT)}. She owns ${shareCount(SHARES)} of a share.`,
  tooSoon: tooSoonWords(1),
  owns: youOwnWords(SHARES),
  putIn: `${formatCents(AMOUNT)} on ${dayMonth(BOUGHT_AT)}`,
  since: `since ${dayMonthYear(BOUGHT_AT)}`,
  // Her Invest page after the buy: what she saved, less the $5.00
  left: formatCents(SAVED - AMOUNT),
} as const;
