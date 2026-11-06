import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Landing from "@/app/page";

const render = () => renderToStaticMarkup(createElement(Landing));

describe("landing page (Task 19)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("landing shows both buttons only when demo keys are set", () => {
    vi.stubEnv("DEMO_GUARDIAN_KEY", "demo key/1");
    vi.stubEnv("DEMO_TEEN_TOKEN", "teen-token-1");
    const on = render();
    expect(on).toContain("A parent signs the rules. An AI agent proposes. Code decides. PayPal pays.");
    expect(on).toContain('href="/g/enter/demo%20key%2F1"');
    expect(on).toContain("Open Amara&#x27;s view");
    expect(on).toContain('href="/t/enter"'); // freshens a stale demo, then her week (R44)
    expect(on).toContain("Sandbox only; no real money moves.");

    vi.stubEnv("DEMO_TEEN_TOKEN", "");
    const off = render();
    expect(off).not.toContain("/g/enter/");
    expect(off).not.toContain("Open Zoe");
    expect(off).toContain("Sandbox only; no real money moves."); // the page still renders, without an error
  });
});
