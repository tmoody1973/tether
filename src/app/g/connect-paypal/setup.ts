// The setup token this browser started, so the return step only accepts PayPal approvals Amara began here.
export const SETUP_COOKIE = "tether_setup";
export const SETUP_COOKIE_PATH = "/g/connect-paypal";

export const setupCookieOptions = () => ({
  httpOnly: true, sameSite: "lax" as const, path: SETUP_COOKIE_PATH, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60,
});

/** Where PayPal sends Amara back and what Zoe's link points at. Required in production; localhost only for dev. */
export function appBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url && process.env.NODE_ENV === "production") throw new Error("APP_BASE_URL is not set");
  return (url || "http://localhost:3000").replace(/\/$/, "");
}
