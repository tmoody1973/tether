// The shopping story's words. Every number is computed here from cents with the app's own formatter; every
// sentence is the app's (tests/app/landing-stories.test.ts checks each against the function or source that writes it).
// One consistent week: Level 2, $30.00 a week, $16.98 spent before she asks for the $25.30 headphones.
import { formatCents } from "@/ui/grantWords";

const WEEKLY = 3000;
const SPENT = 1698;
const PRICE = 2530;
const LEFT = WEEKLY - SPENT; // 1302
const OVER = PRICE - LEFT; // 1228
// After Amara approves and PayPal pays, the spend lands in this week (src/flows/teen.ts: left = max(0, weekly − spent))
const SPENT_AFTER = SPENT + PRICE; // 4228
const LEFT_AFTER = Math.max(0, WEEKLY - SPENT_AFTER); // 0

const G = "Amara";
const price = formatCents(PRICE);

export const SHOP = {
  cents: { weekly: WEEKLY, spent: SPENT, price: PRICE, left: LEFT, spentAfter: SPENT_AFTER },
  // src/app/t/[token]/shop/ShopForms.tsx (placeholder) and the landing's own example query
  placeholder: "noise-cancelling headphones under $50",
  query: "headphones under $30",
  weekly: formatCents(WEEKLY),
  spent: formatCents(SPENT),
  left: formatCents(LEFT),
  over: formatCents(OVER),
  spentAfter: formatCents(SPENT_AFTER),
  leftAfter: formatCents(LEFT_AFTER),
  focal: { title: "Over-ear headphones", shop: "Best Buy", price },
  // cardOutcome() in src/ui/teenWords.ts; the action each label allows, from ShopForms.tsx. The other two prices
  // are illustrative, both under what's left and the $20.00 Level 2 line.
  cards: [
    { kind: "over", label: "Over budget", title: "Over-ear headphones", bar: 0, price, shop: "Best Buy", action: "Why not?" },
    { kind: "fits", label: "Fits your week", title: null, bar: 132, price: formatCents(999), shop: "Target", action: `Buy for ${formatCents(999)}` },
    { kind: "needs", label: `Needs ${G}'s OK`, title: null, bar: 112, price: formatCents(1249), shop: "newegg.com", action: `Ask ${G}` },
  ],
  // templateFor('payment.budget') in src/ai/explain.ts
  sentence: `You've got ${formatCents(LEFT)} left this week and this is ${price}.`,
  // sheetNumbers(spent, weekly, false) in src/ui/teenWords.ts
  numbers: `You've spent ${formatCents(SPENT)} of your ${formatCents(WEEKLY)} this week.`,
  // waitWords(3) in src/ui/teenWords.ts
  wait: "Wait 3 days",
  // Her week page after asking: the flash (src/app/t/[token]/page.tsx), levelLine() and resetsWords(3) (src/ui/teenWords.ts)
  sent: `Sent. ${G} will see it, with what you have left this week.`,
  level: `Level 2 · over ${formatCents(2000)} needs ${G}'s OK`,
  resets: "resets in 3 days",
  // Her week once it's paid: the purchase moves to This week (src/app/t/[token]/page.tsx)
  approvedRow: `Over-ear headphones · ${G} approved this one`,
  // requestTitle() in src/ui/approveWords.ts: the request page's title and the push
  request: `Zoe is asking for ${price} at Best Buy`,
  // approveWords('paid') in src/ui/approveWords.ts
  paid: `Approved and paid — ${price} at Best Buy. The receipt is in the record.`,
  // src/app/g/activity/page.tsx: the proof, with TOKEN_TTL_MS (src/engine/token.ts) as minutes
  allowed: "Rules v3, signed by you, and you approved it",
  slip: "Single use, this cart only, valid 2 minutes.",
  // A sandbox PayPal capture ID from the app's proof screen (public/landing/amara-proof.png)
  paypalId: "2EA32089W60470113",
} as const;

export type ChipKind = "fits" | "needs" | "over";
