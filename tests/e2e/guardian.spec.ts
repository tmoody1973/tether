import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./fixtures";

const enter = (page: Page) => page.goto(`/g/enter/${E2E.guardianKey}`);

test("no cookie ⇒ neutral page, no data", async ({ page }) => {
  for (const path of ["/g", "/g/grant", "/g/enter/not-a-real-key"]) {
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

test("home shows \"Nothing needs you today.\" with no approvals", async ({ page }) => {
  await enter(page);
  await expect(page.getByText("Nothing needs you today.")).toBeVisible();
  await expect(page.getByText("$0.00 of $20.00").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Send Zoe her link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Advance 1 day" })).toBeVisible();
  await page.getByRole("button", { name: "Send Zoe her link" }).click();
  await expect(page.getByLabel("Zoe's link")).toHaveValue(new RegExp(`/t/${E2E.teenToken}$`));
});

test("guardian signs grant, sees plain-words clause", async ({ page }) => {
  await enter(page);
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
