import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./fixtures";

/** Signs in as one seeded family's guardian. State-changing tests each use their own family (fixtures.ts). */
const enter = (page: Page, key: string = E2E.guardianKey) => page.goto(`/g/enter/${key}`);

test("no cookie ⇒ neutral page, no data", async ({ page }) => {
  for (const path of ["/g", "/g/grant", "/g/record", "/g/review", "/g/invest", `/g/requests/${E2E.approvalId}`, "/g/enter/not-a-real-key"]) {
    await page.goto(path);
    await expect(page.getByText("Open your Tether link to continue.")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Zoe|Amara|\$\d/); // no names, no money
    await expect(page.getByRole("link")).toHaveCount(0); // no navigation either
  }
  expect((await page.context().cookies()).find((c) => c.name === "tether_g")).toBeUndefined();
  const api = await page.request.post("/api/g/ask", { data: { question: "what did she buy?" } });
  expect(api.status()).toBe(401);
});

test("entry link sets cookie and lands on home", async ({ page, context }) => {
  await enter(page);
  await expect(page).toHaveURL(/\/g$/); // the key leaves the address bar
  const cookie = (await context.cookies()).find((c) => c.name === "tether_g");
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  await expect(page.getByRole("heading", { level: 1, name: "Zoe" })).toBeVisible();
  await expect(page.getByText("Level 1", { exact: true }).first()).toBeVisible();
});

