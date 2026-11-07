// D16: the ONE chart Zoe sees on a fund page: a fixed 5-year frame, no time controls, no daily moves. Decision 020 adds
// one sibling use, the since-you-bought line on each holding, under the same rules. Both lines keep their colours in
// up and down years (never red, never green): the sentence beside it carries the facts.
const W = 320, H = 150, PAD = 8;

function points(ys: number[], lo: number, hi: number): string {
  const span = hi - lo || 1;
  return ys.map((y, i) => {
    const x = PAD + (i / Math.max(1, ys.length - 1)) * (W - 2 * PAD);
    return `${x.toFixed(1)},${(H - PAD - ((y - lo) / span) * (H - 2 * PAD)).toFixed(1)}`;
  }).join(" ");
}

/**
 * One line against the whole market, with a flat baseline. fund / market share the units of `base` (what $100 became,
 * or cents). tone: "t" (Zoe's colours) or "g" (Amara's). label: the sentence beside it (the chart's accessible name).
 */
export function ValueLine({ fund, market, label, base, tone = "t", chart }: {
  fund: number[]; market: number[]; label: string; base: number; tone?: "t" | "g"; chart: string;
}) {
  const all = [...fund, ...market, base];
  const lo = Math.min(...all), hi = Math.max(...all);
  const y = H - PAD - ((base - lo) / (hi - lo || 1)) * (H - 2 * PAD);
  return (
    <svg className={`${tone}-chart`} data-chart={chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      <line className={`${tone}-chart__base`} x1={PAD} x2={W - PAD} y1={y} y2={y} />
      <polyline className={`${tone}-chart__market`} points={points(market, lo, hi)} />
      <polyline className={`${tone}-chart__fund`} points={points(fund, lo, hi)} />
    </svg>
  );
}

/** fund / market: what $100 became along the way. label: the compare sentence (the chart's accessible name). */
export function FiveYearLine({ fund, market, label }: { fund: number[]; market: number[]; label: string }) {
  return <ValueLine fund={fund} market={market} label={label} base={100} chart="five-year" />;
}
