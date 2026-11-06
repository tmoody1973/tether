import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./fixtures";

/** Signs in as one seeded family's guardian. State-changing tests each use their own family (fixtures.ts). */
const enter = (page: Page, key: string = E2E.guardianKey) => page.goto(`/g/enter/${key}`);
const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test("no cookie ⇒ neutral page, no data", async ({ page }) => {
  for (const path of ["/g", "/g/rules", "/g/activity", "/g/grant", "/g/record", "/g/review", "/g/invest",
    `/g/requests/${E2E.approvalId}`, "/g/enter/not-a-real-key"]) {
    await page.goto(path);
    await expect(page.getByText("Open your Tether link to continue.")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Zoe|Amara|\$\d/); // no names, no money
    await expect(page.getByRole("link")).toHaveCount(0); // no navigation either
  }
  expect((await page.context().cookies()).find((c) => c.name === "tether_g")).toBeUndefined();
  const api = await page.request.post("/api/g/ask", { data: { question: "what did she buy?" } });
  expect(api.status()).toBe(401);
});

test("entry link sets cookie and lands on home, with three tabs and a Needs-you count", async ({ page, context }) => {
  await enter(page);
  await expect(page).toHaveURL(/\/g$/); // the key leaves the address bar
  const cookie = (await context.cookies()).find((c) => c.name === "tether_g");
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  await expect(page.getByRole("heading", { level: 1, name: "Zoe" })).toBeVisible();
  await expect(page.getByText("Level 1", { exact: true }).first()).toBeVisible();
  const home = nav(page).getByRole("link", { name: /^Home/ });
  await expect(home).toHaveAttribute("aria-current", "page");
  await expect(home.locator(".g-badge")).toHaveText("1 waiting"); // one request waits for her
  await expect(nav(page).getByRole("link", { name: "Zoe's rules" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^(Grant|Record|Review)$/ })).toHaveCount(0);
});

test("old guardian URLs redirect to the new pages, keeping their query", async ({ page }) => {
  await enter(page);
  await page.goto("/g/grant");
  await expect(page).toHaveURL(/\/g\/rules$/);
  await expect(page.getByRole("heading", { level: 1, name: "Zoe's rules" })).toBeVisible();
  await page.goto("/g/record?month=2026-01");
  await expect(page).toHaveURL(/\/g\/activity\?month=2026-01$/);
  await page.goto("/g/review");
  await expect(page).toHaveURL(/\/g\/activity$/);
  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
});