test("home shows this week and what needs you", async ({ page }) => {
  await enter(page);
  await expect(page.getByText("$10.50 of $20.00").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Zoe is asking for \$15\.00 at Target/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Advance to end of week" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Advance to end of month" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send Zoe her link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Advance 1 day" })).toBeVisible();
  await page.getByRole("button", { name: "Reset Zoe's link" }).click(); // asks first
  await expect(page.getByRole("button", { name: "Yes, reset" })).toBeVisible();
  await page.getByRole("button", { name: "Keep it" }).click();
  await page.getByRole("button", { name: "Send Zoe her link" }).click();
  await expect(page.getByLabel("Zoe's link")).toHaveValue(new RegExp(`/t/${E2E.teenToken}$`));
});

test("guardian signs grant, sees plain-words clause", async ({ page }) => {
  await enter(page, E2E.grantKey);
  await page.goto("/g/grant");
  await expect(page.getByRole("heading", { level: 1, name: "Grant Zoe authority" })).toBeVisible();
  const clause = page.locator(".g-clause");
  await expect(clause).toContainText("In plain words");
  await expect(clause).toContainText(/Zoe can spend up to \$20\.00 a week at (Best Buy and Target|Target and Best Buy)\./);
  await expect(clause).toContainText("Anything over $10.00, or at a shop she hasn't used before, comes to you first.");
  expect(await clause.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Georgia/);

  await page.getByLabel("Zoe saves at least").selectOption("20");
  await expect(clause).toContainText("She saves at least $4.00 a week"); // live preview

  await page.getByRole("button", { name: "Sign and send" }).click();
  await page.getByRole("button", { name: "Yes, sign" }).click();
  await expect(page).toHaveURL(/\/g\?signed=2$/);
  await expect(page.getByRole("status").first()).toContainText("Signed. Rules v2 are in force now.");

  await page.goto("/g/grant");
  await expect(page.getByLabel("Zoe saves at least")).toHaveValue("20");
  await expect(page.locator(".g-clause")).toContainText("She saves at least $4.00 a week");
});

test("a request shows the budget consequence first", async ({ page }) => {
  await enter(page);
  await page.getByRole("link", { name: /Zoe is asking for \$15\.00 at Target/ }).click();
  await expect(page).toHaveURL(new RegExp(`/g/requests/${E2E.approvalId}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Zoe is asking for $15.00 at Target");
  await expect(page.getByText("She has $9.50 left this week. This would use the rest and $5.50 more.")).toBeVisible();
  await expect(page.locator(".g-reason")).toHaveText("“the ones I have are falling apart”");
  await expect(page.getByRole("button", { name: "Approve $15.00" })).toBeEnabled();
});

test("approves pending request in one tap", async ({ page }) => {
  await enter(page, E2E.approveKey);
  await page.getByRole("link", { name: /Zoe is asking for \$8\.00 at Best Buy/ }).click();
  await expect(page.getByText("She has $20.00 left this week. This would leave $12.00.")).toBeVisible();
  await page.getByRole("button", { name: "Approve $8.00" }).click(); // the one tap: approve AND pay
  await expect(page).toHaveURL(/\/g\?decided=paid&req=/);
  await expect(page.locator(".g-flash")).toHaveText("Approved and paid — $8.00 at Best Buy. The receipt is in the record.");
  await expect(page.getByText("Nothing needs you today.")).toBeVisible();
  await page.goto("/g/record");
  const row = page.locator("tr", { hasText: "Best Buy" }).first();
  await expect(row).toContainText("You approved it · Rules v1");
  await expect(row).toContainText(/E2E-PAID-\d+/);
  await expect(page.locator("section", { has: page.getByRole("heading", { name: "Checked against PayPal" }) }))
    .toContainText("All 1 payments match PayPal's own list.");
  await page.goto(`/g/requests/${E2E.approveApprovalId}`); // a decided request has closed
  await expect(page.getByText("This request has closed.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
});

test("record shows receipt with PayPal capture id and \"Rules v{n}\"", async ({ page }) => {
  await enter(page);
  await page.goto("/g/record");
  await expect(page.getByRole("heading", { level: 1, name: "The record" })).toBeVisible();
  const row = page.locator("tr", { hasText: E2E.receiptCapture });
  await expect(row).toContainText("Target");
  await expect(row).toContainText("$6.00");
  await expect(row).toContainText("Within Rules v1");
  const slip = row.locator("xpath=following-sibling::tr[1]"); // the evidence packet expands under its payment
  await slip.getByText("View permission slip").click();
  await expect(slip.locator(".g-clause")).toContainText("Zoe can spend up to $20.00 a week");
  await expect(slip).toContainText("Cart fingerprint");
  await expect(page.locator("tr", { hasText: "Paying… no receipt yet" })).toContainText("$4.50"); // money left, no receipt
  await expect(page.getByText("Ask about the month")).toBeVisible();
  await expect(page.getByRole("button", { name: "What did Zoe buy this month?" })).toBeVisible();
});

test("reconciliation flags a PayPal transaction missing from Tether", async ({ page }) => {
  await enter(page);
  await page.goto("/g/record");
  const recon = page.locator("section", { has: page.getByRole("heading", { name: "Checked against PayPal" }) });
  const flag = recon.locator("li", { hasText: E2E.missingCapture });
  await expect(flag).toContainText("PayPal charged, Tether has no receipt");
  await expect(flag).toContainText("$4.50");
  await expect(recon.locator("li")).toHaveCount(1); // the matched receipt raises nothing
  const body = await page.locator("body").innerText();
  expect(body).not.toContain(E2E.otherFamilyCapture); // another family's charge
  expect(body).not.toContain(E2E.unlinkedCapture); // a merchant-account row with no family link
  expect(body).not.toMatch(/\$50\.00|\$9\.99/);
});

test("request id from another family shows the closed page", async ({ page }) => {
  await enter(page);
  await page.goto(`/g/requests/${E2E.otherApprovalId}`);
  await expect(page.getByText("This request has closed.")).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/Kai|Sam|\$15\.00|falling apart/);
  await expect(page.getByRole("button", { name: /Approve|Not this time/ })).toHaveCount(0);
  await page.goto("/g/requests/not-a-real-request");
  await expect(page.getByText("This request has closed.")).toBeVisible();
});

test("level override requires a reason", async ({ page }) => {
  await enter(page, E2E.levelKey);
  await page.goto("/g/review");
  await expect(page.getByRole("heading", { level: 1, name: "Monthly review" })).toBeVisible();
  await expect(page.getByLabel("Level 2")).not.toBeChecked(); // nothing chosen for her
  await page.getByLabel("Level 2").check();
  await page.getByRole("button", { name: "Change her level" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Say why — it goes on the record. Nothing changed.");
  await page.reload();
  await expect(page.locator(".g-head .g-chip", { hasText: /^Level \d$/ })).toHaveText("Level 1"); // nothing changed
  await page.getByLabel("Level 2").check();
  await page.getByLabel("Why? It goes on the record.").fill("She has been careful all month.");
  await page.getByRole("button", { name: "Change her level" }).click();
  await expect(page).toHaveURL(/\/g\/review\?level=2$/);
  await expect(page.getByRole("status")).toContainText("Zoe is now at Level 2.");
  await expect(page.getByText("“She has been careful all month.”")).toBeVisible();
});

test("revoke asks first", async ({ page }) => {
  await enter(page, E2E.revokeKey);
  await page.goto("/g/review");
  await page.getByRole("button", { name: "Stop Zoe's rules" }).click();
  await expect(page.getByText("Stop Zoe's rules now?")).toBeVisible();
  await page.getByRole("button", { name: "Keep them" }).click(); // backing out changes nothing
  await expect(page.locator(".g-head .g-chip", { hasText: "Rules stopped" })).toHaveCount(0);
  await page.getByRole("button", { name: "Stop Zoe's rules" }).click();
  await page.getByRole("button", { name: "Yes, stop them" }).click();
  await expect(page).toHaveURL(/stopped=wallet-kept$/); // the fake PayPal refuses the wallet delete
  await expect(page.getByRole("status")).toContainText(
    "Rules stopped. PayPal didn't confirm removing the saved wallet — remove Tether in PayPal settings: Settings → Payments → Automatic payments.");
  await expect(page.getByRole("button", { name: "Change her level" })).toHaveCount(0); // stopped rules stay stopped
  await page.goto("/g/grant"); // the editor keeps her level instead of falling to Level 1
  await expect(page.getByLabel(/Level 1/)).toBeChecked();
});
