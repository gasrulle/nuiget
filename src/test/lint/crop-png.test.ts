import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cropPng, decodePng, encodePng } from '../../../scripts/crop-png.mjs';

/** UX-P0.8: `scripts/crop-png.mjs`, which writes each named state's webview crop and crops the judge's boxes. */
describe('scripts/crop-png.mjs', () => {
    let dir = '';

    beforeEach(() => {
        dir = mkdtempSync(path.join(tmpdir(), 'nuiget-crop-'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    /** A width×height image whose pixel (x, y) is (x, y, x + y, 255). */
    const gradient = (width: number, height: number): Buffer => {
        const pixels = Buffer.alloc(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                pixels.set([x, y, (x + y) & 255, 255], (y * width + x) * 4);
            }
        }
        return pixels;
    };

    it('round-trips an image through its PNG encoder and decoder', () => {
        const file = path.join(dir, 'source.png');
        encodePng(file, 7, 5, gradient(7, 5));
        const decoded = decodePng(file);
        expect([decoded.width, decoded.height]).toEqual([7, 5]);
        expect(decoded.pixels.equals(gradient(7, 5))).toBe(true);
    });

    it('decodes RGB scanlines written with the Sub, Up, Average and Paeth filters', () => {
        // A 3x5 RGB image, one scanline per filter type 0 to 4, built by hand as a PNG encoder would.
        const width = 3;
        const height = 5;
        const pixel = (x: number, y: number): number[] => [10 + x * 40 + y, 200 - y * 30 - x, (x * 70 + y * 50) & 255];
        const rows = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => pixel(x, y)).flat());
        const paeth = (a: number, b: number, c: number): number => {
            const p = a + b - c;
            const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
            return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        };
        const raw: number[] = [];
        rows.forEach((row, y) => {
            const filter = y;
            raw.push(filter);
            row.forEach((value, index) => {
                const left = index >= 3 ? row[index - 3] : 0;
                const up = y > 0 ? rows[y - 1][index] : 0;
                const upLeft = y > 0 && index >= 3 ? rows[y - 1][index - 3] : 0;
                const predicted = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
                raw.push((value - predicted) & 255);
            });
        });
        const chunk = (type: string, data: Buffer): Buffer => {
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
        header[9] = 2;
        const file = path.join(dir, 'filtered.png');
        writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.from(raw))), chunk('IEND', Buffer.alloc(0))]));

        const decoded = decodePng(file);
        expect([decoded.width, decoded.height]).toEqual([width, height]);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                expect([...decoded.pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)], `pixel ${x},${y}`).toEqual([...pixel(x, y), 255]);
            }
        }
    });

    it('crops a CSS-px rectangle 1:1, at DPR 1 and at DPR 2', () => {
        const file = path.join(dir, 'source.png');
        encodePng(file, 20, 10, gradient(20, 10));

        const out = path.join(dir, 'nested', 'crop.png');
        expect(cropPng(file, { x: 3, y: 2, width: 4, height: 5 }, out).device).toEqual({ x: 3, y: 2, width: 4, height: 5 });
        const crop = decodePng(out);
        expect([crop.width, crop.height]).toEqual([4, 5]);
        expect([...crop.pixels.subarray(0, 4)]).toEqual([3, 2, 5, 255]);

        const double = path.join(dir, 'double.png');
        cropPng(file, { x: 1, y: 1, width: 3, height: 2 }, double, 2);
        const doubled = decodePng(double);
        expect([doubled.width, doubled.height]).toEqual([6, 4]);
        expect([...doubled.pixels.subarray(0, 4)]).toEqual([2, 2, 4, 255]);
    });

    it('refuses a rectangle that leaves the image instead of writing a smaller crop', () => {
        const file = path.join(dir, 'source.png');
        encodePng(file, 10, 10, gradient(10, 10));
        expect(() => cropPng(file, { x: 8, y: 0, width: 4, height: 4 }, path.join(dir, 'out.png'))).toThrow(/leaves the image 10x10/);
    });

    it('runs from the command line with the argument order design-judge uses', () => {
        const file = path.join(dir, 'source.png');
        encodePng(file, 12, 12, gradient(12, 12));
        const out = path.join(dir, 'cli', 'box.png');
        const printed = execFileSync(process.execPath, ['scripts/crop-png.mjs', file, '2', '3', '5', '4', out], { encoding: 'utf8' });
        expect(JSON.parse(printed).device).toEqual({ x: 2, y: 3, width: 5, height: 4 });
        expect(decodePng(out).width).toBe(5);
    });
});
