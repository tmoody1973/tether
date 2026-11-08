import { expect, test, type Page } from "@playwright/test";

// Task 20: the hosted demo, end to end, against REAL sandbox PayPal, Channel3, Anthropic and Alpaca.
//   LIVE_BASE_URL=https://<host> pnpm e2e --project=live
// Skips itself unless LIVE_BASE_URL is set. Not run in the local suite. It drives the shared demo through the landing page's
// own buttons (no keys needed) and starts with "Reset demo", so it assumes the hosted demo is seeded (scripts/seed.ts).
// The agent is the real model, so cards vary: the tests pick whichever card fits the step rather than a fixed product.
test.skip(!process.env.LIVE_BASE_URL, "LIVE_BASE_URL is not set; live specs run only against a deployed demo");
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

/** Demo controls fold on Home and keep their open state across a reset; clicking the summary blindly can close them. */
async function openDemoControls(page: Page) {
  const details = page.locator("details", { has: page.getByText("Demo controls") });
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await page.getByText("Demo controls").click();
}

async function resetDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Open Amara's view" }).first().click();
  await expect(page).toHaveURL(/\/g$/);
  await page.goto("/g/settings"); // Reset demo lives in Settings (decision 028)
  await page.getByRole("button", { name: "Reset demo" }).click();
  await page.getByRole("button", { name: "Yes, reset the demo" }).click();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

test("landing → Zoe's view → shop agent cards → Amara approves the waiting over-budget ask → paid", async ({ page }) => {
  await resetDemo(page);

  await page.goto("/");
  await page.getByRole("link", { name: "Open Zoe's view" }).first().click();
  await expect(page).toHaveURL(/\/t\/[^/]+$/);
  await expect(page.getByText("left this week")).toBeVisible();

  // Real agent: cards come back from Zoe's own shops, each labelled by the rule engine. Which items the model
  // picks varies, so this step only proves the agent works; the approve-and-pay step below uses the over-budget
  // ask the seed (and every reset) leaves waiting for Amara, which is always approvable.
  await page.getByRole("link", { name: "Shop" }).first().click();
  await page.getByLabel("What are you after?").fill("a good pair of running shoes");
  await page.getByRole("button", { name: "Find options" }).click();
  const cards = page.getByRole("article");
  await expect(cards.first()).toBeVisible({ timeout: 60_000 });
  await expect(cards.filter({ hasText: /Fits your week|Needs Amara's OK|Over budget|Not this time/ }).first()).toBeVisible();

  // Amara approves in one tap; the real sandbox PayPal charge is captured.
  await page.goto("/");
  await page.getByRole("link", { name: "Open Amara's view" }).first().click();
  await page.getByRole("link", { name: /Zoe is asking for/ }).first().click();
  await page.getByRole("button", { name: /^Approve \$/ }).click();
  await expect(page.getByRole("status").first()).toContainText(/Approved and paid/, { timeout: 60_000 });

  // The receipt is in the record (the PayPal webhook then confirms the capture).
  await page.goto("/g/activity");
  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  await expect(page.getByText("You approved", { exact: true }).first()).toBeVisible();
});

test("month end → Level 3 → Zoe proposes a fund → Amara approves → investment queued or filled", async ({ page }) => {
  await resetDemo(page);

  // End of month, then Zoe is at Level 3 with rules in force (the demo family is seeded at Level 2). The month end may
  // promote her itself and may leave her rules ended, so this asserts the end state, not which buttons got her there.
  await openDemoControls(page);
  await page.getByRole("button", { name: "Advance to end of month" }).click();
  // The action's visible result: Home's "clock moved" flash, or Activity's "check-in ran" after a promotion.
  await expect(page.getByRole("status").first())
    .toContainText(/Demo clock moved forward to the end of the month\.|The month closed and the check-in ran\./, { timeout: 60_000 });

  await page.goto("/g/rules");
  await expect(page.getByRole("heading", { level: 1, name: "Zoe's rules" })).toBeVisible();
  const signNow = page.getByRole("button", { name: "Sign and send" }); // only shown when no rules are in force
  if (!(await page.getByLabel(/^Level 3/).isChecked())) {
    // Not there yet: in force ⇒ reason, Move, Yes; ended ⇒ reason, Sign and send, Yes.
    await page.getByLabel(/^Level 3/).check();
    await page.getByLabel(/It goes on the record\./).fill("Careful all month; ready to look at investing.");
    await page.getByRole("button", { name: /^(Move Zoe to Level 3|Sign and send)$/ }).click();
    await page.getByRole("button", { name: /^(Yes, move her|Yes, sign)$/ }).click();
    await expect(page.getByRole("status").first()).toContainText(/Zoe is now at Level 3\.|Signed\. Rules v\d+ are in force now\./);
    await page.goto("/g/rules");
  } else if (await signNow.isVisible()) {
    // Already Level 3 but her rules ended at the month end: sign them again so she can propose.
    await signNow.click();
    await page.getByRole("button", { name: "Yes, sign" }).click();
    await expect(page).toHaveURL(/\/g\?signed=\d+$/);
    await page.goto("/g/rules");
  }
  // End state: Level 3, rules in force.
  await expect(page.locator(".g-section__head .g-chip", { hasText: /^Level \d$/ })).toHaveText("Level 3");
  await expect(page.getByText(/^In force until /)).toBeVisible();

  // The promotion released her savings to her (decision 007), so nothing is left to invest yet. Close her first Level 3
  // week: what she didn't spend becomes fresh savings, and that is what she invests.
  await page.goto("/g");
  await openDemoControls(page);
  await page.getByRole("button", { name: "Advance to end of week" }).click();
  await expect(page.getByRole("status").first()).toContainText(/Demo clock moved forward/, { timeout: 60_000 });

  // Zoe proposes $5 in VTI (already on Amara's investing list in the seeded grant).
  await page.goto("/");
  await page.getByRole("link", { name: "Open Zoe's view" }).first().click();
  await expect(page).toHaveURL(/\/t\/([^/]+)$/);
  const teenHome = page.url();
  await page.goto(`${teenHome}/invest/VTI`);
  await page.getByLabel("Why this one?").fill("Lots of companies in one fund");
  await page.getByLabel("What would make you sell it?").fill("If I needed it for college");
  await page.getByLabel("How would you feel if this dropped by a third next year?").fill("Nervous, but I'd wait");
  await page.getByLabel("How much, in dollars?").fill("5");
  await page.getByRole("button", { name: "Propose to Amara" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Sent. Amara will see your answers");

  // Amara approves; the sandbox Alpaca deposit and order go through.
  await page.goto("/");
  await page.getByRole("link", { name: "Open Amara's view" }).first().click();
  await page.getByRole("link", { name: /Zoe proposes investing \$5\.00 in VTI/ }).click();
  await page.getByRole("button", { name: "Approve $5.00" }).click();
  await expect(page.getByRole("main").getByRole("status").first()).toContainText(/Queued for market open|Bought|Filled/i, { timeout: 90_000 });

  await page.goto(`${teenHome}/invest`);
  await expect(page.getByRole("region", { name: "Your investments" })).toContainText(/VTI/);
});

test("demo Settings points to adding several teens (read-only: the shared demo has one teen)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Open Amara's view" }).first().click();
  await expect(page).toHaveURL(/\/g$/);
  await page.goto("/g/settings");
  const teens = page.locator("section[aria-labelledby='teens-h']");
  await expect(teens.getByText("Several teens?")).toBeVisible();
  await expect(teens.getByRole("link", { name: "Start your own family" })).toHaveAttribute("href", "/g/login/paypal");
});
