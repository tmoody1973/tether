import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StartFamily } from "@/app/StartFamily";
import { SANDBOX_LOGIN } from "@/ui/sandboxAccount";

describe("the shared sandbox login", () => {
  it("shows on the Start your own family card, both values, each with Copy", () => {
    const html = renderToStaticMarkup(createElement(StartFamily));
    expect(html).toContain(SANDBOX_LOGIN.email);
    expect(html).toContain(SANDBOX_LOGIN.password);
    expect(html.match(/>Copy</g)).toHaveLength(2);
    expect(html).toContain("Sandbox PayPal login (fake money)");
  });
});
