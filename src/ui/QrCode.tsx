import { qrMatrix } from "@/ui/qr";

/** The text as a QR code (black on white, 4-module quiet zone), or nothing if it's too long to encode. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const m = qrMatrix(text);
  if (!m) return null;
  const quiet = 4;
  const n = m.length + 2 * quiet;
  const d = m.flatMap((row, y) => row.map((on, x) => (on ? `M${x + quiet} ${y + quiet}h1v1h-1z` : ""))).join("");
  return (
    <svg viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
