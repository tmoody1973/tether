import { formatCents } from "@/ui/grantWords";

// Browser-safe on purpose: no imports beyond grantWords, so client components can render money and bars the way
// server pages do. (@/ui/guardian pulls server-only modules, so client code must import these from here.)

export function Money({ cents }: { cents: number }) {
  return <span className="money">{formatCents(cents)}</span>;
}

export function Bar({ value, max, goal = false, label }: { value: number; max: number; goal?: boolean; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={goal ? "g-bar g-bar--goal" : "g-bar"} role="img" aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
