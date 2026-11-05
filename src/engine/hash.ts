import { createHash } from "node:crypto";
import type { Cart } from "./types";

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, canonical(x)]),
    );
  }
  return v;
}

/** SHA-256 hex of canonical JSON (keys sorted recursively, items sorted by sku). */
export function cartHash(cart: Cart): string {
  const items = [...cart.items].sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(canonical({ ...cart, items }))).digest("hex");
}
