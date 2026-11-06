import type { ReactNode } from "react";
import type { MonthReceipt } from "@/db/repo";
import { formatDay } from "@/ui/grantWords";
import { Money } from "@/ui/guardian";

/** One payment in plain words: when, where, how it was allowed, how much. `proof` folds in underneath (Activity only). */
export function PaymentRow({ p, proof }: { p: Pick<MonthReceipt, "at" | "shop" | "amountCents" | "amaraApproved" | "status">; proof?: ReactNode }) {
  return (
    <li>
      <div className="g-row">
        <span className="g-row__date">{formatDay(p.at)}</span>
        <span>
          <span className="g-row__shop">{p.shop}</span>
          <span className="g-row__how">{p.amaraApproved ? "You approved" : "Within her rules"}{p.status === "paying" && " · paying…"}</span>
        </span>
        <span className="g-row__amt"><Money cents={p.amountCents} /></span>
      </div>
      {proof}
    </li>
  );
}
