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
  // Review L9: a family started with PayPal reads the teen's name, not "her".
  await expect(page.getByRole("heading", { name: "Zoe's rules at a glance" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Change Zoe's rules" })).toBeVisible();
  await expect(page.getByText("what Zoe didn't spend counts as saved", { exact: false })).toBeAttached();

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

// Decision 028: a parent with several teens. Start a family, add a second teen through Log in with PayPal again, switch
// back and forth in Settings; each teen's rules page is that teen's. The menu has five items and fits a 390px phone.
test("several teens: add a second teen, switch between them, five menu items that fit a phone", async ({ page }) => {
  test.setTimeout(300_000);
  const nav = page.getByRole("navigation", { name: "Main" }).first();
  const startTeen = async (name: string, age: string) => {
    await page.getByLabel("Your teen's first name").fill(name);
    await page.getByLabel(`${name}'s age`).fill(age);
    await page.getByLabel(`I'm ${name}'s parent or guardian`).check();
    await page.getByRole("button", { name: "Create our family" }).click();
  };
  const rulesSay = async (name: string) => {
    await nav.getByRole("link", { name: `${name}'s rules` }).click();
    await expect(page).toHaveURL(/\/g\/rules$/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { level: 1, name: `${name}'s rules` })).toBeVisible();
  };
  const teens = page.getByRole("region", { name: "Your teens" });

  await page.goto("/g/login/paypal");
  await expect(page).toHaveURL(/\/g\/start\/teen$/, { timeout: 60_000 });
  await startTeen("Zoe", "15");
  await expect(page).toHaveURL(/\/g\?started=1$/, { timeout: 60_000 });

  for (const name of [/^Home/, "Zoe's rules", "Investing", "Activity", "Settings"]) await expect(nav.getByRole("link", { name })).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(5);
  await nav.getByRole("link", { name: "Investing" }).click();
  await expect(page).toHaveURL(/\/g\/invest$/, { timeout: 60_000 });
  await expect(nav.getByRole("link", { name: "Investing" })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/g\/settings$/, { timeout: 60_000 });
  await expect(teens.getByText("Zoe", { exact: true })).toBeVisible();
  await expect(teens.getByText("Open now")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send Zoe her link" })).toBeVisible(); // her link moved here from Rules
  await teens.getByRole("link", { name: "Add another teen" }).click(); // PayPal again, the same parent

  await expect(page).toHaveURL(/\/g\/start\/teen$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Add another teen" })).toBeVisible();
  await startTeen("Kofi", "14"); // straight after Zoe: the one-per-browser-hour limit doesn't apply to adding a teen
  await expect(page).toHaveURL(/\/g\?started=added$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Kofi" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Get Kofi started" })).toBeVisible(); // his own first-run checklist
  await rulesSay("Kofi");

  for (const [to, from] of [["Zoe", "Kofi"], ["Kofi", "Zoe"], ["Zoe", "Kofi"]]) {
    await nav.getByRole("link", { name: "Settings" }).click();
    await expect(teens.getByRole("button", { name: `Switch to ${from}` })).toHaveCount(0); // the one she's on is marked, not a button
    await teens.getByRole("button", { name: `Switch to ${to}` }).click();
    await expect(page).toHaveURL(/\/g\?switched=1$/, { timeout: 60_000 });
    await expect(page.getByText(`Now showing ${to}.`)).toBeVisible();
    await rulesSay(to);
  }

  // A phone: the five tabs fit, nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  const bar = page.locator(".g-tabbar");
  for (const path of ["/g", "/g/settings"]) {
    await page.goto(path);
    await expect(bar).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
  for (const name of [/^Home/, "Rules", "Investing", "Activity", "Settings"]) await expect(bar.getByRole("link", { name })).toBeInViewport();
  const widths = await bar.getByRole("link").evaluateAll((links) => links.map((a) => [a.scrollWidth, a.clientWidth]));
  expect(widths).toHaveLength(5);
  for (const [scroll, client] of widths) expect(scroll).toBeLessThanOrEqual(client); // no label cut off
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // the dev badge, for the screenshots only
  await page.screenshot({ path: test.info().outputPath("settings-390.png") });
  await bar.screenshot({ path: test.info().outputPath("tabbar-390.png") });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: test.info().outputPath("settings-desktop.png"), fullPage: true });
});
