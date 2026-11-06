import type { TeenWeek } from "@/flows/teen";
import { TeenShell } from "@/ui/teen";
import { levelProgress } from "@/ui/teenWords";
import { NotShopping } from "../NotShopping";

/** Below Level 3, or rules not in force: a calm page instead of investing (the tab is hidden below Level 3). */
export function investGate(token: string, w: TeenWeek) {
  if (w.level !== 3) {
    return (
      <TeenShell token={token} active={null} level={w.level} center>
        <h1 className="t-h2">Investing opens at Level 3.</h1>
        {w.level && <p className="t-small">{levelProgress(w.streak, w.level)}</p>}
      </TeenShell>
    );
  }
  if (w.state === "active") return null;
  return (
    <TeenShell token={token} active="invest" level={w.level} center>
      {w.state === "ended"
        ? <><h1 className="t-h2">Your week&apos;s finished.</h1><p className="t-small">Investing opens again when {w.guardianName} renews your rules.</p></>
        : <NotShopping w={w} />}
    </TeenShell>
  );
}

export const UNAVAILABLE = "Prices aren't available right now.";
