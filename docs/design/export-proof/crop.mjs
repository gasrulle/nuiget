// Crops a capture to an artboard rect at its device pixel ratio, 1:1 (no scaling).
// Usage: node crop.mjs <capture.png> <rect.json> <outDir> [name]
// rect.json: { x, y, w, h, dpr } in CSS px of the captured viewport. Writes <outDir>/<name>.<w>.png (name defaults to "proof").
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { decode, encode } from '../../research/2026-10-23-ux-research/tools/png.mjs';

const [capture, rectFile, outDir, name = 'proof'] = process.argv.slice(2);
if (!capture || !rectFile || !outDir) {
    console.error('usage: node crop.mjs <capture.png> <rect.json> <outDir> [name]');
    process.exit(2);
}
const rect = JSON.parse(readFileSync(rectFile, 'utf-8'));
const img = decode(capture);
const dpr = rect.dpr;
const x0 = Math.round(rect.x * dpr), y0 = Math.round(rect.y * dpr);
const w = Math.round(rect.w * dpr), h = Math.round(rect.h * dpr);
if (x0 < 0 || y0 < 0 || x0 + w > img.w || y0 + h > img.h) {
    console.error(`rect ${x0},${y0} ${w}x${h} (device px) falls outside the capture ${img.w}x${img.h}`);
    process.exit(1);
}
const px = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) {
    img.px.copy(px, y * w * 4, ((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x0 + w) * 4);
}
const out = path.join(outDir, `${name}.${Math.round(rect.w)}.png`);
encode(out, w, h, px);
console.log(JSON.stringify({ capture: `${img.w}x${img.h}`, dpr, deviceRect: { x0, y0, w, h }, out }));
