/** What the browser and OneSignal say about push on this device. optedIn null = OneSignal hasn't answered (or isn't loaded). */
export interface NotifyEnv {
  supported: boolean; ios: boolean; standalone: boolean;
  permission: NotificationPermission; optedIn: boolean | null;
}

export type NotifyState = "off" | "on" | "blocked" | "unsupported" | "ios-install";

export function notifyState(e: NotifyEnv): NotifyState {
  // iPhone Safari has no push at all until Tether is opened from the Home Screen (iOS 16.4+).
  if (!e.supported) return e.ios && !e.standalone ? "ios-install" : "unsupported";
  if (e.permission === "denied") return "blocked";
  return e.permission === "granted" && e.optedIn === true ? "on" : "off";
}

export const NOTIFY_WORDS: Record<Exclude<NotifyState, "off">, string> = {
  on: "On for this device",
  blocked: "Notifications are blocked for this site. Open the site settings (the icon beside the address), set Notifications to Allow, then reload.",
  unsupported: "This browser can't show notifications. Try Chrome, Edge, Firefox or Safari on a computer.",
  "ios-install": "On iPhone, add Tether to your Home Screen first (Share, then Add to Home Screen), then open it from there.",
};
