import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Landing, { metadata } from "@/app/page";

const render = () => renderToStaticMarkup(createElement(Landing));
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

describe("landing page", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("shows the demo doors (hero and Try it) only when demo keys are set", () => {
    vi.stubEnv("DEMO_GUARDIAN_KEY", "demo key/1");
    vi.stubEnv("DEMO_TEEN_TOKEN", "teen-token-1");
    const on = render();
    expect(text(on)).toContain("A parent signs the rules. An AI agent proposes. Code decides. PayPal pays.");
    expect(on.match(/href="\/g\/enter\/demo%20key%2F1"/g)).toHaveLength(2);
    expect(on.match(/href="\/t\/enter"/g)).toHaveLength(2); // freshens a stale demo, then her week (R44)
    expect(on).toContain("Open Amara&#x27;s view");
    expect(on).toContain("Sandbox only; no real money moves.");

    vi.stubEnv("DEMO_TEEN_TOKEN", "");
    const off = render();
    expect(off).not.toContain("/g/enter/");
    expect(off).not.toMatch(/<a [^>]*>Open (Zoe|Amara)/); // the Try it steps still name the views in prose
    expect(off).toContain("Sandbox only; no real money moves."); // the page still renders, without an error
    expect(off).toContain('href="/g/login/paypal"'); // starting your own family never needs the demo keys
  });

  it("has one h1, the How it works and AI anchors the nav points at, and Meet the agents", () => {
    const html = render();
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    for (const id of ["how", "ai", "try", "start", "agents"]) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('href="#how"');
    expect(text(html)).toContain("Meet the agents.");
    expect(text(html)).toContain("Claude Haiku 5.5"); // shopping agent, src/app/t/teenDeps.ts
    expect(text(html)).toContain("Claude Sonnet 5.5"); // month assistant, src/app/api/g/ask/route.ts
  });

  it("says the production stand-in as a future, and no made-up lock-screen date", () => {
    const t = text(render());
    expect(t).toContain("Tether would pay shops through PayPal's platform and agent-checkout programs.");
    expect(t).not.toMatch(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d/);
  });

  it("every image has alt text and real dimensions", () => {
    const imgs = render().match(/<img [^>]*>/g) ?? [];
    expect(imgs.length).toBeGreaterThan(10);
    for (const img of imgs) {
      expect(img).toMatch(/ alt="/);
      expect(img).toMatch(/ width="\d+"/);
      expect(img).toMatch(/ height="\d+"/);
    }
  });

  it("carries the share title and a 1200×630 image", () => {
    expect(metadata.title).toBe("Tether — a parent signs the rules. An AI agent proposes. Code decides. PayPal pays.");
    expect(metadata.openGraph?.images).toEqual([expect.objectContaining({ url: "/og-landing.png", width: 1200, height: 630 })]);
  });
});
