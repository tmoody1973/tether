import Image from "next/image";

export const REPO_URL = "https://github.com/tmoody1973/tether";

/** The demo doors' hrefs; null when the demo keys aren't configured (the page then shows no door buttons). */
export type DemoLinks = { amara: string; zoe: string } | null;

/** Every screen is 390×844 at 2x (the month assistant's was captured at 480 wide; same shape). */
const SCREEN = { width: 780, height: 1688 } as const;

/**
 * A real app screen in a phone frame. Lazy by default; the hero's two are `eager` (above the fold on every width).
 * `width` is the frame's CSS width at desktop, so `sizes` asks for no more pixels than the frame shows.
 */
export function Phone({ src, alt, width, eager }: { src: string; alt: string; width: number; eager?: boolean }) {
  return (
    <div className="l-phone">
      <Image
        src={`/landing/${src}.png`} alt={alt} width={SCREEN.width} height={SCREEN.height}
        sizes={`${width}px`} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined}
      />
    </div>
  );
}

export function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NoSign({ size = 16, stroke = 1.8 }: { size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth={stroke} />
      <path d="M5.5 10.5l5-5" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
    </svg>
  );
}
