import { expect, test } from "@playwright/test";
import { E2E } from "./fixtures";

// A Proof opened while PayPal is still being checked stays open when the answer arrives: only its "Checked against
// PayPal" line updates (the whole list used to be redrawn, closing it: a flaky test and a real annoyance).
test("a Proof opened before the PayPal check finishes stays open after it", async ({ page }) => {
  await page.goto(`/g/enter/${E2E.guardianKey}`);
  // Don't wait for the whole page: it streams, and finishes only once PayPal has answered. Act as soon as the list is there.
  await page.goto("/g/activity", { waitUntil: "commit" });
  const row = page.locator(".g-rows > li").filter({ has: page.locator("summary", { hasText: /^Proof for \$6\.00 at Target, / }) }).first();
  await row.locator("summary").click();
  const proof = row.locator("details.g-proof");
  await expect(proof).toHaveAttribute("open", "");
  await expect(row.locator("dd", { hasText: "Checking with PayPal…" })).toBeVisible(); // the check hadn't finished (the fake takes 2.5 s)
  await expect(row.locator("dd", { hasText: "Matches PayPal" })).toBeVisible({ timeout: 15_000 });
  await expect(proof).toHaveAttribute("open", ""); // still open: nothing was redrawn
  await expect(row.getByText(E2E.receiptCapture)).toBeVisible();
});
