import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/t/[token]/agent/route";

const call = (request: unknown) =>
  POST(new Request("http://x/api/t/tok/agent", { method: "POST", body: JSON.stringify({ request }) }),
    { params: Promise.resolve({ token: "tok" }) });

describe("agent route", () => {
  it("rejects a 201-char request with 400", async () => {
    expect((await call("x".repeat(201))).status).toBe(400);
  });
  it("rejects empty and non-string requests with 400", async () => {
    expect((await call("  ")).status).toBe(400);
    expect((await call(5)).status).toBe(400);
  });
});
