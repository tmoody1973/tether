// D16: the ONE chart Zoe ever sees, on the fund page only. A fixed 5-year frame, no time controls, no daily moves.
// Both lines keep their colours in up and down years (never red, never green): the sentence beside it carries the facts.
const W = 320, H = 150, PAD = 8;

function points(ys: number[], lo: number, hi: number): string {
  const span = hi - lo || 1;
  return ys.map((y, i) => {
    const x = PAD + (i / Math.max(1, ys.length - 1)) * (W - 2 * PAD);
    return `${x.toFixed(1)},${(H - PAD - ((y - lo) / span) * (H - 2 * PAD)).toFixed(1)}`;
  }).join(" ");
}

/** fund / market: what $100 became along the way. label: the compare sentence (the chart's accessible name). */
export function FiveYearLine({ fund, market, label }: { fund: number[]; market: number[]; label: string }) {
  const all = [...fund, ...market, 100];
  const lo = Math.min(...all), hi = Math.max(...all);
  const base = H - PAD - ((100 - lo) / (hi - lo || 1)) * (H - 2 * PAD);
  return (
    <svg className="t-chart" data-chart="five-year" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      <line className="t-chart__base" x1={PAD} x2={W - PAD} y1={base} y2={base} />
      <polyline className="t-chart__market" points={points(market, lo, hi)} />
      <polyline className="t-chart__fund" points={points(fund, lo, hi)} />
    </svg>
  );
}
