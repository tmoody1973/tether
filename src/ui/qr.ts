// A tiny QR code encoder for the teen link (no dependency): byte mode, error correction level M, versions 1 to 6
// (up to 106 bytes; a teen link is about 70). Follows ISO/IEC 18004 the way Nayuki's reference encoder lays it out.
// ponytail: one fixed mask (0) instead of scoring all eight; any mask decodes. Score masks if a phone ever struggles.

/** Error-correction codewords per block and number of blocks, level M, versions 1 to 6. All blocks are equal size here. */
const ECC_PER_BLOCK = [10, 16, 26, 18, 24, 16];
const BLOCKS = [1, 1, 1, 2, 2, 4];
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172];
const MASK = 0;
const ECL_M_BITS = 0; // format-info bits for level M

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor); });
  }
  return result;
}

/** Data + error correction, interleaved across blocks, for one version. */
function codewords(bytes: Uint8Array, v: number): number[] | null {
  const dataCount = TOTAL_CODEWORDS[v - 1] - ECC_PER_BLOCK[v - 1] * BLOCKS[v - 1];
  const bits: number[] = [];
  const put = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4); // byte mode
  put(bytes.length, 8); // count: 8 bits for versions 1 to 9
  bytes.forEach((b) => put(b, 8));
  if (bits.length > dataCount * 8) return null;
  put(0, Math.min(4, dataCount * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < dataCount; pad ^= 0xec ^ 0x11) data.push(pad);

  const per = dataCount / BLOCKS[v - 1];
  const divisor = rsDivisor(ECC_PER_BLOCK[v - 1]);
  const blocks = Array.from({ length: BLOCKS[v - 1] }, (_, i) => data.slice(i * per, (i + 1) * per));
  const eccs = blocks.map((b) => rsRemainder(b, divisor));
  const out: number[] = [];
  for (let i = 0; i < per; i++) blocks.forEach((b) => out.push(b[i]));
  for (let i = 0; i < divisor.length; i++) eccs.forEach((e) => out.push(e[i]));
  return out;
}

/** The QR modules (true = dark), rows top to bottom, or null if `text` is longer than version 6 holds. */
export function qrMatrix(text: string): boolean[][] | null {
  const bytes = new TextEncoder().encode(text);
  let version = 0;
  let words: number[] | null = null;
  for (let v = 1; v <= 6 && !words; v++) { words = codewords(bytes, v); version = v; }
  if (!words) return null;

  const size = version * 4 + 17;
  const dark = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, on: boolean) => { dark[y][x] = on; fixed[y][x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); } // timing
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) { // finders + separators
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, ![2, 4].includes(Math.max(Math.abs(dx), Math.abs(dy))));
    }
  }
  if (version > 1) { // versions 2 to 6 have one alignment pattern, bottom right
    const c = size - 7;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  const data = (MASK | (ECL_M_BITS << 3));
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const format = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((format >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true); // the dark module

  let i = 0; // zigzag placement, two columns at a time from the right, skipping the vertical timing line
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (fixed[y][x] || i >= words.length * 8) continue;
        dark[y][x] = ((words[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && (x + y) % 2 === 0) dark[y][x] = !dark[y][x];
  return dark;
}
