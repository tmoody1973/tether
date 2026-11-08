import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Faq, FAQ } from "@/app/landing/Faq";
import { LEVELS } from "@/engine/ladder";
import { RETIRE_AFTER_MS } from "@/flows/start";

// The FAQ makes promises to parents. Each fact here is pinned to the code that makes it true, so changing the code
// without changing the answer fails.
const html = renderToStaticMarkup(createElement(Faq)).replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"');
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const src = (p: string) => readFileSync(p, "utf8");
const dollars = (c: number) => `$${c / 100}`;

describe("landing FAQ", () => {
  it("asks the five questions a parent asks, each a native disclosure with a direct first line", () => {
    expect(FAQ).toHaveLength(5);
    expect(html.match(/<details/g)).toHaveLength(5);
    for (const { lead } of FAQ) expect(lead.length).toBeLessThan(90);
  });

  it("states each level's weekly amount and approval line exactly as the engine has them", () => {
    expect(text).toContain(`Level 1 your teen can spend ${dollars(LEVELS[1].weeklyCents)} a week, and anything over ${dollars(LEVELS[1].approvalOverCents!)}, or at a shop they haven't used`);
    expect(LEVELS[1].firstTimeApproval).toBe(true);
    expect(text).toContain(`Level 2 it's ${dollars(LEVELS[2].weeklyCents)} a week, and anything over ${dollars(LEVELS[2].approvalOverCents!)} comes to you`);
    expect(text).toContain(`Level 3 it's ${dollars(LEVELS[3].weeklyCents)} a week, and nothing inside their shops needs your OK`);
    expect(LEVELS[3].approvalOverCents).toBeNull();
  });

  it("describes the parent's consent choices with the words the rules page uses", () => {
    const cc = src("src/app/g/rules/ConsentControls.tsx");
    expect(cc).toContain("Ask me before every purchase");
    expect(cc).toContain("per purchase at approved shops without asking");
    expect(text).toContain("“Ask me before every purchase”");
    expect(text).toContain("Every purchase counts at its estimated full cost");
    expect(src("src/ui/grantWords.ts")).toContain("Each purchase counts at its estimated full cost");
    expect(src("src/app/g/rules/page.tsx")).toContain("Pause spending");
    expect(src("src/engine/ladder.ts")).toContain("while Amara has paused spending, every purchase needs her yes");
  });

  it("says savings is a promise, never money held", () => {
    expect(text).toContain("Savings is a promise Tether records, not money it holds.");
    expect(text).toContain("doesn't hold, reserve or move that money");
    expect(text).not.toMatch(/stays in your PayPal|money stays|set aside for/i);
  });

  it("describes declines, refunds and asks with the words the app really shows", () => {
    expect(src("src/ui/approveWords.ts")).toContain("PayPal declined the payment. Nothing was charged.");
    expect(src("src/ui/activityWords.ts")).toContain('"Refunded in PayPal"');
    expect(text).toContain("back into this week if the week is still open, otherwise added to what you've promised");
    const aw = src("src/ui/activityWords.ts");
    expect(aw).toContain("back to ${teen}'s week");
    expect(aw).toContain("added to what you've promised");
    expect(src("src/app/t/[token]/page.tsx")).toContain("Your rules can't pay for this one, so nothing will be charged.");
    expect(text).toContain("It only suggests items those shops list as in stock.");
    expect(src("src/adapters/channel3/client.ts")).toContain('o.availability === "InStock"');
  });

  it("matches the 7-day removal, what it wipes, and the fake investing identities", () => {
    expect(RETIRE_AFTER_MS).toBe(7 * 86_400_000);
    expect(text).toContain("7 days after it starts, this demo removes the family");
    const start = src("src/flows/start.ts");
    expect(start).toContain('guardianName: "Removed", teenName: "Removed"');
    // Every parent's PayPal details are wiped; only the published shared sandbox account keeps its id and email (028,
    // review MEDIUM-1), which are nobody's personal details. The FAQ's "your PayPal details are wiped" stays true.
    expect(start).toContain("parentGivenName: null, paypalPayerId: null,");
    expect(start).toContain("...(keep ? { paypalEmail: sharedEmail } : { paypalSub: null, paypalEmail: null }),");
    expect(start).toContain("const keep = email?.toLowerCase() === sharedEmail;");
    expect(src("src/flows/invest.ts")).toContain("Fake demo identities: this is a sandbox, there is no real KYC data anywhere.");
  });
});
