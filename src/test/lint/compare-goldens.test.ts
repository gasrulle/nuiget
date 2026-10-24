import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adopt, compare, compareAll, formatDiff, MATCH, maskOf, parseCapture, readCapture, refusal, textSha256 } from '../../../scripts/compare-goldens.mjs';
import { encodePng } from '../../../scripts/crop-png.mjs';
import { expectedFiles } from '../ui/v2/states';

/**
 * UX-P0.15: `scripts/compare-goldens.mjs`, the pixel diff of the capture suite's crops against their goldens. The UI job
 * runs it on every push (informational); this test holds the masks, the refusals, the line format and the adoption.
 */
const root = path.resolve(__dirname, '../../..');
const WIDTH = 20;
const HEIGHT = 10;

type Pixel = [number, number, number, number];
type Rect = { x: number; y: number; w: number; h: number };

/** A crop and its sidecar: a grey canvas with the given pixels changed. */
function writeCrop(dir: string, file: string, options: { width?: number; dpr?: number; changed?: Array<[number, number]>; masks?: Rect[]; tolerance?: number; image?: string; sidecar?: boolean } = {}): void {
    const width = options.width ?? WIDTH;
    const pixels = Buffer.alloc(width * HEIGHT * 4);
    for (let i = 0; i < width * HEIGHT; i++) {
        pixels.set([120, 120, 120, 255] satisfies Pixel, i * 4);
    }
    for (const [x, y] of options.changed ?? []) {
        pixels.set([255, 255, 255, 255] satisfies Pixel, (y * width + x) * 4);
    }
    encodePng(path.join(dir, file), width, HEIGHT, pixels);
    if (options.sidecar === false) {
        return;
    }
    const name = parseCapture(file);
    fs.writeFileSync(path.join(dir, file.replace(/\.png$/, '.json')), JSON.stringify({
        state: name?.state, theme: name?.theme, look: 'modern', width: name?.width, tolerance: options.tolerance ?? 0,
        masks: options.masks === undefined ? [] : [{ selector: '[data-testid="live"]', reason: 'live', rects: options.masks }],
        fingerprint: { fontFamily: 'system-ui', font: '400 13px system-ui', referenceWidth: 360.5, dpr: options.dpr ?? 1, vscode: '1.140.0', chromium: '150', image: options.image ?? 'ubuntu24 20261012' },
        run: '1',
    }));
}