test("home shows this week, what needs you, recent payments and her rules at a glance", async ({ page }) => {
  await enter(page);
  await expect(page.getByRole("region", { name: "This week" })).toContainText("$9.50 left of $20.00");
  await expect(page.getByRole("region", { name: "This week" })).toContainText("$10.50 spent · week ends");
  await expect(page.getByRole("link", { name: /Zoe is asking for \$15\.00 at Target/ })).toBeVisible();
  const recent = page.getByRole("region", { name: "Recent" });
  await expect(recent.locator("li", { hasText: "Target" })).toContainText("Within her rules");
  await expect(recent.locator("li", { hasText: "Target" })).toContainText("$6.00");
  await expect(recent.locator("li", { hasText: "Target" })).toContainText("Notebook"); // what she bought, under the shop
  await expect(recent.getByRole("link", { name: "See all activity" })).toHaveAttribute("href", "/g/activity");
  const glance = page.getByRole("region", { name: "Her rules at a glance" });
  await expect(glance).toContainText("Each week$20.00");
  await expect(glance).toContainText("Asks you firstover $10.00, or a shop she hasn't used");
  await expect(glance).toContainText("Saves at least$2.00 a week");
  await expect(glance).toContainText(/Best Buy and Target|Target and Best Buy/);
  await expect(glance.getByRole("link", { name: "Change her rules" })).toHaveAttribute("href", "/g/rules");
  await expect(page.getByRole("region", { name: "Ask about Zoe's month" }).getByRole("button", { name: "What did Zoe buy this month?" })).toBeVisible();
  // Zoe's link moved to her rules; demo controls are folded away.
  await expect(page.getByRole("button", { name: "Send Zoe her link" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Advance to end of month" })).toBeHidden();
  await page.getByText("Demo controls").click();
  for (const b of ["Advance 1 day", "Advance to end of week", "Advance to end of month"]) await expect(page.getByRole("button", { name: b })).toBeVisible();
});

test("home labels the savings goal with its name", async ({ page }) => {
  await enter(page, E2E.grantKey);
  const goal = page.getByRole("region", { name: "Zoe's savings goal" });
  await expect(goal).toContainText("Space One Pro headphones");
  await expect(goal).toContainText("$0.00 of $169.99 saved");
});

test("Zoe's link: send and reset live on her rules page", async ({ page }) => {
  await enter(page);
  await page.goto("/g/rules");
  await page.getByRole("button", { name: "Reset Zoe's link" }).click(); // asks first
  await expect(page.getByRole("button", { name: "Yes, reset" })).toBeVisible();
  await page.getByRole("button", { name: "Keep it" }).click();
  await page.getByRole("button", { name: "Send Zoe her link" }).click();
  await expect(page.getByLabel("Zoe's link")).toHaveValue(new RegExp(`/t/${E2E.teenToken}$`));
});

test("changing her saving re-signs her rules, with the plain-words clause", async ({ page }) => {
  await enter(page, E2E.grantKey);
  await page.goto("/g/rules");
  await expect(page.getByRole("heading", { level: 1, name: "Zoe's rules" })).toBeVisible();
  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What Zoe reads" })).toBeVisible();
  const clause = page.locator(".g-clause");
  await expect(clause).toContainText("In plain words");
  await expect(clause).toContainText(/Zoe can spend up to \$20\.00 a week at (Best Buy and Target|Target and Best Buy)\./);
  await expect(clause).toContainText("Anything over $10.00, or at a shop she hasn't used before, comes to you first.");
  expect(await clause.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Georgia/);
  await expect(page.getByRole("button", { name: "Sign and send" })).toHaveCount(0); // rules in force: change, don't re-sign the lot

  await page.getByLabel("Zoe saves at least").selectOption("20");
  await expect(clause).toContainText("She saves at least $4.00 a week"); // live preview
  await expect(page.getByRole("heading", { name: "What Zoe will read" })).toBeVisible();
  await page.getByRole("button", { name: "Apply saving change" }).click();
  await expect(page.getByText(/This re-signs her rules for a new week/)).toBeVisible();
  await page.getByRole("button", { name: "Yes, re-sign" }).click();
  await expect(page).toHaveURL(/\/g\?signed=2$/);
  await expect(page.getByRole("status").first()).toContainText("Signed. Rules v2 are in force now.");

  await page.goto("/g/rules");
  await expect(page.getByLabel("Zoe saves at least")).toHaveValue("20");
  await expect(page.locator(".g-clause")).toContainText("She saves at least $4.00 a week");
});

test("what Amara reads is what the next button signs: an unconfirmed level never rides along with a saving change", async ({ page }) => {
  await enter(page, E2E.levelKey);
  await page.goto("/g/rules");
  const clause = page.locator(".g-clause");
  await page.getByLabel("Level 2").check(); // picked, not confirmed
  await expect(clause).toContainText("$30.00 a week");
  await page.getByLabel("Zoe saves at least").selectOption("20"); // a saving change re-signs at her signed level
  await expect(page.getByLabel(/Level 1/)).toBeChecked();
  await expect(clause).toContainText("Zoe can spend up to $20.00 a week");
  await expect(clause).toContainText("She saves at least $4.00 a week");
  await page.getByLabel("Level 2").check(); // and picking a level drops the unsigned saving change
  await expect(page.getByLabel("Zoe saves at least")).toHaveValue("10");
  await expect(clause).toContainText("She saves at least $3.00 a week");
});

test("with no rules in force, her rules page signs them (Sign and send, then Yes, sign)", async ({ page }) => {
  await enter(page, E2E.signKey);
  await page.goto("/g/rules");
  await expect(page.getByText("Stopped. Sign new rules below when you're ready.")).toBeVisible();
  await expect(page.getByLabel(/Level 1/)).toBeChecked(); // she keeps her level after a stop
  await page.getByLabel("You match").selectOption("50");
  await page.getByRole("button", { name: "Sign and send" }).click();
  await page.getByRole("button", { name: "Yes, sign" }).click();
  await expect(page).toHaveURL(/\/g\?signed=2$/);
  await page.goto("/g/rules");
  await expect(page.getByLabel("You match")).toHaveValue("50");
  await expect(page.getByRole("button", { name: "Stop Zoe's rules" })).toBeVisible();
});

test("a request shows the budget consequence first, under Home", async ({ page }) => {
  await enter(page);
  await page.getByRole("link", { name: /Zoe is asking for \$15\.00 at Target/ }).click();
  await expect(page).toHaveURL(new RegExp(`/g/requests/${E2E.approvalId}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Zoe is asking for $15.00 at Target");
  await expect(page.getByText("She has $9.50 left this week. This would use the rest and $5.50 more.")).toBeVisible();
  await expect(page.locator(".g-reason")).toHaveText("“the ones I have are falling apart”");
  await expect(page.getByRole("button", { name: "Approve $15.00" })).toBeEnabled();
  await expect(nav(page).getByRole("link", { name: /^Home/ })).toHaveAttribute("aria-current", "page");
  await expect(nav(page).locator(".g-badge")).toHaveText("1 waiting"); // the count follows her onto a request
  await expect(page.getByRole("link", { name: "‹ Home" })).toHaveAttribute("href", "/g");
});

test("approves pending request in one tap", async ({ page }) => {
  await enter(page, E2E.approveKey);
  await page.getByRole("link", { name: /Zoe is asking for \$8\.00 at Best Buy/ }).click();
  await expect(page.getByText("She has $20.00 left this week. This would leave $12.00.")).toBeVisible();
  await page.getByRole("button", { name: "Approve $8.00" }).click(); // the one tap: approve AND pay
  await expect(page).toHaveURL(/\/g\?decided=paid&req=/);
  await expect(page.locator(".g-flash")).toHaveText("Approved and paid — $8.00 at Best Buy. The receipt is in the record.");
  await expect(page.getByText("Nothing needs you today.")).toBeVisible();
  await expect(nav(page).locator(".g-badge")).toHaveCount(0); // nothing waiting ⇒ no badge
  await page.goto("/g/activity");
  const row = page.locator(".g-rows > li", { hasText: "Best Buy" }).first();
  await expect(row).toContainText("You approved");
  await row.getByText("Proof").click();
  await expect(row).toContainText(/E2E-PAID-\d+/);
  await expect(row).toContainText("Rules v1, signed by you, and you approved it");
  await expect(row.locator("dd", { hasText: "Matches PayPal" })).toBeVisible();
  await page.goto(`/g/requests/${E2E.approveApprovalId}`); // a decided request has closed
  await expect(page.getByText("This request has closed.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
});

test("activity lists purchases in plain words, with the proof folded under each", async ({ page }) => {
  await enter(page);
  await page.goto("/g/activity");
  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Activity" })).toHaveAttribute("aria-current", "page");
  // The paid $6.00 row (it has a Proof). A parallel teen test can add its own $6.00 Notebook that is still paying.
  const row = page.locator(".g-rows > li").filter({ has: page.locator("summary", { hasText: /^Proof for \$6\.00 at Target, / }) }).first();
  await expect(row).toContainText("Target");
  await expect(row.locator(".g-row__items")).toHaveText("Notebook"); // the seeded item, under the shop
  await expect(row).toContainText("Within her rules");
  await expect(row.getByText(E2E.receiptCapture)).toBeHidden(); // folded until she asks
  await expect(row.locator("summary")).toHaveText(/^Proof for \$6\.00 at Target, /); // its name says which payment
  await row.getByText("Proof").click();
  await expect(row.getByText(E2E.receiptCapture)).toBeVisible();
  await expect(row).toContainText("Rules v1, signed by you");
  await expect(row).toContainText("Single use, this cart only, valid 2 minutes.");
  await expect(row).toContainText("Cart fingerprint");
  await expect(row.locator(".g-clause")).toContainText("Zoe can spend up to $20.00 a week");
  await expect(row.locator("dd", { hasText: "Matches PayPal" })).toBeVisible();
  const settling = page.locator(".g-rows > li", { hasText: "Paying… no receipt yet" });
  await expect(settling).toContainText("$4.50"); // money left, no receipt
  await expect(settling.locator(".g-row__items")).toHaveText("Notebook"); // its cart is known, so is what she's buying
  await expect(page.getByRole("region", { name: /check-in$/ })).toContainText("The check-in runs at month end");
  await expect(page.getByRole("button", { name: "What did Zoe buy this month?" })).toBeVisible();
  await expect(page.getByText("Rules history")).toBeVisible();
  await expect(page.getByText("Rules v1 · Level 1")).toBeHidden(); // folded
  await page.getByText("Rules history").click();
  await expect(page.getByText("Rules v1 · Level 1")).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).toContain("Sandbox only; no real money moves.");
  expect(body).not.toMatch(/HMAC|Gate 2|stand-in merchant/); // the README carries the technical caveats
});

test("reconciliation flags a PayPal transaction missing from Tether", async ({ page }) => {
  await enter(page);
  await page.goto("/g/activity");
  const flags = page.getByRole("list", { name: "PayPal charges Tether has no receipt for" });
  const flag = flags.locator("li", { hasText: E2E.missingCapture });
  await expect(flag).toContainText("PayPal charged, Tether has no receipt");
  await expect(flag).toContainText("$4.50");
  await expect(flags.locator("li")).toHaveCount(1); // the matched receipt raises nothing
  const body = await page.locator("body").innerText();
  expect(body).not.toContain(E2E.otherFamilyCapture); // another family's charge
  expect(body).not.toContain(E2E.unlinkedCapture); // a merchant-account row with no family link
  expect(body).not.toMatch(/\$50\.00|\$9\.99/);
});

test("request id from another family shows the closed page", async ({ page }) => {
  await enter(page);
  await page.goto(`/g/requests/${E2E.otherApprovalId}`);
  await expect(page.getByText("This request has closed.")).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/Kai|Sam|\$15\.00|falling apart/);
  await expect(page.getByRole("button", { name: /Approve|Not this time/ })).toHaveCount(0);
  await page.goto("/g/requests/not-a-real-request");
  await expect(page.getByText("This request has closed.")).toBeVisible();
});

test("changing her level from her rules page needs a reason", async ({ page }) => {
  await enter(page, E2E.levelKey);
  await page.goto("/g/rules");
  const levelChip = page.locator(".g-section__head .g-chip", { hasText: /^Level \d$/ });
  await expect(page.getByLabel("Level 2")).not.toBeChecked(); // nothing chosen for her
  await page.getByLabel("Level 2").check();
  await page.getByRole("button", { name: "Move Zoe to Level 2" }).click();
  await expect(page.getByText(/Move Zoe to Level 2\? Her weekly money becomes \$30\.00/)).toBeVisible();
  await page.getByRole("button", { name: "Yes, move her" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Say why — it goes on the record. Nothing changed.");
  await page.reload();
  await expect(levelChip).toHaveText("Level 1"); // nothing changed
  await page.getByLabel("Level 2").check();
  await page.getByLabel("Why? It goes on the record.").fill("She has been careful all month.");
  await page.getByRole("button", { name: "Move Zoe to Level 2" }).click();
  await page.getByRole("button", { name: "Yes, move her" }).click();
  await expect(page).toHaveURL(/\/g\/rules\?level=2$/);
  await expect(page.getByRole("status")).toContainText("Zoe is now at Level 2.");
  await expect(levelChip).toHaveText("Level 2");
  await page.goto("/g/activity"); // the reason is on the record
  await expect(page.getByText("“She has been careful all month.”")).toBeVisible();
});

test("stopping her rules from her rules page asks first", async ({ page }) => {
  await enter(page, E2E.revokeKey);
  await page.goto("/g/rules");
  await page.getByRole("button", { name: "Stop Zoe's rules" }).click();
  await expect(page.getByText("Stop Zoe's rules now?")).toBeVisible();
  await page.getByRole("button", { name: "Keep them" }).click(); // backing out changes nothing
  await expect(page.getByText("Rules stopped", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Stop Zoe's rules" }).click();
  await page.getByRole("button", { name: "Yes, stop them" }).click();
  await expect(page).toHaveURL(/\/g\/rules\?stopped=wallet-kept$/); // the fake PayPal refuses the wallet delete
  await expect(page.getByRole("status")).toContainText(
    "Rules stopped. PayPal didn't confirm removing the saved wallet — remove Tether in PayPal settings: Settings → Payments → Automatic payments.");
  await expect(page.getByText("Rules stopped", { exact: true })).toBeVisible();
  await expect(page.getByLabel(/Level 1/)).toBeChecked(); // she keeps her level instead of falling to Level 1
  await expect(page.getByRole("button", { name: "Sign and send" })).toBeVisible(); // stopped rules stay stopped until she signs
});

test("at phone width the tabs are a bottom bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const bar = page.locator(".g-tabbar");
  await expect(bar).toBeVisible();
  await expect(page.locator(".g-side")).toBeHidden();
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
  await expect(bar.getByRole("link", { name: /^Home/ })).toContainText("1");
  // On a phone, how her week is going comes straight after what needs her.
  const top = async (name: string) => (await page.getByRole("region", { name }).boundingBox())!.y;
  const needs = await top("Needs you"), week = await top("This week"), recent = await top("Recent");
  expect(needs).toBeLessThan(week);
  expect(week).toBeLessThan(recent);
  await bar.getByRole("link", { name: "Rules" }).click();
  await expect(page).toHaveURL(/\/g\/rules$/);
  await expect(bar.getByRole("link", { name: "Rules" })).toHaveAttribute("aria-current", "page");
});
