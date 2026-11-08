import { describe, expect, it } from "vitest";
import { checkWords, hiddenNote, itemsLine, lagWords, monthEnd, needsBadge, shownReceipts, weekEnd } from "@/ui/activityWords";
import { reviewMonth, type WeekRecord } from "@/engine/ladder";

const kept = (k: string): WeekRecord => ({ weekKey: k, allowanceCents: 2000, spentCents: 1000, commitmentCents: 200 });

describe("activity words (Amara's Activity page)", () => {
  it("says what PayPal's own list shows for one payment, in plain words", () => {
    const rec = { receiptsChecked: 3, flags: [
      { kind: "unconfirmed" as const, captureId: "B", amountCents: 100, shop: "Target", paidAt: new Date("2026-11-08T12:45:00Z") },
      { kind: "refunded" as const, captureId: "C", amountCents: 100, shop: "Target" },
    ] };
    expect(checkWords(rec, "A")).toEqual({ text: "Matches PayPal", ok: true });
    expect(checkWords(rec, "B")).toEqual({ text: "Not yet confirmed by PayPal. PayPal's list can lag a few hours.", ok: false });
    expect(checkWords(rec, "C")).toEqual({ text: "Refunded in PayPal", ok: false });
    expect(checkWords("checking", "A")).toEqual({ text: "Checking with PayPal…", ok: false });
    expect(checkWords("down", "A")).toEqual({ text: "Couldn't reach PayPal to check. Try again later.", ok: false });
  });

  it("when PayPal says how far its list has caught up: waiting reads quiet, a real gap stays amber", () => {
    const flags = [{ kind: "unconfirmed" as const, captureId: "B", amountCents: 1799, shop: "Best Buy", paidAt: new Date("2026-11-08T12:45:00Z") }];
    const now = new Date("2026-11-08T12:57:00Z");
    // the 8 Nov case: PayPal's list ran to 10:59:59, the payment was 12:45 → just not there yet
    expect(checkWords({ receiptsChecked: 1, flags, refreshedThrough: new Date("2026-11-08T10:59:59Z") }, "B", now)).toEqual({
      text: "Paid. PayPal's list is about 2 hours behind and hasn't reached this payment yet. It will show here once PayPal catches up.",
      ok: false, waiting: true,
    });
    // PayPal's list already covers 12:45 and still doesn't have it → a real question
    expect(checkWords({ receiptsChecked: 1, flags, refreshedThrough: new Date("2026-11-08T12:50:00Z") }, "B", now)).toEqual({
      text: "Not confirmed by PayPal: its list covers the time of this payment but doesn't show it.", ok: false,
    });
  });

  it("puts PayPal's lag in rounded words", () => {
    expect(lagWords(10 * 60_000)).toBe("under an hour");
    expect(lagWords(75 * 60_000)).toBe("about 1 hour");
    expect(lagWords(118 * 60_000)).toBe("about 2 hours");
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

  it("names what she bought under the shop: the first item, then how many more", () => {
    const item = (title: string) => ({ title, qty: 1 });
    expect(itemsLine([item("Crayola 64-pack")])).toBe("Crayola 64-pack");
    expect(itemsLine([item("Crayola 64-pack"), item("Sketchbook")])).toBe("Crayola 64-pack + 1 more");
    expect(itemsLine([item("Crayola 64-pack"), item("Sketchbook"), item("Pens")])).toBe("Crayola 64-pack + 2 more");
    expect(itemsLine([])).toBeNull();
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
