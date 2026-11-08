import { guardianFamilyId, refuseStaleForm } from "@/auth/guardianSession";
import { clockFor } from "@/clock/clock";
import { getDb } from "@/db/client";

/**
 * The signed-in guardian, refusing a form drawn for another teen (refuseStaleForm, review HIGH-1). A plain module, not
 * "use server": exported from a server-actions file it would become a callable endpoint itself.
 */
export async function guardianDeps(form: FormData) {
  const familyId = await guardianFamilyId();
  if (!familyId) return null;
  refuseStaleForm(form, familyId);
  const db = await getDb();
  return { familyId, deps: { db, now: clockFor(db) } };
}
