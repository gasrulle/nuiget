// Crops a PNG to a rectangle given in CSS px: node scripts/crop-png.mjs <png> <x> <y> <w> <h> <out> [dpr]
//
// The capture suite (UX-P0.8) writes each named state's webview crop with it, and design-judge's refuter crops boxes
// of those crops. `dpr` defaults to 1, the device pixel ratio of every CI capture; a local macOS capture is DPR 2 and is
// never evidence. The directory of <out> is created. Seeded from docs/design/export-proof/crop.mjs and the PNG reader of
// the UX research bundle; reads 8-bit RGB or RGBA without interlacing, the format WebDriver screenshots use.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Decodes a PNG file into RGBA pixels. */
export function decodePng(file) {
    const bytes = readFileSync(file);
    if (!bytes.subarray(0, 8).equals(SIGNATURE)) {
        throw new Error(`${file} is not a PNG`);
    }
    let offset = 8;
    let width = 0;
    let height = 0;
    let colourType = 0;
    const idat = [];
    while (offset < bytes.length) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        const data = bytes.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            colourType = data[9];
            if (data[8] !== 8 || data[12] !== 0) {
                throw new Error(`${file}: only 8-bit, non-interlaced PNGs are read`);
            }
        } else if (type === 'IDAT') {
            idat.push(data);
        }
        offset += 12 + length;
    }
    const channels = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
    if (channels === 0) {
        throw new Error(`${file}: colour type ${colourType} is not RGB or RGBA`);
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const pixels = Buffer.alloc(width * height * 4);
    let previous = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
        for (let x = 0; x < stride; x++) {
            const left = x >= channels ? line[x - channels] : 0;
            const up = previous[x];
            const upLeft = x >= channels ? previous[x - channels] : 0;
            let value = line[x];
            if (filter === 1) {
                value += left;
            } else if (filter === 2) {
                value += up;
            } else if (filter === 3) {
                value += (left + up) >> 1;
            } else if (filter === 4) {
                const estimate = left + up - upLeft;
                const toLeft = Math.abs(estimate - left);
                const toUp = Math.abs(estimate - up);
                const toUpLeft = Math.abs(estimate - upLeft);
                value += toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
            }
            line[x] = value & 255;
        }
        for (let x = 0; x < width; x++) {
            const target = (y * width + x) * 4;
            pixels[target] = line[x * channels];
            pixels[target + 1] = line[x * channels + 1];
            pixels[target + 2] = line[x * channels + 2];
            pixels[target + 3] = channels === 4 ? line[x * channels + 3] : 255;
        }
        previous = line;
    }
    return { width, height, pixels };
}

/** Encodes RGBA pixels as a PNG file. */
export function encodePng(file, width, height, pixels) {
    const chunk = (type, data) => {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(zlib.crc32(typed) >>> 0);
        return Buffer.concat([length, typed, crc]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    const raw = Buffer.alloc(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) {
        pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/**
 * Writes the part of `file` inside the CSS-px rectangle `{ x, y, width, height }` to `out`, 1:1 at `dpr` device pixels
 * per CSS px. Throws when the rectangle leaves the image, so a wrong rectangle never yields a smaller crop.
 */
export function cropPng(file, rect, out, dpr = 1) {
    const image = decodePng(file);
    const x0 = Math.round(rect.x * dpr);
    const y0 = Math.round(rect.y * dpr);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (width <= 0 || height <= 0 || x0 < 0 || y0 < 0 || x0 + width > image.width || y0 + height > image.height) {
        throw new Error(`the rectangle ${x0},${y0} ${width}x${height} (device px) leaves the image ${image.width}x${image.height}`);
    }
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        const from = ((y0 + y) * image.width + x0) * 4;
        image.pixels.copy(pixels, y * width * 4, from, from + width * 4);
    }
    encodePng(out, width, height, pixels);
    return { image: { width: image.width, height: image.height }, device: { x: x0, y: y0, width, height }, out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [file, x, y, width, height, out, dpr = '1'] = process.argv.slice(2);
    const numbers = [x, y, width, height, dpr].map(Number);
    if (!file || !out || numbers.some(value => !Number.isFinite(value))) {
        console.error('usage: node scripts/crop-png.mjs <png> <x> <y> <w> <h> <out> [dpr]');
        process.exit(2);
    }
    try {
        const result = cropPng(file, { x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3] }, out, numbers[4]);
        console.log(JSON.stringify(result));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
