import { describe, expect, it } from "vitest";
import { checkWords, hiddenNote, monthEnd, needsBadge, shownReceipts, weekEnd } from "@/ui/activityWords";
import { reviewMonth, type WeekRecord } from "@/engine/ladder";

const kept = (k: string): WeekRecord => ({ weekKey: k, allowanceCents: 2000, spentCents: 1000, commitmentCents: 200 });

describe("activity words (Amara's Activity page)", () => {
  it("says what PayPal's own list shows for one payment, in plain words", () => {
    const rec = { receiptsChecked: 3, flags: [
      { kind: "unconfirmed" as const, captureId: "B", amountCents: 100, shop: "Target" },
      { kind: "refunded" as const, captureId: "C", amountCents: 100, shop: "Target" },
    ] };
    expect(checkWords(rec, "A")).toEqual({ text: "Matches PayPal", ok: true });
    expect(checkWords(rec, "B")).toEqual({ text: "Not yet confirmed by PayPal. PayPal's list can lag a few hours.", ok: false });
    expect(checkWords(rec, "C")).toEqual({ text: "Refunded in PayPal", ok: false });
    expect(checkWords("checking", "A")).toEqual({ text: "Checking with PayPal…", ok: false });
    expect(checkWords("down", "A")).toEqual({ text: "Couldn't reach PayPal to check. Try again later.", ok: false });
  });

  it("hides rows a demo reset set aside, and counts them for one muted line", () => {
    const rows = [{ captureId: "A", setAside: false }, { captureId: "B", setAside: true }, { captureId: "C", setAside: true }];
    const r = shownReceipts(rows);
    expect(r.shown.map((x) => x.captureId)).toEqual(["A"]);
    expect(r.hidden).toBe(2);
    expect(hiddenNote(2)).toBe("2 payments from earlier demo resets are hidden.");
    expect(hiddenNote(1)).toBe("1 payment from an earlier demo reset is hidden.");
    expect(hiddenNote(0)).toBeNull();
    // a PayPal flag on a hidden row isn't silenced: the note says so
    expect(hiddenNote(2, 1)).toBe("2 payments from earlier demo resets are hidden; PayPal's check flagged 1 of them.");
  });

  it("names the end of the ISO week (Sunday, UTC) and the month's last day", () => {
    expect(weekEnd(new Date("2026-12-28T10:00:00Z")).toISOString().slice(0, 10)).toBe("2027-01-03"); // Mon → Sun
    expect(weekEnd(new Date("2027-01-03T23:00:00Z")).toISOString().slice(0, 10)).toBe("2027-01-03"); // Sun stays Sun
    expect(monthEnd(new Date("2026-12-05T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-12-31");
    expect(monthEnd(new Date("2027-02-10T00:00:00Z")).toISOString().slice(0, 10)).toBe("2027-02-28");
  });

  it("the nav badge shows only when something needs her", () => {
    expect(needsBadge(0)).toBeNull();
    expect(needsBadge(2)).toBe("2");
    expect(needsBadge(12)).toBe("9+");
  });

  it("a promotion's reason is about Zoe, read by Amara (her, not your)", () => {
    const r = reviewMonth(["W1", "W2", "W3", "W4"].map(kept), 1);
    expect(r.action).toBe("PROMOTE");
    expect(r.reason).toBe("Kept her savings promise 4 weeks running.");
  });
});
