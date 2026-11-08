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

// Decision 028: a parent with several teens. Two teens in one teen form; the teen switcher shows both with what's waiting
// on each, so an ask from Maya shows while Amara is on Zoe; switching keeps the tab; Settings adds a third through Log
// in with PayPal again. Six menu items on a desktop; on a phone five tabs, a Settings gear and the switcher, no sideways scroll.
test("several teens: two at onboarding, the switcher with counts, same-tab switching, add one more, fits a phone", async ({ page, context }) => {
  test.setTimeout(300_000);
  const shots = (name: string) => test.info().outputPath(name);
  const hideDevBadge = () => page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const side = page.locator(".g-side");
  const nav = side.getByRole("list");
  const switcher = (where: "side" | "top") => page.locator(where === "side" ? ".g-side .g-switcher" : ".g-topbar .g-switcher");
  const switchButton = (where: "side" | "top" = "side") => switcher(where).getByRole("button", { name: /^Teen: / });

  // Onboarding: Zoe and Maya in one go.
  await page.goto("/g/login/paypal");
  await expect(page).toHaveURL(/\/g\/start\/teen$/, { timeout: 60_000 });
  await page.getByLabel("Your teen's first name").fill("Zoe");
  await page.getByLabel("Zoe's age").fill("15");
  await page.getByRole("button", { name: "+ Add another teen" }).click();
  await expect(page.getByLabel("Teen 2's first name")).toBeFocused();
  await page.getByLabel("Teen 2's first name").fill("Maya");
  await page.getByLabel("Maya's age").fill("13");
  await page.getByLabel("I'm Zoe and Maya's parent or guardian").check();
  await expect(page.getByText("Tether does not hold money or create a savings account.", { exact: false })).toBeVisible();
  await hideDevBadge();
  await page.screenshot({ path: shots("onboarding-two-teens.png"), fullPage: true });
  await page.getByRole("button", { name: "Create our family" }).click();
  await expect(page).toHaveURL(/\/g\?started=1&teens=2$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Zoe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Get Zoe started" })).toBeVisible();

  // Six items in the sidebar.
  await expect(nav.getByRole("link")).toHaveText([/^Home/, "Zoe's rules", "Savings", "Investing", "Activity", "Settings"]);

  // The switcher: Maya's three first-run steps show while on Zoe; Escape closes it and puts focus back.
  await expect(switchButton()).toContainText("3 waiting for your other teens");
  await switchButton().click();
  await expect(switchButton()).toHaveAttribute("aria-expanded", "true");
  const pop = switcher("side").locator(".g-switcher__pop");
  await expect(pop.locator("[aria-current=true]")).toContainText("Zoe");
  await expect(pop.getByRole("button", { name: /^Switch to Maya/ })).toContainText("3 waiting");
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
  await expect(switchButton()).toBeFocused();

  // Switching from Zoe's rules lands on Maya's rules.
  await nav.getByRole("link", { name: "Zoe's rules" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Zoe's rules" })).toBeVisible({ timeout: 60_000 });
  await switchButton().click();
  await pop.getByRole("button", { name: /^Switch to Maya/ }).click();
  await expect(page).toHaveURL(/\/g\/rules$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Maya's rules" })).toBeVisible();

  // Maya's first run, so her Home count is her asks, then an ask from Maya's side.
  await nav.getByRole("link", { name: /^Home/ }).click();
  const checklist = page.locator("section", { has: page.getByRole("heading", { name: "Get Maya started" }) });
  await checklist.getByRole("link", { name: "Save your PayPal" }).click();
  await expect(page).toHaveURL(/\/g\?paypal=connected$/, { timeout: 60_000 });
  await checklist.getByRole("link", { name: "Sign the rules" }).click();
  await page.getByRole("button", { name: "Sign and send" }).click();
  await page.getByRole("button", { name: "Yes, sign" }).click();
  await expect(page).toHaveURL(/\/g\?signed=1$/, { timeout: 60_000 });
  await checklist.getByRole("link", { name: "Send the link" }).click();
  const mayaLink = await page.locator("#teen-link").inputValue();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/g$/, { timeout: 60_000 });

  const maya = await context.newPage();
  await maya.goto(`${mayaLink}/map`);
  await maya.getByLabel("Find the shop").fill("etsy");
  await maya.getByRole("button", { name: "Search" }).click();
  await maya.getByRole("group", { name: "Shops named etsy" }).getByRole("radio", { name: "Etsy" }).check({ timeout: 30_000 });
  await maya.getByLabel("Why this shop?").fill("art supplies");
  await maya.getByRole("button", { name: "Suggest to Amara" }).click();
  await expect(maya.getByRole("main").getByRole("status")).toHaveText("Sent. Amara will see your suggestion for etsy.com.");
  await maya.close();

  // Back to Zoe (from Home: Home again, with a note); Maya's ask shows on the switcher.
  await page.reload();
  await switchButton().click();
  await pop.getByRole("button", { name: /^Switch to Zoe/ }).click();
  await expect(page).toHaveURL(/\/g\?switched=1$/, { timeout: 60_000 });
  await expect(page.getByText("Now showing Zoe.")).toBeVisible();
  await expect(switchButton()).toContainText("1 waiting for your other teens");
  await switchButton().click();
  await expect(pop.getByRole("button", { name: /^Switch to Maya/ })).toContainText("1 waiting");
  await hideDevBadge();
  await page.screenshot({ path: shots("switcher-open-desktop.png") });
  await page.keyboard.press("Escape");

  // Settings: the full list, and adding one more teen through PayPal again.
  await nav.getByRole("link", { name: "Settings" }).click();
  const teens = page.getByRole("region", { name: "Your teens" });
  await expect(teens.getByText("Zoe", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(teens.getByRole("button", { name: "Switch to Maya" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send Zoe her link" })).toBeVisible(); // her link lives here
  await teens.getByRole("link", { name: "Add another teen" }).click();
  await expect(page).toHaveURL(/\/g\/start\/teen$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Add another teen" })).toBeVisible();
  await page.getByLabel("Your teen's first name").fill("Kofi");
  await page.getByLabel("Kofi's age").fill("14");
  await page.getByLabel("I'm Kofi's parent or guardian").check();
  await page.getByRole("button", { name: "Add to our family" }).click(); // straight after: the hourly limit doesn't apply to adding
  await expect(page).toHaveURL(/\/g\?started=added$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Kofi" })).toBeVisible();

  // Savings: Kofi's own page, with what "savings" means.
  await nav.getByRole("link", { name: "Savings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kofi's savings" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("region", { name: "Promised to Kofi" })).toContainText("Tether has not reserved or transferred this money.");
  await expect(page.getByText("Tether tracks allowance and savings promises. It doesn't hold or set aside money.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "What happens if I change the amount or stop?" })).toHaveAttribute("href", "/g/rules");
  await expect(page.getByRole("link", { name: "Statement" })).toHaveAttribute("href", "/g/statement");
  await expect(page.getByRole("main")).not.toContainText(/stays in your PayPal|withdraw/i);
  await expect(nav.getByRole("link", { name: "Savings" })).toHaveAttribute("aria-current", "page");

  // A phone: five tabs, a Settings gear, the switcher at the top, nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  const bar = page.locator(".g-tabbar");
  for (const path of ["/g", "/g/settings", "/g/savings", "/g/rules"]) {
    await page.goto(path);
    await expect(bar).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(390);
  }
  await expect(bar.getByRole("link")).toHaveText([/^Home/, "Rules", "Savings", "Investing", "Activity"]);
  for (const [scroll, client] of await bar.getByRole("link").evaluateAll((ls) => ls.map((a) => [a.scrollWidth, a.clientWidth]))) {
    expect(scroll).toBeLessThanOrEqual(client); // no label cut off
  }
  const gear = page.locator(".g-topbar").getByRole("link", { name: "Settings" });
  await expect(gear).toBeVisible();
  const box = (await gear.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await hideDevBadge();
  await bar.screenshot({ path: shots("tabbar-390.png") });
  await switchButton("top").click();
  const phonePop = switcher("top").locator(".g-switcher__pop");
  await expect(phonePop).toBeVisible();
  const popBox = (await phonePop.boundingBox())!;
  expect(popBox.x + popBox.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: shots("switcher-open-390.png") });
  await phonePop.getByRole("button", { name: /^Switch to Zoe/ }).click(); // from Rules: Zoe's Rules
  await expect(page).toHaveURL(/\/g\/rules$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Zoe's rules" })).toBeVisible();
  await gear.click();
  await expect(page).toHaveURL(/\/g\/settings$/, { timeout: 60_000 });
  await page.screenshot({ path: shots("settings-390.png") });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: shots("settings-desktop.png"), fullPage: true });

  // The teen form on a phone, two rows.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/g/login/paypal?add=1");
  await page.getByRole("button", { name: "+ Add another teen" }).click();
  await page.getByLabel("Your teen's first name").fill("Ada");
  await page.getByLabel("Teen 2's first name").fill("Ben");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await hideDevBadge();
  await page.screenshot({ path: shots("onboarding-two-teens-390.png"), fullPage: true });
});
