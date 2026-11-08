import type { ReactNode } from 'react'
import type { ChipKind } from './shopWords'

// The chip glyphs are the app's own (ICONS in src/ui/teen.tsx): a tick, a
// clock, an open hand. Never a red cross: a refusal is amber.
const STOP_HAND = <path d="M5 8V4.5a1 1 0 012 0V7m0-3.5a1 1 0 012 0V7m0-2a1 1 0 012 0v4.5A4.5 4.5 0 016.5 14 3.5 3.5 0 013 10.5V8.2a1 1 0 012 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
const TICK = <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

const ICONS: Record<ChipKind, ReactNode> = {
  fits: TICK,
  needs: (
    <>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 5v3.2l2 1.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  over: STOP_HAND,
}

export function ChipIcon({ kind }: { kind: ChipKind }) {
  return <svg viewBox="0 0 16 16" aria-hidden>{ICONS[kind]}</svg>
}

export const CHECK = <svg viewBox="0 0 16 16" aria-hidden>{TICK}</svg>
