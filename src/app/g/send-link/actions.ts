"use server";

import { redirect } from "next/navigation";
import { guardianFamilyId, refuseStaleForm } from "@/auth/guardianSession";
import { getDb } from "@/db/client";
import { markTeenLinkSent } from "@/db/repo";

/** "Done" on Send Zoe the link: the first-run checklist's last step. */
export async function linkSentAction(form: FormData): Promise<void> {
  const familyId = await guardianFamilyId();
  if (!familyId) redirect("/g");
  refuseStaleForm(form, familyId);
  await markTeenLinkSent(await getDb(), familyId, new Date());
  redirect("/g");
}
