// The story's words, each taken from the app (paths are in the Tether repo).
// The numbers are one consistent week: Level 2, $30.00 a week, $16.98 spent.

export const SHOP = {
  // src/app/t/[token]/shop/ShopForms.tsx (placeholder) and the landing's own example query
  placeholder: 'noise-cancelling headphones under $50',
  query: 'headphones under $30',
  left: '$13.02',
  over: '$12.28',
  focal: { title: 'Over-ear headphones', shop: 'Best Buy', price: '$25.30' },
  // cardOutcome() in src/ui/teenWords.ts; the action each label allows, from ShopForms.tsx
  cards: [
    { kind: 'over', label: 'Over budget', title: 'Over-ear headphones', bar: 0, price: '$25.30', shop: 'Best Buy', action: 'Why not?' },
    { kind: 'fits', label: 'Fits your week', title: null, bar: 132, price: '$9.99', shop: 'Target', action: 'Buy for $9.99' },
    { kind: 'needs', label: "Needs Amara's OK", title: null, bar: 112, price: '$12.49', shop: 'newegg.com', action: 'Ask Amara' },
  ],
  // templateFor('payment.budget') in src/ai/explain.ts
  sentence: "You've got $13.02 left this week and this is $25.30.",
  // sheetNumbers(spent, weekly, false) in src/ui/teenWords.ts
  numbers: "You've spent $16.98 of your $30.00 this week.",
  // waitWords(3) in src/ui/teenWords.ts
  wait: 'Wait 3 days',
  // Her week page after asking: the flash (src/app/t/[token]/page.tsx), levelLine() and resetsWords(3) (src/ui/teenWords.ts)
  sent: 'Sent. Amara will see it, with what you have left this week.',
  level: "Level 2 · over $20.00 needs Amara's OK",
  resets: 'resets in 3 days',
  // requestTitle() in src/ui/approveWords.ts: the request page's title and the push
  request: 'Zoe is asking for $25.30 at Best Buy',
  // approveWords('paid') in src/ui/approveWords.ts
  paid: 'Approved and paid — $25.30 at Best Buy. The receipt is in the record.',
  // A sandbox PayPal capture ID from the app's proof screen (public/landing/amara-proof.png)
  paypalId: '2EA32089W60470113',
} as const

export type ChipKind = 'fits' | 'needs' | 'over'
