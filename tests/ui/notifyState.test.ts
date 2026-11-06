import { describe, expect, it } from "vitest";
import { notifyState, NOTIFY_WORDS, type NotifyEnv } from "@/ui/notifyState";

const base: NotifyEnv = { supported: true, ios: false, standalone: false, permission: "default", optedIn: null };

describe("notifyState", () => {
  it("off until she turns it on; on only when the browser allows it AND this device is subscribed", () => {
    expect(notifyState(base)).toBe("off");
    expect(notifyState({ ...base, permission: "granted", optedIn: null })).toBe("off"); // SDK not answered yet
    expect(notifyState({ ...base, permission: "granted", optedIn: false })).toBe("off");
    expect(notifyState({ ...base, permission: "granted", optedIn: true })).toBe("on");
  });
  it("blocked when the browser denied it", () => {
    expect(notifyState({ ...base, permission: "denied" })).toBe("blocked");
  });
  it("an iPhone not installed to the Home Screen is told to add it; other browsers without push are unsupported", () => {
    expect(notifyState({ ...base, supported: false, ios: true })).toBe("ios-install");
    expect(notifyState({ ...base, supported: false, ios: true, standalone: true })).toBe("unsupported"); // installed, iOS too old
    expect(notifyState({ ...base, supported: false })).toBe("unsupported");
  });
  it("says how to fix each state in plain words", () => {
    expect(NOTIFY_WORDS["ios-install"]).toContain("On iPhone, add Tether to your Home Screen first");
    expect(NOTIFY_WORDS.blocked).toMatch(/Allow/);
    expect(NOTIFY_WORDS.on).toBe("On for this device");
  });
});
