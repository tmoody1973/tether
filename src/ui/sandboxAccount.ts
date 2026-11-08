/**
 * The shared PayPal SANDBOX personal test login for judges (fake money only; publishing it is intended, Tarik
 * 2026-11-07). The one place these values live: the README repeats them by hand. Never log them.
 */
export const SANDBOX_LOGIN = {
  email: "sb-yeg6453771544@personal.example.com",
  password: "s-i@.4BO",
  /**
   * The account's PayPal payer id: PayPal's permanent id for it, so the shared login is still recognised if someone
   * changes its email. Read 8 Nov 2026 from the families this account started (Tarik approved the read).
   */
  payerId: "UCGBS6LD437PL",
} as const;
