import { describe, expect, it } from "vitest";
import { qrMatrix } from "@/ui/qr";

const LINK = "https://tether-five-beta.vercel.app/t/Zr4pW9cXk7Qm2vRa8LbN3dEfGhJt5sUy"; // 70 bytes, like a real teen link

/** A 7x7 finder: dark ring, light ring, dark 3x3 centre. */
function isFinder(m: boolean[][], x0: number, y0: number): boolean {
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
    if (m[y0 + y][x0 + x] !== (d !== 2)) return false;
  }
  return true;
}

describe("qrMatrix (byte mode, error correction M)", () => {
  it("picks the smallest version that fits: a teen link is version 5 (37 modules)", () => {
    expect(qrMatrix("hi")!.length).toBe(21);
    const m = qrMatrix(LINK)!;
    expect(m.length).toBe(37);
    expect(m.every((row) => row.length === 37)).toBe(true);
  });

  it("has the three finders, the timing lines and the dark module", () => {
    const m = qrMatrix(LINK)!;
    const n = m.length;
    expect(isFinder(m, 0, 0) && isFinder(m, n - 7, 0) && isFinder(m, 0, n - 7)).toBe(true);
    for (let i = 8; i < n - 8; i++) { expect(m[6][i]).toBe(i % 2 === 0); expect(m[i][6]).toBe(i % 2 === 0); }
    expect(m[n - 8][8]).toBe(true);
  });

  it("is deterministic, and too long for version 6 ⇒ null (the page then shows the link only)", () => {
    expect(qrMatrix(LINK)).toEqual(qrMatrix(LINK));
    expect(qrMatrix("x".repeat(106))).not.toBeNull();
    expect(qrMatrix("x".repeat(107))).toBeNull();
  });
});
