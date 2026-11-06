import { CASH_HELD_LABEL, NEEDS_REVIEW_LABEL, QUEUED_LABEL } from "@/engine/invest";
import type * as t from "@/db/schema";

type Status = (typeof t.investments.$inferSelect)["status"];

/** Plain words for an investment's status; the three hard states use the labels the engine exports. */
export const INVEST_STATUS: Record<Status, string> = {
  proposed: "Waiting for you",
  approved: "Approved, not sent yet",
  depositing: "Moving money to her investing account",
  queued: QUEUED_LABEL,
  filled: "Bought",
  rejected: "Not this time",
  cash_held: CASH_HELD_LABEL,
  needs_review: NEEDS_REVIEW_LABEL,
};
