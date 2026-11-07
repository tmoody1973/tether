/**
 * The shared PayPal SANDBOX personal test login for judges (fake money only; publishing it is intended, Tarik
 * 2026-11-07). The one place these values live: the README repeats them by hand. Never log them.
 */
export const SANDBOX_LOGIN = {
  email: "sb-yeg6453771544@personal.example.com",
  password: "s-i@.4BO",
  /** The account's PayPal payer id (sandbox dashboard). Empty until Tarik adds it; an empty value never matches. */
  payerId: "",
} as const;
