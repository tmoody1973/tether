import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

// Amara's side was reorganised around her jobs: Home, Zoe's rules, Activity. Old links (bookmarks, the README,
// earlier emails) still land somewhere sensible, and keep their query (e.g. ?month=2026-12).
describe("old guardian URLs redirect", () => {
  it("sends Grant to Zoe's rules and Record/Review to Activity, temporarily", async () => {
    const rules = await nextConfig.redirects!();
    const to = (src: string) => rules.find((r) => r.source === src);
    expect(to("/g/grant")).toMatchObject({ destination: "/g/rules", permanent: false });
    expect(to("/g/record")).toMatchObject({ destination: "/g/activity", permanent: false });
    expect(to("/g/review")).toMatchObject({ destination: "/g/activity", permanent: false });
  });
});
