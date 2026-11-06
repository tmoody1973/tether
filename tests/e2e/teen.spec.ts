import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./fixtures";

// Zoe's side. Each state-changing test has its own seeded family (fixtures.ts E2E.teen): Level 1, $6 spent at Target.
// The agent's model is a scripted stand-in (src/ai/e2eAgentModel.ts, TETHER_E2E only); Channel3 and PayPal are the fakes.
const open = (page: Page, token: string, path = "") => page.goto(`/t/${token}${path}`);

async function askAgent(page: Page, token: string) {
  await open(page, token, "/shop");
  await page.getByLabel("What are you after?").fill("something for school under $20");
  await page.getByRole("button", { name: "Find options" }).click();
  await expect(page.getByRole("article").first()).toBeVisible({ timeout: 20_000 }); // the first action compiles cold in dev
}

const card = (page: Page, name: RegExp) => page.getByRole("article", { name });

test("agent request shows 2–3 cards each with fits/needs approval/over budget label", async ({ page }) => {
  await askAgent(page, E2E.teen.agent);
  const cards = page.getByRole("article");
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(2);
  expect(n).toBeLessThanOrEqual(3);
  for (let i = 0; i < n; i++) await expect(cards.nth(i)).toContainText(/Fits your week|Needs Amara's OK|Over budget/);
  await expect(card(page, /Notebook.*Target: Fits your week/)).toBeVisible();
  await expect(card(page, /Earbuds.*Best Buy: Needs Amara's OK/)).toBeVisible();
  await expect(card(page, /Running shoes.*Target: Over budget/)).toBeVisible();
  // Shop name only: no offer links, no ratings.
  await expect(page.locator("main a[href^='http']")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/rating|stars|trending/i);
});

test("over-budget cart shows amber sheet with \"$\" remaining and two routes", async ({ page }) => {
  await askAgent(page, E2E.teen.sheet); // its own family: an agent run within 5s of the last is throttled
  await card(page, /Running shoes/).getByRole("link", { name: "Why not?" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Not this time");
  await expect(sheet).toContainText("You've got $14.00 left this week and this is $15.00."); // the arithmetic, once
  await expect(sheet).toContainText("You've spent $6.00 of your $20.00 this week.");
  await expect(sheet).toContainText("$15.00 · Target");
  const routes = sheet.getByRole("link");
  await expect(routes).toHaveCount(2);
  await expect(routes.nth(0)).toHaveText("Ask Amara");
  await expect(routes.nth(1)).toHaveText(/^Wait (until later today|until tomorrow|\d+ days)$/); // to the real ISO-week reset
  // Amber, never red.
  const chip = sheet.locator(".t-chip");
  expect(await chip.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(154, 91, 0)");
});

test("buy a fitting item ⇒ paid, appears in this week", async ({ page }) => {
  await open(page, E2E.teen.buy, "/shop");
  await page.getByLabel("Paste a product link").fill("https://www.target.com/p/notebook/-/sku-500");
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(card(page, /Notebook.*Fits your week/)).toBeVisible();
  await page.getByRole("button", { name: "Buy for $5.00" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${E2E.teen.buy}\\?buy=paid`));
  await expect(page.getByRole("status").first()).toContainText("Paid — Notebook, $5.00 at Target.");
  await expect(page.locator(".t-hero")).toHaveText("$9.00");
  await page.reload();
  await expect(page.getByRole("region", { name: "This week" })).toContainText("Notebook");
});

test("ask Amara ⇒ request appears on Amara's home", async ({ page }) => {
  await open(page, E2E.teen.ask, "/shop");
  await page.getByLabel("Search your shops").fill("earbuds");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await card(page, /Earbuds/).getByRole("link", { name: "Ask Amara" }).click();
  await expect(page.getByText("She'll see that you have $14.00 left this week, and your reason.")).toBeVisible();
  await page.getByLabel("Why (optional)").fill("mine broke");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status").first()).toContainText("Sent. Amara will see it");
  await expect(page.getByText("Waiting for Amara")).toBeVisible();

  await page.goto(`/g/enter/${E2E.teenAskKey}`);
  const req = page.getByRole("link", { name: /Zoe is asking for \$8\.00 at Best Buy/ });
  await expect(req).toBeVisible();
  await expect(req).toContainText("mine broke");
});

test("week ended shows reflection sentence and Nudge button", async ({ page }) => {
  await open(page, E2E.teen.ended);
  await expect(page.getByRole("heading", { name: "Your week's finished." })).toBeVisible();
  await expect(page.getByText(/^Inside your rules 1 of 1 week\. You kept your savings promise 1 of 1\./)).toBeVisible();
  await expect(page.getByText("Your rules end on purpose, so you both get a fresh say.")).toBeVisible();
  await page.getByRole("button", { name: "Nudge Amara" }).click();
  await expect(page.getByRole("status")).toHaveText("Amara has your nudge.");
  await open(page, E2E.teen.ended, "/shop");
  await expect(page.getByRole("button", { name: "Find options" })).toHaveCount(0); // no shopping on ended rules
});

test("unknown token shows a neutral not-found page", async ({ page }) => {
  for (const path of ["/t/not-a-real-teen-token-0000", "/t/not-a-real-teen-token-0000/shop", "/t/x"]) {
    const res = await page.goto(path);
    expect(res?.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(page.getByText("This link doesn't work any more.")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Zoe|Amara|\$\d/);
    await expect(page.getByRole("link")).toHaveCount(0);
  }
});

test("reset link ⇒ old link shows the not-found page", async ({ page }) => {
  await open(page, E2E.teen.reset);
  await expect(page.locator(".t-hero")).toHaveText("$14.00");
  await page.goto(`/g/enter/${E2E.teenResetKey}`);
  await page.getByRole("button", { name: "Reset Zoe's link" }).click();
  await page.getByRole("button", { name: "Yes, reset" }).click();
  await expect(page).toHaveURL(/\/g\?link=reset$/);
  await open(page, E2E.teen.reset);
  await expect(page.getByText("This link doesn't work any more.")).toBeVisible();
  await expect(page.locator(".t-hero")).toHaveCount(0);
});

async function searchShops(page: Page, token: string) {
  await open(page, token, "/shop");
  await page.getByLabel("Search your shops").fill("shoes");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("article").first()).toBeVisible({ timeout: 20_000 });
}

test("buy flash follows the purchase, not the URL: ?buy=paid on a refused cart says nothing was spent", async ({ page }) => {
  await searchShops(page, E2E.teen.sheet);
  const href = await card(page, /Running shoes/).getByRole("link", { name: "Why not?" }).getAttribute("href");
  const refusedId = new URL(href!, "http://x").searchParams.get("sheet");
  await open(page, E2E.teen.sheet, `?buy=paid&p=${refusedId}`);
  await expect(page.getByRole("status").first()).toHaveText("That doesn't fit your rules any more, so nothing was spent.");
  await expect(page.getByText(/^Paid/)).toHaveCount(0);
});

test("R40: Zoe asks $15 with $9.50 left ⇒ Amara approves ⇒ paid, and her week shows $0.00 left", async ({ page }) => {
  await searchShops(page, E2E.teen.over);
  await expect(card(page, /Running shoes.*Over budget/)).toBeVisible();
  await card(page, /Running shoes/).getByRole("link", { name: "Why not?" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Ask Amara" }).click();
  await expect(page.getByText("This week won't count toward Level 2.", { exact: false })).toBeVisible();
  await page.getByLabel("Why (optional)").fill("the ones I have are falling apart");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status").first()).toContainText("Sent. Amara will see it");

  await page.goto(`/g/enter/${E2E.teenOverKey}`);
  await page.getByRole("link", { name: /Zoe is asking for \$15\.00 at Target/ }).click();
  await expect(page.getByText("This would use the rest and $5.50 more.")).toBeVisible();
  await expect(page.getByText("A one-off: this week won't count toward her next level.")).toBeVisible();
  await page.getByRole("button", { name: "Approve $15.00" }).click();
  await expect(page.getByRole("status").first()).toContainText("Approved and paid — $15.00 at Target.");

  await open(page, E2E.teen.over);
  await expect(page.locator(".t-hero")).toHaveText("$0.00");
  await expect(page.getByRole("region", { name: "This week" })).toContainText("Running shoes · Amara approved this one");
});

test("paused rules: a calm page and no shopping", async ({ page }) => {
  await open(page, E2E.teen.paused);
  await expect(page.getByRole("heading", { name: "Amara paused your rules." })).toBeVisible();
  await expect(page.locator(".t-hero")).toHaveCount(0);
  await open(page, E2E.teen.paused, "/shop");
  await expect(page.getByRole("heading", { name: "Amara paused your rules." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Find options|Search|Check it/ })).toHaveCount(0);
});
