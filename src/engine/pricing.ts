// Decision 030: the cost of a cart, with Tether's estimates of sales tax and shipping (Channel3 gives item prices only).
// Integer cents throughout; the only rounding is the tax, half up.
import type { Cart, CartItem, Cents, CostTerms, ItemCondition } from "./types";

/** Sales tax on `itemsCents` at `bps` basis points, rounded half up to the cent. */
export const taxCents = (itemsCents: Cents, bps: number): Cents => Math.floor((itemsCents * bps + 5_000) / 10_000);

export const itemsTotal = (items: CartItem[]): Cents => items.reduce((s, i) => s + i.qty * i.unitCents, 0);

/** A cart with its total. With cost terms, the estimates are added in; without (older rules), the total is the items. */
export function pricedCart(merchantId: string, items: CartItem[], costs?: CostTerms, sourceUrl?: string): Cart {
  const itemsCents = itemsTotal(items);
  const base = { merchantId, items, ...(sourceUrl ? { sourceUrl } : {}) };
  if (!costs) return { ...base, totalCents: itemsCents };
  const estTaxCents = taxCents(itemsCents, costs.salesTaxBps);
  const estShippingCents = costs.shippingCents;
  return { ...base, itemsCents, estTaxCents, estShippingCents, totalCents: itemsCents + estTaxCents + estShippingCents };
}

/** The split PayPal is sent (amount.breakdown), or null for a cart without estimates. Always sums to totalCents. */
export function costSplit(cart: Cart): { itemCents: Cents; taxCents: Cents; shippingCents: Cents } | null {
  if (cart.itemsCents === undefined || cart.estTaxCents === undefined || cart.estShippingCents === undefined) return null;
  if (cart.itemsCents + cart.estTaxCents + cart.estShippingCents !== cart.totalCents) return null; // never send a split that doesn't add up
  return { itemCents: cart.itemsCents, taxCents: cart.estTaxCents, shippingCents: cart.estShippingCents };
}

/** Validation for Amara's settings: tax 0–15% in basis points, shipping $0–$50 in whole cents. */
export const MAX_TAX_BPS = 1_500;
export const MAX_SHIPPING_CENTS = 5_000;
export const DEFAULT_SHIPPING_CENTS = 599;
export const validCosts = (c: CostTerms): boolean =>
  Number.isInteger(c.salesTaxBps) && c.salesTaxBps >= 0 && c.salesTaxBps <= MAX_TAX_BPS
  && Number.isInteger(c.shippingCents) && c.shippingCents >= 0 && c.shippingCents <= MAX_SHIPPING_CENTS;

/** One of a product as a cart item: price, the offer's condition, and its photo (decision 030). */
export const itemOf = (p: { id: string; title: string; priceCents: Cents; condition?: ItemCondition; imageUrl?: string }): CartItem => ({
  sku: p.id, title: p.title, qty: 1, unitCents: p.priceCents, condition: p.condition ?? "unknown", ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
});
