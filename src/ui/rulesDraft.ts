import type { Level } from "@/engine/ladder";

export interface Draft { level: Level; floorPct: number; matchPct: number }

/**
 * One edit on Zoe's rules page. With rules in force there are two separate signings — move her level (keeps the signed
 * saving) and re-sign her saving (keeps the signed level) — so a draft never mixes an unconfirmed level with a saving
 * change: the preview is always exactly what the next button signs. With no rules in force one form signs it all.
 */
export function editDraft(signed: Draft, draft: Draft, change: Partial<Draft>, inForce: boolean): Draft {
  if (!inForce) return { ...draft, ...change };
  if (change.level !== undefined) return { ...signed, level: change.level };
  return { ...draft, ...change, level: signed.level };
}
