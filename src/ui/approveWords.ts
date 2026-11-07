import { CASH_HELD_LABEL, NEEDS_REVIEW_LABEL, QUEUED_LABEL } from "@/engine/invest";
import type { ApproveCode } from "@/flows/approve";
import type { ClosedRequest, RequestView } from "@/flows/request";
import { formatCents, formatWhen } from "@/ui/grantWords";
import { INVEST_STATUS } from "@/ui/investWords";

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

const CLOSED_HEADING = { approved: "Already approved.", declined: "Already answered: not this time.", expired: "This one ran out of time." };
const CLOSED_VERB = { approved: "approved", declined: "declined", expired: "ran out of time" };

/** Where an approved purchase stands. Statuses before the yes (asked, waiting) can't follow one, so they have no words. */
const PURCHASE_STATUS: Partial<Record<NonNullable<ClosedRequest["purchase"]>["status"], string>> = {
  paid: "Paid.",
  paying: "PayPal is confirming the payment.",
  approved: "Approved. The payment hasn't gone to PayPal yet.", // settling: re-pricing and the gates run before it becomes `paying`, so never "nothing was charged"
  failed: "PayPal declined the payment. Nothing was charged.",
  refused: "It didn't go through. Nothing was charged.",
  expired: "It ran out of time. Nothing was charged.",
};

/**
 * A request that is no longer open, in Amara's words. Never "you approved": on the shared demo someone else may have
 * tapped first. Status and receipt note only after a yes; after a no or a timeout nothing moved, and the heading says so.
 */
export function closedWords(c: ClosedRequest) {
  const subject = c.purchase ? `${formatCents(c.purchase.amountCents)} at ${c.purchase.shop}`
    : c.investment ? `${formatCents(c.investment.amountCents)} in ${c.investment.symbol}`
    : c.fund ? `Adding ${c.fund.symbol} to your fund list` : `A new shop: ${c.shop?.domain}`;
  const yes = c.outcome === "approved";
  const inv = c.investment;
  const status = !yes ? null
    : inv ? (inv.status === "rejected" ? approveWords("inv-rejected", c.teenName).text : INVEST_STATUS[inv.status])
    : (c.purchase && PURCHASE_STATUS[c.purchase.status]) || null;
  const [href, button] = c.purchase ? ["/g/activity", "See activity"]
    : c.shop ? ["/g/rules", "See her rules"] : ["/g/invest", `See ${c.teenName}'s investments`];
  return {
    heading: CLOSED_HEADING[c.outcome],
    line: `${subject} · ${CLOSED_VERB[c.outcome]}${c.at ? ` ${formatWhen(c.at)}` : ""}`,
    status, note: (yes && inv?.receiptNote) || null, href, button,
  };
}
