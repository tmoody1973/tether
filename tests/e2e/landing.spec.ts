import { expect, test } from "@playwright/test";
import { E2E } from "./fixtures";

test("landing → Open Zoe's view lands on her week", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A parent signs the rules. An AI agent proposes. Code decides. PayPal pays." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Amara's view" })).toHaveAttribute("href", `/g/enter/${E2E.guardianKey}`);
  await page.getByRole("link", { name: "Open Zoe's view" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${E2E.teenToken}$`));
  await expect(page.getByText("Your week")).toBeVisible();
  await expect(page.getByText("left this week")).toBeVisible();
});
