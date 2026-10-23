// Prints the colour runs along one column and one row of a cropped artboard PNG, in device px.
// Usage: node measure.mjs <crop.png> <columnCssX> <rowCssY> <dpr>
import { decode } from '../../research/2026-10-23-ux-research/tools/png.mjs';

const [file, colCss, rowCss, dprArg] = process.argv.slice(2);
const img = decode(file);
const dpr = Number(dprArg);
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
function runs(points) {
    const out = [];
    for (const [pos, c] of points) {
        const last = out[out.length - 1];
        if (last && last.color === c) { last.len++; } else { out.push({ from: pos, len: 1, color: c }); }
    }
    return out;
}
const col = Math.round(Number(colCss) * dpr), row = Math.round(Number(rowCss) * dpr);
const column = runs(Array.from({ length: img.h }, (_, y) => [y, hex(img.at(col, y))]));
const line = runs(Array.from({ length: img.w }, (_, x) => [x, hex(img.at(x, row))]));
console.log(JSON.stringify({ size: `${img.w}x${img.h}`, dpr, column: { x: col, runs: column.filter(r => r.len >= 2 * dpr) }, row: { y: row, runs: line.filter(r => r.len >= 2 * dpr) } }, null, 1));
