// The setup token this browser started, so the return step only accepts PayPal approvals Amara began here.
export const SETUP_COOKIE = "tether_setup";
export const SETUP_COOKIE_PATH = "/g/connect-paypal";

export const setupCookieOptions = () => ({
  httpOnly: true, sameSite: "lax" as const, path: SETUP_COOKIE_PATH, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60,
});

export const appBaseUrl = (): string => (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