describe('scripts/compare-goldens.mjs (UX-P0.15)', () => {
    let crops: string;
    let goldens: string;
    const FILE = `main-installed-single.dark-modern.${WIDTH}.png`;

    beforeEach(() => {
        crops = fs.mkdtempSync(path.join(os.tmpdir(), 'nuiget-crops-'));
        goldens = fs.mkdtempSync(path.join(os.tmpdir(), 'nuiget-goldens-'));
    });

    afterEach(() => {
        fs.rmSync(crops, { recursive: true, force: true });
        fs.rmSync(goldens, { recursive: true, force: true });
    });

    it('compares with pixelmatch\'s threshold 0.1 and anti-aliased pixels left out (plan P0.15)', () => {
        expect(MATCH).toEqual({ threshold: 0.1, includeAA: false });
    });

    it('reads the capture names of the named states and nothing else', () => {
        expect(parseCapture('main-installed-single.dark-modern-classic.932.png')).toEqual({ state: 'main-installed-single', theme: 'dark-modern-classic', width: 932 });
        expect(parseCapture('main-installed-single.dark-modern.1200.window.png')).toBeUndefined();
        expect(parseCapture('workbench.modern.json')).toBeUndefined();
    });

    it('counts nothing for an equal crop and the changed pixels of an unequal one, against the tolerance', () => {
        writeCrop(goldens, FILE);
        writeCrop(crops, FILE);
        const same = compare(readCapture(crops, FILE), readCapture(goldens, FILE));
        expect(same).toMatchObject({ pixels: 0, pass: true, changes: [] });
        expect(formatDiff('main-installed-single.dark-modern.20', same)).toBe('[diff] main-installed-single.dark-modern.20: 0 px (0.000 %, tolerance 0 %, within)');
        writeCrop(crops, FILE, { changed: [[3, 3], [4, 3]] });
        const changed = compare(readCapture(crops, FILE), readCapture(goldens, FILE));
        expect(formatDiff('x', changed)).toBe('[diff] x: 2 px (1.000 %, tolerance 0 %, above)');
        // The start tolerance admits a small share.
        writeCrop(crops, FILE, { changed: [[3, 3]], tolerance: 0.5 });
        expect(compare(readCapture(crops, FILE), readCapture(goldens, FILE))).toMatchObject({ pixels: 1, pass: true });
        writeCrop(crops, FILE, { changed: [[3, 3], [4, 3]], tolerance: 0.5 });
        expect(compare(readCapture(crops, FILE), readCapture(goldens, FILE))).toMatchObject({ pixels: 2, pass: false });
    });

    it('leaves the union of the crop\'s and the golden\'s masks out of the count', () => {
        writeCrop(goldens, FILE, { masks: [{ x: 10, y: 0, w: 5, h: 10 }] });
        writeCrop(crops, FILE, { changed: [[2, 2], [12, 5]], masks: [{ x: 0, y: 0, w: 4, h: 4 }] });
        const result = compare(readCapture(crops, FILE), readCapture(goldens, FILE));
        expect(result).toMatchObject({ pixels: 0, masked: 66 });
        expect(formatDiff('x', result)).toBe('[diff] x: 0 px (0.000 %, tolerance 0 %, 66 px masked, within)');
        expect(Array.from(maskOf(4, 2, [{ x: 1, y: 1, w: 9, h: 9 }]))).toEqual([0, 0, 0, 0, 0, 1, 1, 1]);
    });

    it('names a fingerprint change and a size change beside the count', () => {
        writeCrop(goldens, FILE);
        writeCrop(crops, FILE, { image: 'ubuntu26 20261101' });
        expect(formatDiff('x', compare(readCapture(crops, FILE), readCapture(goldens, FILE))))
            .toBe('[diff] x: 0 px (0.000 %, tolerance 0 %, within); fingerprint differs: image ubuntu24 20261012 → ubuntu26 20261101');
        const tall = `main-installed-single.dark-modern.${WIDTH}.png`;
        const other = fs.mkdtempSync(path.join(os.tmpdir(), 'nuiget-tall-'));
        try {
            const pixels = Buffer.alloc(WIDTH * (HEIGHT + 2) * 4, 120);
            encodePng(path.join(other, tall), WIDTH, HEIGHT + 2, pixels);
            fs.copyFileSync(path.join(crops, tall.replace(/\.png$/, '.json')), path.join(other, tall.replace(/\.png$/, '.json')));
            expect(formatDiff('x', compare(readCapture(other, tall), readCapture(goldens, FILE)))).toBe('[diff] x: size 20x12 against the golden\'s 20x10 (tolerance 0 %, above); fingerprint differs: image ubuntu24 20261012 → ubuntu26 20261101');
        } finally {
            fs.rmSync(other, { recursive: true, force: true });
        }
    });

    it('refuses a PNG without a sidecar, at another device pixel ratio or wider than its name (a window PNG)', () => {
        writeCrop(crops, FILE, { sidecar: false });
        expect(refusal(readCapture(crops, FILE))).toBe('no sidecar');
        writeCrop(crops, FILE, { dpr: 2 });
        expect(refusal(readCapture(crops, FILE))).toBe('DPR 2, not 1: goldens are CI-to-CI only');
        writeCrop(crops, FILE, { width: 40 });
        expect(refusal(readCapture(crops, FILE))).toBe('40 px wide, not 20: not a crop');
        writeCrop(crops, FILE);
        expect(refusal(readCapture(crops, FILE))).toBeUndefined();
    });

    it('prints a line per crop and a summary, and writes a diff image for a crop that differs', () => {
        const second = 'sidebar-sections.dark-modern.20.png';
        writeCrop(goldens, FILE);
        writeCrop(crops, FILE, { changed: [[1, 1]] });
        writeCrop(crops, second);
        writeCrop(crops, 'main-updates.dark-modern.20.png', { dpr: 2 });
        const diffDir = path.join(crops, 'diff');
        const { lines, counts } = compareAll(crops, goldens, diffDir);
        expect(lines).toEqual([
            '[diff] main-installed-single.dark-modern.20: 1 px (0.500 %, tolerance 0 %, above)',
            '[diff] main-updates.dark-modern.20: refused (DPR 2, not 1: goldens are CI-to-CI only)',
            '[diff] sidebar-sections.dark-modern.20: no golden',
            '[diff] summary: 1 compared, 0 at 0 px, 1 above tolerance, 1 without a golden, 1 refused',
        ]);
        expect(counts).toEqual({ compared: 1, zero: 0, above: 1, noGolden: 1, refused: 1 });
        expect(fs.readdirSync(diffDir)).toEqual([FILE]);
    });

    it('reports an unreadable crop, golden or sidecar as a line and goes on', () => {
        writeCrop(goldens, FILE);
        writeCrop(crops, FILE);
        fs.writeFileSync(path.join(crops, FILE.replace(/\.png$/, '.json')), '{ truncated');
        writeCrop(crops, 'sidebar-sections.dark-modern.20.png');
        fs.writeFileSync(path.join(goldens, 'sidebar-sections.dark-modern.20.png'), 'not a png');
        const { lines, counts } = compareAll(crops, goldens);
        expect(lines[0]).toMatch(/^\[diff\] main-installed-single\.dark-modern\.20: error \(/);
        expect(lines[1]).toMatch(/^\[diff\] sidebar-sections\.dark-modern\.20: error \(/);
        expect(counts).toMatchObject({ compared: 0, refused: 2 });
    });

    it('exits 0 for a comparison whatever it finds, 2 for a wrong usage and 1 for a refused adoption', () => {
        const script = path.join(root, 'scripts/compare-goldens.mjs');
        const run = (args: string[]) => {
            try {
                return { status: 0, out: execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' }) };
            } catch (error) {
                return { status: (error as { status: number }).status, out: String((error as { stdout?: string }).stdout ?? '') };
            }
        };
        writeCrop(goldens, FILE);
        writeCrop(crops, FILE, { changed: [[1, 1]] });
        const diffDir = path.join(crops, 'diff');
        const compared = run([crops, '--golden', goldens, '--diff', diffDir]);
        expect(compared.status).toBe(0);
        expect(compared.out.trim().split('\n')).toEqual([
            '[diff] main-installed-single.dark-modern.20: 1 px (0.500 %, tolerance 0 %, above)',
            '[diff] summary: 1 compared, 0 at 0 px, 1 above tolerance, 0 without a golden, 0 refused',
        ]);
        expect(fs.existsSync(path.join(diffDir, FILE))).toBe(true);
        expect(run([]).status).toBe(2);
        expect(run(['--adopt', crops, '--run', '9']).status).toBe(2);
        writeCrop(crops, 'main-updates.dark-modern.20.png', { dpr: 2 });
        expect(run(['--adopt', crops, '--run', '9', '--status', 'baseline', '--golden', goldens]).status).toBe(1);
    });

    it('adopts a run\'s crops with their sidecars and records status, run and sha256, refusing a non-crop', () => {
        writeCrop(crops, FILE);
        expect(adopt(crops, goldens, { run: '42', status: 'baseline' })).toEqual([FILE]);
        expect(fs.readdirSync(goldens).sort()).toEqual([FILE.replace(/\.png$/, '.json'), FILE, 'index.json'].sort());
        const index = JSON.parse(fs.readFileSync(path.join(goldens, 'index.json'), 'utf8')) as Record<string, { status: string; run: string; sha256: string; sidecarSha256: string }>;
        expect(index[FILE]).toMatchObject({ status: 'baseline', run: '42' });
        expect(index[FILE].sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(index[FILE].sidecarSha256).toMatch(/^[0-9a-f]{64}$/);
        // The same hash for a sidecar the Windows checkout wrote with CRLF.
        const sidecar = path.join(goldens, FILE.replace(/\.png$/, '.json'));
        fs.writeFileSync(sidecar, fs.readFileSync(sidecar, 'utf8').replace(/\n/g, '\r\n'));
        expect(textSha256(sidecar)).toBe(index[FILE].sidecarSha256);
        writeCrop(crops, 'main-updates.dark-modern.20.png', { width: 40 });
        expect(() => adopt(crops, goldens, { run: '43', status: 'approved' })).toThrow('main-updates.dark-modern.20.png (40 px wide, not 20: not a crop)');
    });

    it('keeps the committed goldens to CI crops of the captures states.ts names, each recorded in index.json by run and sha256', () => {
        const dir = path.join(root, 'src/test/ui/v2/golden');
        const expected = new Set(expectedFiles());
        const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as Record<string, { status: string; run: string; sha256: string; sidecarSha256: string }>;
        const pngs = fs.readdirSync(dir).filter(name => name.endsWith('.png')).sort();
        expect(pngs.length).toBeGreaterThan(0);
        // Every index entry has its PNG, every PNG its entry, and every sidecar its PNG.
        expect(Object.keys(index).sort()).toEqual(pngs);
        expect(fs.readdirSync(dir).filter(name => name.endsWith('.json') && name !== 'index.json').sort()).toEqual(pngs.map(file => file.replace(/\.png$/, '.json')));
        const hash = (file: string) => createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex');
        for (const file of pngs) {
            expect(expected.has(file), `${file} is a capture of states.ts`).toBe(true);
            const golden = readCapture(dir, file);
            // A sidecar, DPR 1 and the width of its name: a crop of a CI run, never a window PNG or a local capture.
            expect(refusal(golden), file).toBeUndefined();
            expect(['baseline', 'approved'], `${file} in index.json`).toContain(index[file].status);
            expect(index[file].sha256, `${file}'s bytes are the ones adopted`).toBe(hash(file));
            // The diff applies the golden sidecar's masks: a widened mask would hide pixels without a CSS reason.
            expect(index[file].sidecarSha256, `${file}'s sidecar is the one adopted`).toBe(textSha256(path.join(dir, file.replace(/\.png$/, '.json'))));
            expect(index[file].run, `${file} comes from a CI run`).toMatch(/^\d+$/);
            expect(golden.sidecar.run, `${file}'s sidecar names the same run`).toBe(index[file].run);
        }
    });
});
