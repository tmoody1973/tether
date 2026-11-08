import type { Cents } from "@/engine/types";
import type { PaypalHttp } from "./http";

interface TxInfo {
  transaction_id: string; transaction_amount?: { value: string }; transaction_status?: string;
  custom_field?: string; paypal_reference_id?: string; transaction_event_code?: string;
}
interface TxResponse { transaction_details?: { transaction_info: TxInfo }[]; total_pages?: number; last_refreshed_datetime?: string }

export interface PaypalTx {
  id: string; amountCents: Cents; status: string;
  /** Our order's custom_id, i.e. the permission slip's token id (R35). */
  customField?: string;
  /** For a refund or reversal: the transaction it undoes. */
  referenceId?: string;
  /** PayPal T-code, e.g. T0003 payment, T1107 refund, T2002 sweep to a partner account. */
  eventCode?: string;
}

const PAGE_SIZE = 500;
const MAX_PAGES = 20; // ponytail: 10k rows a month is far past the demo; raise or narrow the window if it ever bites

/** Transaction Search for Tether's merchant account: every family's rows. Callers must filter to one family. */
export async function listTransactions(p: PaypalHttp, start: Date, end: Date): Promise<PaypalTx[]> {
  return (await searchTransactions(p, start, end)).rows;
}

/**
 * Same search, plus how far PayPal's list has caught up: Transaction Search fills in hours after a payment, and every
 * reply says the time it is complete up to (last_refreshed_datetime). Undefined if PayPal leaves it out or it's garbled.
 */
export async function searchTransactions(p: PaypalHttp, start: Date, end: Date): Promise<{ rows: PaypalTx[]; refreshedThrough?: Date }> {
  const out: PaypalTx[] = [];
  let refreshedThrough: Date | undefined;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const q = new URLSearchParams({
      start_date: start.toISOString(), end_date: end.toISOString(), fields: "transaction_info",
      page_size: String(PAGE_SIZE), page: String(page),
    });
    const { data } = await p.request<TxResponse>("GET", `/v1/reporting/transactions?${q}`);
    const refreshed = typeof data.last_refreshed_datetime === "string" ? new Date(data.last_refreshed_datetime) : undefined;
    if (refreshed && !Number.isNaN(refreshed.getTime())) refreshedThrough = refreshed;
    for (const { transaction_info: t } of data.transaction_details ?? []) {
      out.push({
        id: t.transaction_id,
        amountCents: Math.round(Number(t.transaction_amount?.value ?? 0) * 100),
        status: t.transaction_status ?? "UNKNOWN",
        ...(t.custom_field ? { customField: t.custom_field } : {}),
        ...(t.paypal_reference_id ? { referenceId: t.paypal_reference_id } : {}),
        ...(t.transaction_event_code ? { eventCode: t.transaction_event_code } : {}),
      });
    }
    if (page >= (data.total_pages ?? 1)) break;
  }
  return refreshedThrough ? { rows: out, refreshedThrough } : { rows: out };
}
