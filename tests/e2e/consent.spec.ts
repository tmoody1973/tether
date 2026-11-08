import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./fixtures";

// Decision 030: Amara chooses how Zoe spends, and can pause spending at once. Each test has its own family.
const enter = (page: Page, key: string) => page.goto(`/g/enter/${key}`);
const card = (page: Page, name: RegExp) => page.getByRole("article", { name });

test("'Ask me before every purchase' → a $1 cart asks Amara", async ({ page }) => {
  test.setTimeout(90_000); // cold dev compile of several pages
  await enter(page, E2E.consentKey);
  await page.goto("/g/rules");
  await page.getByLabel("Ask me before every purchase").check();
  await page.getByRole("button", { name: "Apply" }).first().click();
  await expect(page.getByText("What comes to you first for Zoe changes from over $10.00, or a shop she hasn't used to every purchase, starting now.")).toBeVisible();
  await page.getByRole("button", { name: "Yes, change it" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved\./ })).toBeVisible();
  await page.goto(`/t/${E2E.consentTeen}/shop`);
  await page.getByLabel("Paste a product link").fill("https://www.target.com/p/pencil/-/sku-100");
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(card(page, /\$1\.00 at Target: Needs Amara's OK/)).toBeVisible();
  // Review LOW 6: the fake catalogue's photo host doesn't exist, so the card shows the same-size placeholder, no broken image.
  await expect(card(page, /\$1\.00 at Target/).locator(".t-photo--none")).toBeVisible();
  await expect(card(page, /\$1\.00 at Target/).locator("img")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ask Amara" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Buy for/ })).toHaveCount(0);
});

test("pause → Zoe sees 'Paused by Amara' and can only ask; resume puts Buy back", async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page, E2E.pauseKey);
  await page.goto("/g/rules");
  await page.getByRole("button", { name: "Pause Zoe's spending" }).click();
  await expect(page.getByText(/^Pause Zoe's spending now\? Nothing is bought without your OK until you resume\./)).toBeVisible();
  await page.getByRole("button", { name: "Yes, pause" }).click();
  await expect(page.getByText(/^Zoe's spending is paused since /)).toBeVisible();

  await page.goto(`/t/${E2E.pauseTeen}`);
  await expect(page.getByTestId("paused")).toHaveText(/^Paused by Amara\./);
  await page.goto(`/t/${E2E.pauseTeen}/shop`);
  await expect(page.getByTestId("paused")).toBeVisible();
  await page.getByLabel("Paste a product link").fill("https://www.target.com/p/notebook/-/sku-500");
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(card(page, /Paused by Amara/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Ask Amara" })).toBeVisible();

  await page.goto("/g/rules");
  await page.getByRole("button", { name: "Resume Zoe's spending" }).click();
  await expect(page.getByRole("button", { name: "Pause Zoe's spending" })).toBeVisible();
  await page.goto(`/t/${E2E.pauseTeen}/shop`);
  await expect(page.getByTestId("paused")).toHaveCount(0);
  await page.getByLabel("Paste a product link").fill("https://www.target.com/p/notebook/-/sku-500");
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(card(page, /Notebook.*Fits your week/)).toBeVisible();
});

test("rules stopped on 'every purchase': picking 'Up to $20' and a tax changes the clause she'll sign (review NEW-1)", async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page, E2E.clauseKey);
  await page.goto("/g/rules");
  const clause = page.locator(".g-clause");
  await expect(clause).toContainText("Every purchase comes to you first.");
  await page.getByLabel(/^Up to/).check();
  await page.getByLabel("Dollars per purchase without asking").fill("20");
  await expect(clause).toContainText("Anything over $20.00, or at a shop she hasn't used before, comes to you first.");
  await expect(clause).not.toContainText("Every purchase comes to you first.");
  await page.getByLabel(/Sales tax where you live/).fill("8.25");
  await expect(clause).toContainText("8.25% sales tax and $5.99 shipping an order");
  await page.getByRole("button", { name: "Sign and send" }).click();
  await page.getByRole("button", { name: "Yes, sign" }).click();
  await expect(page).toHaveURL(/\/g\?signed=2$/);
  await page.goto("/g/rules");
  await expect(page.locator(".g-clause")).toContainText("Anything over $20.00, or at a shop she hasn't used before, comes to you first."); // as signed
});
