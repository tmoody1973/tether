import { expect, test } from "@playwright/test";
import { E2E } from "./fixtures";

const PITCH = "A parent signs the rules. An AI agent proposes. Code decides. PayPal pays.";

test("landing → Open Zoe's view lands on her week", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: PITCH })).toBeVisible();
  await page.getByRole("link", { name: "Open Zoe's view" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/t/${E2E.teenToken}$`));
  await expect(page.getByText("Your week")).toBeVisible();
  await expect(page.getByText("left this week")).toBeVisible();
});

test("landing → Open Amara's view signs her in to Home", async ({ page }) => {
  await page.goto("/");
  const doors = page.getByRole("link", { name: "Open Amara's view" });
  await expect(doors).toHaveCount(2); // the hero and Try it
  await expect(doors.last()).toHaveAttribute("href", `/g/enter/${E2E.guardianKey}`);
  await doors.first().click();
  await expect(page).toHaveURL(/\/g$/);
  await expect(page.getByRole("heading", { level: 1, name: "Zoe" })).toBeVisible();
});

test("landing: How it works anchor, Meet the agents, alt text on every image", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Page" }).getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/#how$/);
  await expect(page.getByRole("heading", { level: 2, name: "Four steps. The AI proposes; it never decides." })).toBeInViewport();
  await expect(page.getByRole("heading", { level: 2, name: "Meet the agents." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "The shopping agent" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "The month assistant" })).toBeVisible();
  const missingAlt = await page.locator("img:not([alt])").count();
  expect(missingAlt).toBe(0);
  await expect(page.locator("h1")).toHaveCount(1);
});

test("landing at 390 wide: no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: PITCH })).toBeVisible();
  // html/body clip horizontal overflow (globals.css), so scrollWidth alone can't fail: look for anything poking past the
  // viewport that isn't inside a box meant to crop it (the phone bands crop their phones on purpose).
  const offenders = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const cropped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (["hidden", "clip"].includes(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    return [...document.querySelectorAll(".l-page *")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1 || r.left < -1) && !cropped(el); })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`).slice(0, 5);
  });
  expect(offenders).toEqual([]);
});

test("landing: the problem in numbers, each with Tether's answer, and a link to the sources", async ({ page }) => {
  await page.goto("/");
  const facts = page.getByRole("list", { name: "The problem in numbers" }).getByRole("listitem");
  await expect(facts).toHaveCount(5);
  for (const fact of await facts.all()) await expect(fact.getByText("Tether's answer:")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sources and sample sizes" }))
    .toHaveAttribute("href", "https://github.com/tmoody1973/tether/blob/main/docs/research/problem.md");
});
