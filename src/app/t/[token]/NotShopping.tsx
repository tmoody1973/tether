import type { TeenWeek } from "@/flows/teen";

/** Stopped rules (calm, R39) or no rules yet: nothing to shop with, and nothing alarming. */
export function NotShopping({ w }: { w: Pick<TeenWeek, "state" | "guardianName"> }) {
  const g = w.guardianName;
  return w.state === "stopped" ? (
    <>
      <span className="t-chip">Stopped</span>
      <h1 className="t-h2">{g} stopped your rules.</h1>
      <p className="t-small">Nothing can be bought until she sets them again. What you&apos;ve saved still counts.</p>
    </>
  ) : (
    <>
      <h1 className="t-h2">{g} hasn&apos;t set your rules yet.</h1>
      <p className="t-small">Once she signs them, this is where you&apos;ll see what you have to spend.</p>
    </>
  );
}
