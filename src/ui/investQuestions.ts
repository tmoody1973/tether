// Pure constants shared by the fund page's form (client) and the proposal flow (server).

/** D16's "Ask yourself…" questions. Her answers travel with the proposal; the keys are what Amara reads them under. */
export const QUESTIONS = {
  why: "Why this one?",
  sell: "What would make you sell it?",
  drop: "How would you feel if this dropped by a third next year?",
} as const;
export type Answers = Record<keyof typeof QUESTIONS, string>;
export const ANSWER_MIN = 2;
export const ANSWER_MAX = 500;
