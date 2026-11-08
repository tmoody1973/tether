import { INVESTING_FROM, LEVELS } from "@/engine/ladder";
import type { TeenWeek } from "@/flows/teen";
import { TeenShell } from "@/ui/teen";
import { INVESTING_OFF_LINE, investingOffWords, levelProgress } from "@/ui/teenWords";
import { NotShopping } from "../NotShopping";

/**
 * Below the investing level, or rules not in force: a calm page instead of investing (the tab is hidden below it).
 * Investing off (decision 030): `holdings` pages (the Invest tab) still open, to show what she has; proposing pages don't.
 */
export function investGate(token: string, w: TeenWeek, holdings = false) {
  if (!w.level || !LEVELS[w.level].investing) {
    return (
      <TeenShell token={token} active={null} level={w.level} center>
        <h1 className="t-h2">Investing opens at Level {INVESTING_FROM}.</h1>
        {w.level && <p className="t-small">{levelProgress(w.streak, w.level)}</p>}
      </TeenShell>
    );
  }
  if (w.state === "active" && w.investingOff && !holdings) {
    return (
      <TeenShell token={token} active="invest" level={w.level} center>
        <h1 className="t-h2">{investingOffWords(w.guardianName)}.</h1>
        <p className="t-small">{INVESTING_OFF_LINE}</p>
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
