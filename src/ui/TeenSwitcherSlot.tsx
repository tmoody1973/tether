import { cache } from "react";
import { cookies } from "next/headers";
import { BROWSER_FAMILY_COOKIE, PAYPAL_WHO_COOKIE, openBrowserFamilies, openPaypalWho } from "@/auth/start";
import { getDb } from "@/db/client";
import { getFamily } from "@/db/repo";
import { switcherTeens } from "@/flows/home";
import { TeenSwitcher } from "@/ui/TeenSwitcher";

/** Once per request, however many times the shell shows the switcher (sidebar and phone top bar). */
const load = cache(async (familyId: string) => {
  const db = await getDb();
  const fam = await getFamily(db, familyId);
  if (!fam) return null;
  const jar = await cookies();
  const now = new Date();
  return switcherTeens(db, { id: fam.id, teenName: fam.teenName },
    openPaypalWho(jar.get(PAYPAL_WHO_COOKIE)?.value, now), openBrowserFamilies(jar.get(BROWSER_FAMILY_COOKIE)?.value, now));
});

/** The teen switcher for a signed-in guardian, or nothing when this session can't switch (no PayPal proof). */
export async function TeenSwitcherSlot({ familyId, active }: { familyId: string; active: string }) {
  const teens = await load(familyId);
  return teens ? <TeenSwitcher teens={teens} active={active} /> : null;
}
