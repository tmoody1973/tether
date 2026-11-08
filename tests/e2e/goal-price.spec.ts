import { expect, test } from "@playwright/test";
import { E2E } from "./fixtures";

// Decision 031: her goal at today's price from Channel3 (fake), in sentences, and "sets back" on cards before buying.
test("Goals shows today's price, how far it moved, and where it sits in 90 days", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/t/${E2E.goalPriceTeen}/goals`);
  await expect(page.getByTestId("goal-price")).toHaveText(
    "$149.99 today, $20.00 less than when you picked it. That's 10 weeks closer. Today's price is low for the last 90 days.");
  await expect(page.locator(".t-hero")).toHaveText("58"); // ($149.99 − $34) / $2 a week, rounded up
  await expect(page.getByText("of $149.99")).toBeVisible();
});

test("a suggestion card says what buying it does to her goal, before she buys", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/t/${E2E.goalPriceTeen}/shop`);
  await page.getByLabel("Paste a product link").fill("https://www.target.com/p/notebook/-/sku-500");
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(page.getByTestId("sets-back")).toHaveText("This sets Space headphones back 3 weeks."); // $5 at $2 a week
  await expect(page.getByRole("button", { name: "Buy for $5.00" })).toBeVisible();
});

test("Amara's Savings page shows the same fact", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/g/enter/${E2E.goalPriceKey}`);
  await page.goto("/g/savings");
  await expect(page.getByTestId("goal-price")).toHaveText(
    "$149.99 today, $20.00 less than when Zoe picked it. That's 10 weeks closer. Today's price is low for the last 90 days.");
});
