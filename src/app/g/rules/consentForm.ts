// Decision 030: reading Amara's consent settings from a form. Pure; integers only (no float maths on money).
import { DEFAULT_SHIPPING_CENTS, validCosts } from "@/engine/pricing";
import type { CostTerms, SpendingMode } from "@/engine/types";

/** The one "Sign and send" form's id (a plain module: a client file's exports reach the server as references, not values). */
export const SIGN_FORM = "g-sign";

const str = (v: FormDataEntryValue | null): string => (typeof v === "string" ? v.trim() : "");

/** "15", "15.5", "$15.50" → 1550; anything else → null. */
export function parseCents(s: string): number | null {
  const m = /^\$?\s*(\d{1,4})(?:\.(\d{1,2}))?$/.exec(s.trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0")) : null;
}

/** "8.25", "8.25%", "7" → basis points (825, 700); anything else → null. */
export function parseTaxBps(s: string): number | null {
  const m = /^(\d{1,2})(?:\.(\d{1,2}))?\s*%?$/.exec(s.trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0")) : null;
}

/** The spending mode a form asks for; a blank "up to" means no per-purchase limit. Null: not a valid choice. */
export function parseSpending(form: FormData): SpendingMode | null {
  const mode = form.get("spendingMode");
  if (mode === "every") return { mode: "every" };
  if (mode !== "upTo") return null;
  const raw = str(form.get("upTo"));
  if (raw === "") return { mode: "upTo", upToCents: null };
  const cents = parseCents(raw);
  return cents === null ? null : { mode: "upTo", upToCents: cents };
}

/** Sales tax (required) and shipping (blank: $5.99) from a form; null when out of range or unreadable. */
export function parseCosts(form: FormData): CostTerms | null {
  const salesTaxBps = parseTaxBps(str(form.get("salesTax")));
  const ship = str(form.get("shipping"));
  const shippingCents = ship === "" ? DEFAULT_SHIPPING_CENTS : parseCents(ship);
  if (salesTaxBps === null || shippingCents === null) return null;
  const c = { salesTaxBps, shippingCents };
  return validCosts(c) ? c : null;
}
