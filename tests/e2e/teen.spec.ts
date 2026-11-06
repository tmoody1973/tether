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
  await page.goto("/g/rules"); // her link lives on her rules page
  await page.getByRole("button", { name: "Reset Zoe's link" }).click();
  await page.getByRole("button", { name: "Yes, reset" }).click();
  await expect(page).toHaveURL(/\/g\/rules\?link=reset$/);
  await expect(page.getByRole("status").first()).toContainText("The old link has stopped working.");
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
  test.setTimeout(90_000); // cold dev compile of several pages
  await open(page, E2E.teen.paused);
  await expect(page.getByRole("heading", { name: "Amara paused your rules." })).toBeVisible();
  await expect(page.locator(".t-hero")).toHaveCount(0);
  await open(page, E2E.teen.paused, "/shop");
  await expect(page.getByRole("heading", { name: "Amara paused your rules." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Find options|Search|Check it/ })).toHaveCount(0);
});

// ---- Task 18b: goals, map, investing -----------------------------------------------------------------------------

test("goals shows weeks to goal", async ({ page }) => {
  await open(page, E2E.teenB.goals, "/goals"); // $34 saved, promise at the $2 floor
  await expect(page.getByText("What are you saving for?")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("What it is").fill("Headphones");
  await page.getByLabel("How much it costs, in dollars").fill("89");
  await page.getByRole("button", { name: "Save my goal" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Saved your goal.");
  await expect(page.locator(".t-hero")).toHaveText("28"); // ($89 − $34) / $2, rounded up
  await expect(page.getByText("weeks to Headphones")).toBeVisible();
  await expect(page.getByRole("img", { name: "$34.00 saved of $89.00" })).toBeVisible(); // the one bar
  await expect(page.getByText(/stay in Amara's PayPal until she releases them/)).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(/Venmo/);
});

test("commitment below the floor shows the minimum", async ({ page }) => {
  await open(page, E2E.teenB.promise, "/goals");
  const stepper = page.locator(".t-stepper");
  await expect(stepper).toContainText("$2.00", { timeout: 20_000 }); // the 10% floor of $20
  await page.getByRole("button", { name: "Save $1 less each week" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("At least $2.00 a week");
  await expect(page.getByRole("button", { name: "Save my promise" })).toHaveCount(0);
  await page.getByRole("button", { name: "Save $1 more each week" }).click();
  await page.getByRole("button", { name: "Save $1 more each week" }).click();
  await expect(stepper).toContainText("$3.00");
  await page.getByRole("button", { name: "Save my promise" }).click();
  await expect(page.getByText("From next week")).toBeVisible();
  await expect(page.getByText("This week you're still on $2.00.")).toBeVisible();
  await expect(page.getByText(/Keeping this promise helps you level up\. Breaking it won't block anything/)).toBeVisible();
});

test("suggest a shop ⇒ appears on Amara's home", async ({ page }) => {
  await open(page, E2E.teenB.map, "/map");
  const tile = (name: string) => page.getByRole("listitem", { name: new RegExp(`^${name}:`) });
  await expect(tile("Target")).toContainText("Open", { timeout: 20_000 }); // she has bought there
  await expect(tile("Best Buy")).toContainText("Ask first");
  await expect(tile("Barnes & Noble")).toContainText("Opens at Level 2");
  await expect(tile("Nike")).toContainText("Opens at Level 3");
  await expect(page.locator("main a[href^='http']")).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText(/\$\d|rating|stars/i); // no prices or ratings on the map

  await page.getByLabel("Find the shop").fill("etsy");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("radio", { name: "Etsy" }).check();
  await page.getByLabel("Why this shop?").fill("art supplies for my portfolio");
  await page.getByRole("button", { name: "Suggest to Amara" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Sent. Amara will see your suggestion for etsy.com.");

  await page.goto(`/g/enter/${E2E.teenMapKey}`);
  const req = page.getByRole("link", { name: /Zoe suggests a new shop: etsy\.com/ });
  await expect(req).toBeVisible();
  await expect(req).toContainText("art supplies for my portfolio");
});

test("invest page hidden below level 3", async ({ page }) => {
  await open(page, E2E.teenToken); // Level 1
  await expect(page.getByRole("navigation").getByRole("link", { name: "Goals" })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Invest" })).toHaveCount(0);
  await open(page, E2E.teenToken, "/invest");
  await expect(page.getByRole("heading", { name: "Investing opens at Level 3." })).toBeVisible();
  await expect(page.getByRole("search")).toHaveCount(0);
  await open(page, E2E.teenToken, "/invest/VTI");
  await expect(page.getByRole("heading", { name: "Investing opens at Level 3." })).toBeVisible();
  await open(page, E2E.teenB.look); // Level 3: the tab is there
  await expect(page.getByRole("navigation").getByRole("link", { name: "Invest" })).toBeVisible();
});

test("fund page has no 1D/1W controls and one chart", async ({ page }) => {
  await open(page, E2E.teenB.look, "/invest");
  await page.getByLabel("A fund or company").fill("vanguard");
  await page.getByRole("button", { name: "Search" }).click();
  const results = page.getByRole("article");
  await expect(results.first()).toBeVisible({ timeout: 20_000 });
  await expect(results).toHaveCount(3); // match order, never popularity: VOO, VT, VTI (name prefix, by symbol)
  await expect(results.nth(0)).toHaveAccessibleName("Vanguard S&P 500 ETF (VOO)");
  for (let i = 0; i < 3; i++) {
    await expect(results.nth(i)).toContainText(/1 year: \$[\d.]+ today, \$[\d.]+ a year ago\./);
    await expect(results.nth(i).getByRole("link")).toHaveText("Look closer"); // the only action
  }
  await expect(page.getByRole("main")).not.toContainText(/most active|top movers|trending|today's move/i);

  await results.nth(0).getByRole("link", { name: "Look closer" }).click();
  await expect(page.getByRole("heading", { name: "Vanguard S&P 500 ETF" })).toBeVisible();
  await expect(page.locator("svg[data-chart]")).toHaveCount(1);
  await expect(page.getByRole("img", { name: /^Over 5 years, \$100 became: this \$\d+, the whole market \$\d+\.$/ })).toHaveCount(1);
  await expect(page.getByText(/^\$[\d.]+ today, \$[\d.]+ a year ago\.$/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^(1D|1W|1M|1Y|5Y|All)$/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^(1D|1W|1M|1Y|5Y|All)$/ })).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText(/good fit|could be|recommend|friends|bought stock/i);
  await expect(page.getByLabel("How would you feel if this dropped by a third next year?")).toBeVisible();
  await expect(page.locator("main a[href^='http']")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Five years" })).toBeVisible(); // a full history says so
  // Down years are drawn in the same neutral colours as up years: nothing red on the page.
  const strokes = await page.locator("svg[data-chart] polyline").evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
  for (const s of strokes) expect(s).not.toMatch(/rgb\((2[0-5]\d|1[5-9]\d), (\d|[1-9]\d), (\d|[1-9]\d)\)/);
});

test("R42: a fund listed months ago states its real span and draws no comparison", async ({ page }) => {
  await open(page, E2E.teenB.look, "/invest?q=newx");
  const result = page.getByRole("article", { name: "Newly Listed Example Fund (NEWX)" });
  await expect(result).toContainText(/1 year: \$[\d.]+ today, \$[\d.]+ when it started trading in [A-Z][a-z]+ \d{4}\./, { timeout: 20_000 });
  await result.getByRole("link", { name: "Look closer" }).click();
  await expect(page.getByText("NEWX has traded for less than a year, so there's no longer comparison yet.")).toBeVisible();
  await expect(page.locator("svg[data-chart]:visible")).toHaveCount(0);
  await expect(page.getByRole("main").getByText(/when it started trading in/)).toBeVisible();
});

test("a bad % in the fund URL is a calm page, not a 500", async ({ page }) => {
  expect((await page.goto(`/t/${E2E.teenB.look}/invest/%E0%A4%A`))?.status()).toBeLessThan(500); // Next answers 400 itself
  const res = await page.goto(`/t/${E2E.teenB.look}/invest/%25`); // reaches the page as a bare "%"
  expect(res?.status()).toBeLessThan(500);
  await expect(page.getByRole("heading", { name: "We couldn't find that one." })).toBeVisible();
});

async function propose(page: Page, token: string, symbol: string, amount: string) {
  await open(page, token, `/invest/${symbol}`);
  await page.getByLabel("Why this one?").fill("Lots of companies in one fund");
  await page.getByLabel("What would make you sell it?").fill("If I needed it for college");
  await page.getByLabel("How would you feel if this dropped by a third next year?").fill("Nervous, but I'd wait");
  await page.getByLabel("How much, in dollars?").fill(amount);
  await page.getByRole("button", { name: "Propose to Amara" }).click();
}

test("propose a fund ⇒ appears on Amara's home", async ({ page }) => {
  await propose(page, E2E.teenB.fund, "VOO", "5");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Sent. Amara will see your answers. If she adds VOO to her list, you can propose an amount.");
  await expect(page.getByText("You asked Amara to add VOO to her list. She'll decide.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Propose to Amara" })).toHaveCount(0);

  await page.goto(`/g/enter/${E2E.teenFundKey}`);
  await page.getByRole("link", { name: /Zoe proposes adding VOO to your fund list/ }).click();
  await expect(page.getByText("How would you feel if this dropped by a third next year?")).toBeVisible();
  await expect(page.getByText("Nervous, but I'd wait")).toBeVisible();
});

test("queued order shows \"Queued for market open\"", async ({ page }) => {
  await propose(page, E2E.teenB.queued, "VTI", "25"); // she has $20 saved
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("You have $20.00 available to invest, so at most that.");
  await expect(page.getByLabel("Why this one?")).toHaveValue("Lots of companies in one fund"); // her words are kept
  await page.getByLabel("How much, in dollars?").fill("5");
  await page.getByRole("button", { name: "Propose to Amara" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Sent. Amara will see your answers and decide.");

  await page.goto(`/g/enter/${E2E.teenQueuedKey}`);
  await page.getByRole("link", { name: /Zoe proposes investing \$5\.00 in VTI/ }).click();
  await page.getByRole("button", { name: "Approve $5.00" }).click();
  await expect(page.getByRole("main").getByRole("status").first()).toContainText("Queued for market open");

  await open(page, E2E.teenB.queued, "/invest");
  const mine = page.getByRole("region", { name: "Your investments" });
  await expect(mine).toContainText("VTI");
  await expect(mine).toContainText("Queued for market open");
  await expect(mine).toContainText("$5.00");
  await expect(mine).toContainText("Sandbox stand-in for a custodial account.");
});
