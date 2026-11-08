// The investing story's words, each from the app (paths in the Tether repo).
// One consistent moment: VTI closed at $361.86 on Friday 6 Nov; Zoe has $41.50
// saved; she proposes $5.00, about 0.0138 of a share.

export const INVEST = {
  // src/app/t/[token]/invest/[symbol]/page.tsx
  name: 'Vanguard Morningstar Total Stock Market ETF',
  listing: 'VTI · ARCA',
  // ShareCostCard and closeWords() in src/ui/InvestCards.tsx, src/ui/investWords.ts
  price: '$361.86',
  close: "At Friday's close (6 Nov). You don't need a whole one: you buy in dollars.",
  // InsideCard: the fund's biggest holdings (public/landing/zoe-fund-top.png)
  inside: [
    ['NVIDIA', 6.4],
    ['Apple', 5.9],
    ['Alphabet', 5.2],
    ['Microsoft', 3.8],
    ['Amazon.com', 3.2],
  ] as const,
  onList: "VTI is on Amara's investing list. Propose an amount and she decides.",
  // QUESTIONS in src/ui/investQuestions.ts; her answers from the invest mockups
  answers: [
    ['Why this one?', 'I want a little bit of every company, not just one.'],
    ['What would make you sell it?', 'If I needed it for a car. Not before.'],
    ['How would you feel if this dropped by a third next year?', "Nervous, but I'd leave it. It's for years from now."],
  ] as const,
  amount: '5',
  // shareLine(500, 36186, 'VTI') in src/ui/investWords.ts
  shares: '= about 0.0138 of one VTI share at $361.86.',
  limits: "At least $1.00, and no more than you've saved. The exact slice is set when the market fills the order.",
  sent: 'Sent. Amara will see your answers and decide.',
  // requestTitle(), requestShareWords() and the push body (src/flows/notify.ts)
  request: 'Zoe proposes investing $5.00 in VTI',
  push: 'About 0.0138 of a share. Tap to decide.',
  shareSub: 'About 0.0138 of a share at $361.86',
  consequence: ['She has ', '$41.50', ' available to invest. This moves ', '$5.00', " into her investing account. Once it's there it belongs to her and can't be taken back."] as const,
  // approveWords('inv-filled'), holdingSentence(h, 'guardian'), tooSoonWords(1), youOwnWords()
  bought: 'Bought.',
  herSentence: 'Her $5.00 is worth $5.00. She owns 0.0138 of a share.',
  tooSoon: "It's been 1 day. Too soon to tell: investments like this are for years, not days.",
  owns: '0.0138 share',
  putIn: '$5.00 on 6 Nov',
  since: 'since 6 Nov 2026',
} as const
