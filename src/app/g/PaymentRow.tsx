import type { ReactNode } from "react";
import type { MonthReceipt } from "@/db/repo";
import { itemsLine } from "@/ui/activityWords";
import { formatDay } from "@/ui/grantWords";
import { Money } from "@/ui/guardian";

/** One payment in plain words: when, where, what she bought, how it was allowed, how much. `proof` folds in underneath (Activity only). */
export function PaymentRow({ p, proof }: { p: Pick<MonthReceipt, "at" | "shop" | "items" | "amountCents" | "amaraApproved" | "status">; proof?: ReactNode }) {
  return (
    <li>
      <div className="g-row">
        <span className="g-row__date">{formatDay(p.at)}</span>
        <span>
          <span className="g-row__shop">{p.shop}</span>
          <ItemsLine items={p.items} />
          <span className="g-row__how">{p.amaraApproved ? "You approved" : "Within her rules"}{p.status === "paying" && " · paying…"}</span>
        </span>
        <span className="g-row__amt"><Money cents={p.amountCents} /></span>
      </div>
      {proof}
    </li>
  );
}

/** What she bought, under the shop name. Item titles come from the shop: React escapes them, nothing renders them as markup. */
export function ItemsLine({ items }: { items: MonthReceipt["items"] }) {
  const line = itemsLine(items);
  return line ? <span className="g-row__items">{line}</span> : null;
}
