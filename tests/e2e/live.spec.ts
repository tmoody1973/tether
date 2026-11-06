import { expect, test, type Page } from "@playwright/test";

// Task 20: the hosted demo, end to end, against REAL sandbox PayPal, Channel3, Anthropic and Alpaca.
//   LIVE_BASE_URL=https://<host> pnpm e2e --project=live
// Skips itself unless LIVE_BASE_URL is set. Not run in the local suite. It drives the shared demo through the landing page's
// own buttons (no keys needed) and starts with "Reset demo", so it assumes the hosted demo is seeded (scripts/seed.ts).
// The agent is the real model, so cards vary: the tests pick whichever card fits the step rather than a fixed product.
test.skip(!process.env.LIVE_BASE_URL, "LIVE_BASE_URL is not set; live specs run only against a deployed demo");
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

async function resetDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Open Amara's view" }).click();
  await expect(page).toHaveURL(/\/g$/);
  await page.getByText("Demo controls").click(); // folded on Home
  await page.getByRole("button", { name: "Reset demo" }).click();
  await page.getByRole("button", { name: "Yes, reset the demo" }).click();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

test("landing → Zoe's view → shop agent cards → Amara approves the waiting over-budget ask → paid", async ({ page }) => {
  await resetDemo(page);

  await page.goto("/");
  await page.getByRole("link", { name: "Open Zoe's view" }).click();
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
  await page.getByRole("link", { name: "Open Amara's view" }).click();
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

  // End of month, then Amara moves Zoe to Level 3 (the demo family is seeded at Level 2).
  await page.getByText("Demo controls").click();
  await page.getByRole("button", { name: "Advance to end of month" }).click();
  await expect(page).toHaveURL(/\?(advanced=endOfMonth|promoted=1)$/, { timeout: 60_000 }); // wait for the clock to move
  await page.goto("/g/rules");
  await expect(page.getByRole("heading", { level: 1, name: "Zoe's rules" })).toBeVisible();
  // Rules in force: the level change path (reason, Move, Yes). Ended after the month: the signing path (reason, Sign, Yes).
  await page.getByLabel("Level 3").check();
  await page.getByLabel(/It goes on the record\./).fill("Careful all month; ready to look at investing.");
  await page.getByRole("button", { name: /^(Move Zoe to Level 3|Sign and send)$/ }).click();
  await page.getByRole("button", { name: /^(Yes, move her|Yes, sign)$/ }).click();
  await expect(page.getByRole("status").first()).toContainText(/Zoe is now at Level 3\.|Signed\. Rules v\d+ are in force now\./);

  // Zoe proposes $5 in VTI (already on Amara's fund list in the seeded grant).
  await page.goto("/");
  await page.getByRole("link", { name: "Open Zoe's view" }).click();
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
  await page.getByRole("link", { name: "Open Amara's view" }).click();
  await page.getByRole("link", { name: /Zoe proposes investing \$5\.00 in VTI/ }).click();
  await page.getByRole("button", { name: "Approve $5.00" }).click();
  await expect(page.getByRole("main").getByRole("status").first()).toContainText(/Queued for market open|Bought|Filled/i, { timeout: 90_000 });

  await page.goto(`${teenHome}/invest`);
  await expect(page.getByRole("region", { name: "Your investments" })).toContainText(/VTI/);
});
