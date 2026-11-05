import type { Cents } from "@/engine/types";
import type { PaypalHttp } from "./http";

interface TxResponse {
  transaction_details?: {
    transaction_info: { transaction_id: string; transaction_amount?: { value: string }; transaction_status?: string };
  }[];
}

export async function listTransactions(
  p: PaypalHttp, start: Date, end: Date,
): Promise<{ id: string; amountCents: Cents; status: string }[]> {
  const q = new URLSearchParams({ start_date: start.toISOString(), end_date: end.toISOString(), fields: "transaction_info" });
  const { data } = await p.request<TxResponse>("GET", `/v1/reporting/transactions?${q}`);
  return (data.transaction_details ?? []).map(({ transaction_info: t }) => ({
    id: t.transaction_id,
    amountCents: Math.round(Number(t.transaction_amount?.value ?? 0) * 100),
    status: t.transaction_status ?? "UNKNOWN",
  }));
}
