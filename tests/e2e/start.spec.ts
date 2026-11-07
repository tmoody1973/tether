import { expect, test } from "@playwright/test";

// Decision 026, the whole first run through the fake PayPal: landing → Log in with PayPal → name the teen → Home's
// checklist → save PayPal → sign the first rules → send the link → the teen's link opens her week.
test("start your own family with Log in with PayPal, through to the teen's first screen", async ({ page, context }) => {
  test.setTimeout(300_000); // seven pages and routes compile cold in dev
  await page.goto("/");
  await page.locator(".l-start").getByRole("link", { name: "Log in with PayPal" }).click();

  await expect(page).toHaveURL(/\/g\/start\/teen$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Welcome, Amara." })).toBeVisible();
  await page.getByLabel("Your teen's first name").fill("Zoe");
  await page.getByLabel("Zoe's age").fill("15");
  await page.getByLabel("I'm Zoe's parent or guardian").check();
  await page.getByRole("button", { name: "Create our family" }).click();

  await expect(page).toHaveURL(/\/g\?started=1$/, { timeout: 60_000 });
  await expect(page.getByText("Your family is set up. Three steps and Zoe can start.")).toBeVisible();
  const checklist = page.locator("section", { has: page.getByRole("heading", { name: "Get Zoe started" }) });
  await expect(checklist.getByText("0 of 3 done")).toBeVisible();
  await expect(checklist.getByText("Level 1: $20 a week at Best Buy and Target. Over $10 asks you first.")).toBeVisible();
  await expect(page.getByText("Next time, Log in with PayPal.")).toBeVisible();
  await expect(page.getByText(/This family is removed on/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset demo" })).toHaveCount(0); // that stays with the shared family

  await checklist.getByRole("link", { name: "Save your PayPal" }).click(); // fake vault: approve and straight back
  await expect(page).toHaveURL(/\/g\?paypal=connected$/, { timeout: 60_000 });
  await expect(checklist.getByText("1 of 3 done")).toBeVisible();
  await expect(checklist.getByText("PayPal saved")).toBeVisible();

  await checklist.getByRole("link", { name: "Sign the rules" }).click();
  await expect(page).toHaveURL(/\/g\/rules$/, { timeout: 60_000 });
  await expect(page.getByLabel(/Level 1/)).toBeChecked();
  await page.getByRole("button", { name: "Sign and send" }).click();
  await page.getByRole("button", { name: "Yes, sign" }).click();
  await expect(page).toHaveURL(/\/g\?signed=1$/, { timeout: 60_000 });
  await expect(checklist.getByText("2 of 3 done")).toBeVisible();

  await checklist.getByRole("link", { name: "Send the link" }).click();
  await expect(page).toHaveURL(/\/g\/send-link$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Send Zoe the link" })).toBeVisible();
  await expect(page.getByRole("img", { name: "QR code for Zoe's link" })).toBeVisible();
  const link = await page.locator("#teen-link").inputValue();
  expect(link).toMatch(/^http:\/\/localhost:\d+\/t\/[A-Za-z0-9_-]{32}$/);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/g$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Get Zoe started" })).toHaveCount(0); // all three done: Home as usual

  const zoe = await context.newPage();
  await zoe.goto(link);
  await expect(zoe.getByText("left this week")).toBeVisible({ timeout: 60_000 });
  await expect(zoe.getByText("$20.00").first()).toBeVisible();
});

test("signed out: the page offers Log in with PayPal, and a cancelled login says so calmly", async ({ page }) => {
  await page.goto("/g?login=cancelled");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText("You left PayPal before signing in. Nothing changed.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/g/login/paypal");
  await expect(page.getByRole("link", { name: "Log in with PayPal" })).toBeVisible();
});
