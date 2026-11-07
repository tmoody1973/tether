// Brief E, part 1: what Amara lists is her "investing list" (funds and stocks), never a "fund list", anywhere a
// person reads it. Code names (fundAllowlist, subject "fund") stay. The month assistant's files belong to another
// branch and follow it (listed in the report), so they're skipped here.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requestTitle, closedWords } from "@/ui/approveWords";

const SKIP = [/^src\/ai\//, /^src\/app\/g\/AnswerCards\.tsx$/, /^src\/app\/g\/AskBox\.tsx$/];
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
});

describe("investing list wording", () => {
  it("no 'fund list' left in any source string outside the assistant's files (comments aside)", () => {
    const hits = files("src").filter((p) => !SKIP.some((r) => r.test(p))).flatMap((p) =>
      readFileSync(p, "utf8").split("\n").flatMap((line, i) => {
        const code = line.replace(/\/\/.*$/, "").trim();
        return !code.startsWith("*") && !code.startsWith("/*") && /fund list/i.test(code) ? [`${p}:${i + 1}`] : [];
      }));
    expect(hits).toEqual([]);
  });

  it("a request to add a stock reads as the investing list", () => {
    expect(requestTitle({ teenName: "Zoe", fund: { symbol: "AAPL" } } as Parameters<typeof requestTitle>[0]))
      .toBe("Zoe proposes adding AAPL to your investing list");
    const c = { teenName: "Zoe", outcome: "approved", subject: "fund", at: new Date("2026-11-06T20:54:00Z"), fund: { symbol: "AAPL" } } as const;
    expect(closedWords(c as unknown as Parameters<typeof closedWords>[0]).line).toMatch(/^Adding AAPL to your investing list · approved/);
  });
});
