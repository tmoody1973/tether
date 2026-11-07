#!/usr/bin/env node
/**
 * Re-captures the real app screens the landing page shows (public/landing/*.png), from the LIVE demo.
 * VIEW ONLY: it opens pages through the two demo doors, scrolls, and opens one "Proof" disclosure. It never types into a
 * form, never presses Approve / Ask / Find, and never changes the demo family.
 *
 *   node scripts/capture-landing-screens.cjs [base-url]      (default https://tether-five-beta.vercel.app)
 *
 * Each shot is a 390×844 phone viewport at 2x (780×1688), the size the landing's <Image> tags declare.
 * amara-assistant.png needs a question answered, which would spend a model call, so it is never re-captured here:
 * ask "What did Zoe buy this month?" by hand on Activity and screenshot it at 390 wide, 2x.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- a plain CommonJS script for node, as the brief names it (.cjs) */
const path = require("node:path");
const { chromium } = require("@playwright/test");

const BASE = (process.argv[2] || "https://tether-five-beta.vercel.app").replace(/\/$/, "");
const OUT = path.join(__dirname, "..", "public", "landing");

async function shot(page, name, scrollTo) {
  if (scrollTo) await page.getByText(scrollTo, { exact: false }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`saved ${name}.png  (${page.url().replace(/\/t\/[^/]+/, "/t/…")})`); // never print Zoe's link: it is her credential
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    // Zoe's side: her door, then her tabs by URL.
    await page.goto(BASE);
    await page.getByRole("link", { name: "Open Zoe's view" }).first().click();
    await page.waitForURL(/\/t\/[^/]+$/);
    const teen = page.url();
    await shot(page, "zoe-week");
    for (const [tab, name] of [["shop", "zoe-shop"], ["map", "zoe-map"], ["goals", "zoe-goals"], ["invest/VTI", "zoe-fund-top"]]) {
      await page.goto(`${teen}/${tab}`);
      await shot(page, name);
    }

    // Amara's side: her door signs this browser in to the shared demo family.
    await page.goto(BASE);
    await page.getByRole("link", { name: "Open Amara's view" }).first().click();
    await page.waitForURL(/\/g$/);
    const ask = page.getByRole("link", { name: /Zoe is asking for/ }).first();
    if (await ask.count()) {
      await ask.click();
      await shot(page, "amara-request");
    } else {
      console.log("skipped amara-request.png: no ask is waiting (the demo resets one; try again after a reset)");
    }
    await page.goto(`${BASE}/g/rules`);
    await shot(page, "amara-rules-clause", "What Zoe reads");
    await page.goto(`${BASE}/g/activity`);
    const proof = page.locator("details.g-proof summary").first();
    if (await proof.count()) {
      await proof.click(); // a disclosure, not a submit
      await proof.scrollIntoViewIfNeeded();
      await shot(page, "amara-proof");
    } else {
      console.log("skipped amara-proof.png: no payment yet on Activity");
    }
    console.log("not re-captured: amara-assistant.png (asking would spend a model call; see the header)");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`capture failed: ${err.message}`);
  process.exit(1);
});
