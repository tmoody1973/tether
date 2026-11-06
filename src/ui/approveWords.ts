import { CASH_HELD_LABEL, NEEDS_REVIEW_LABEL, QUEUED_LABEL } from "@/engine/invest";
import type { ApproveCode } from "@/flows/approve";
import type { RequestView } from "@/flows/request";
import { formatCents } from "@/ui/grantWords";

export interface ApproveFlash { text: string; warn?: boolean; connectPaypal?: boolean }

/** R36's outcome table, in Amara's words. Names come from the family, never hardcoded. */
export function approveWords(code: ApproveCode, teen: string, paid?: { amountCents: number; shop: string } | null): ApproveFlash {
  switch (code) {
    case "paid":
      return { text: paid ? `Approved and paid — ${formatCents(paid.amountCents)} at ${paid.shop}. The receipt is in the record.` : "Approved and paid. The receipt is in the record." };
    case "paying": return { text: "Approved. PayPal is confirming the payment." };
    case "changed": return { text: `Approved, but the price or item changed, so nothing was charged. ${teen} can ask again.`, warn: true };
    case "rules": return { text: `Approved, but ${teen}'s rules or budget changed since she asked, so nothing was charged.`, warn: true };
    case "nopaypal": return { text: `Approved, but there's no saved PayPal, so nothing was charged. ${teen} will need to ask again.`, warn: true, connectPaypal: true };
    case "paypal-off": return { text: `Approved, but Tether can't reach PayPal right now, so nothing was charged. ${teen} will need to ask again.`, warn: true };
    case "paypal-declined": return { text: "Approved, but PayPal declined the payment, so nothing was charged.", warn: true };
    case "notstarted": return { text: "Approved. The payment didn't start yet; nothing was charged.", warn: true };
    case "inv-filled": return { text: "Bought." };
    case "inv-queued": return { text: QUEUED_LABEL };
    case "inv-depositing": return { text: `Money is on its way to ${teen}'s investing account; Tether is checking.` };
    case "inv-rejected": return { text: `Not bought — ${teen}'s savings are unchanged.`, warn: true };
    case "inv-waiting": return { text: "Approved; nothing has moved yet." };
    case "inv-cash-held": return { text: CASH_HELD_LABEL, warn: true };
    case "inv-review": return { text: NEEDS_REVIEW_LABEL };
    case "fund": return { text: `Approved. ${teen} can now propose investing in it.` };
    case "shop": return { text: `Approved. ${teen} can now use that shop.` };
    case "shop-later": return { text: `Approved. The shop goes into ${teen}'s rules when you next sign them.` };
  }
}

/** One request in a sentence: the request page's title and the push Amara gets for it. */
export function requestTitle(v: Pick<RequestView, "teenName" | "purchase" | "investment" | "fund" | "shop">): string {
  const zoe = v.teenName;
  if (v.purchase) return `${zoe} is asking for ${formatCents(v.purchase.amountCents)} at ${v.purchase.shop}`;
  if (v.investment) return `${zoe} proposes investing ${formatCents(v.investment.amountCents)} in ${v.investment.symbol}`;
  if (v.fund) return `${zoe} proposes adding ${v.fund.symbol} to your fund list`;
  return `${zoe} suggests a new shop: ${v.shop?.domain}`;
}
