// Renders the PWA icons from public/brand/tether-app-icon.svg. Run: pnpm tsx scripts/pwa-icons.ts
// sharp ships with Next (optional dependency); the PNGs are committed, so this only reruns if the brand mark changes.
import { readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("public/brand/tether-app-icon.svg", "utf8");
// Maskable: square-cornered full bleed, mark scaled into the central 80% safe zone.
const maskable = svg
  .replace('rx="112"', 'rx="0"')
  .replace(/(<rect[^>]*\/>)([\s\S]*)<\/svg>\s*$/, '$1<g transform="translate(256 256) scale(0.8) translate(-256 -256)">$2</g></svg>');

async function main() {
  await sharp(Buffer.from(svg), { density: 300 }).resize(192, 192).png().toFile("public/brand/icon-192.png");
  await sharp(Buffer.from(svg), { density: 300 }).resize(512, 512).png().toFile("public/brand/icon-512.png");
  await sharp(Buffer.from(maskable), { density: 300 }).resize(512, 512).png().toFile("public/brand/icon-maskable-512.png");
}
main().catch((e) => { console.error(e); process.exit(1); });
