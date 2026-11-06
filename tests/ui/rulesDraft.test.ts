import { describe, expect, it } from "vitest";
import { editDraft, type Draft } from "@/ui/rulesDraft";

// The consent surface's promise: what Amara reads is what the next button signs. With rules in force there are two
// buttons (move level: keeps the signed saving; re-sign saving: keeps the signed level), so the draft never mixes them.
const signed: Draft = { level: 1, floorPct: 10, matchPct: 100 };

describe("editDraft (Zoe's rules editor)", () => {
  it("in force: changing saving drops an unconfirmed level, so the preview is what the re-sign signs", () => {
    const picked = editDraft(signed, signed, { level: 2 }, true);
    expect(picked).toEqual({ level: 2, floorPct: 10, matchPct: 100 });
    expect(editDraft(signed, picked, { floorPct: 20 }, true)).toEqual({ level: 1, floorPct: 20, matchPct: 100 });
  });

  it("in force: picking a level drops unconfirmed saving changes, so the preview is what the move signs", () => {
    const saving = editDraft(signed, signed, { floorPct: 20, matchPct: 50 }, true);
    expect(editDraft(signed, saving, { level: 3 }, true)).toEqual({ level: 3, floorPct: 10, matchPct: 100 });
  });

  it("not in force: one form signs everything, so every change stacks", () => {
    const d = editDraft(signed, editDraft(signed, signed, { level: 2 }, false), { floorPct: 20 }, false);
    expect(d).toEqual({ level: 2, floorPct: 20, matchPct: 100 });
  });
});
