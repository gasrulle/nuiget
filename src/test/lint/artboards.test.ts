// @vitest-environment jsdom
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { encodePng } from '../../../scripts/crop-png.mjs';
import { artboardFile, artboardFilter, artboardJobs, ARTBOARDS, type ColourSample, colourMatches, isSpecRender, pixelAt, SAMPLE_COLOUR, sampleVerdict, SATURATION_MIN } from '../ui/v2/artboards';

/**
 * UX-P0.27: the artboard export's manifest, its colour sample and the pixel read of `src/test/ui/v2/artboards.ts`. The
 * renders themselves are the `ui` job's `[artboard]` lines; this test holds the names, the filter, the sample's point and
 * the verdict on every push, and proves the mismatch path with a PNG in the colour a display profile made of the token
 * (`docs/design/export-method.md`: `#04395e` came out `#1b395c` on macOS).
 */
const SELECTED = '[data-testid="package-row-newtonsoft.json"]';

describe('the artboard manifest (UX-P0.27)', () => {
    it('renders artboard A as P0.27a did: both looks, Dark Modern, 932 px, under the capture names', () => {
        const jobs = artboardJobs();
        expect(jobs.map(artboardFile)).toEqual(['main-installed-single.dark-modern.932.png', 'main-installed-single.dark-modern-classic.932.png']);
        expect(jobs.map(job => job.width.viewport)).toEqual([1280, 1280]);
        expect(jobs.every(isSpecRender)).toBe(true);
    });

    it('names, for every entry, a source, its themes and a sample the artboard has', () => {
        for (const entry of ARTBOARDS) {
            const source = path.resolve('docs/design', entry.source);
            expect(existsSync(source), source).toBe(true);
            // The sample is looked up inside the panel, as `SAMPLE_COLOUR` does (artboard A has the id in its side bar too).
            document.body.innerHTML = readFileSync(source, 'utf8');
            const panel = document.querySelector(`[data-testid="${entry.panel}"]`);
            expect(panel, entry.panel).not.toBeNull();
            expect(panel?.querySelector(entry.sample), entry.sample).not.toBeNull();
            document.body.innerHTML = '';
            for (const theme of entry.themes) {
                expect(existsSync(path.resolve('docs/design/themes', `${theme}.css`)), theme).toBe(true);
            }
            expect(entry.widths.every(width => width.viewport >= width.panel)).toBe(true);
        }
    });

    it('narrows the renders by state, theme and look, and refuses a name it does not know', () => {
        expect(artboardFilter({})).toEqual({ states: undefined, themes: undefined, looks: undefined });
        expect(artboardJobs(ARTBOARDS, artboardFilter({ NUIGET_ARTBOARD_LOOKS: 'classic' })).map(artboardFile)).toEqual(['main-installed-single.dark-modern-classic.932.png']);
        expect(artboardJobs(ARTBOARDS, artboardFilter({ NUIGET_ARTBOARD_THEMES: 'light-modern' }))).toEqual([]);
        expect(artboardJobs(ARTBOARDS, artboardFilter({ NUIGET_ARTBOARD_STATES: ' main-installed-single , ' })).length).toBe(2);
        expect(() => artboardFilter({ NUIGET_ARTBOARD_STATES: 'main-updates' })).toThrow('no artboard for main-updates');
        expect(() => artboardFilter({ NUIGET_ARTBOARD_THEMES: 'solarized' })).toThrow('no theme solarized');
        expect(() => artboardFilter({ NUIGET_ARTBOARD_LOOKS: 'compact' })).toThrow('no look compact');
    });

    it('writes a spec only for an entry\'s first width and theme', () => {
        const [entry] = ARTBOARDS;
        const wider = { ...entry, themes: ['dark-modern', 'light-modern'] as const, widths: [...entry.widths, { panel: 1200, viewport: 1520 }] };
        const jobs = artboardJobs([wider]);
        expect(jobs.filter(isSpecRender).map(artboardFile)).toEqual(['main-installed-single.dark-modern.932.png', 'main-installed-single.dark-modern-classic.932.png']);
        expect(jobs.map(artboardFile)).toContain('main-installed-single.light-modern-classic.1200.png');
    });
});

describe('the colour sample (UX-P0.27)', () => {
    const scratch: string[] = [];
    afterEach(() => {
        for (const dir of scratch.splice(0)) {
            rmSync(dir, { recursive: true, force: true });
        }
        document.body.innerHTML = '';
    });

    /** A 4 × 4 PNG filled with one colour, written with `scripts/crop-png.mjs`'s encoder. */
    const filled = (rgb: [number, number, number]): string => {
        const dir = mkdtempSync(path.join(tmpdir(), 'nuiget-artboards-'));
        scratch.push(dir);
        const file = path.join(dir, 'fill.png');
        const pixels = Buffer.alloc(4 * 4 * 4);
        for (let i = 0; i < 16; i++) {
            pixels.set([...rgb, 255], i * 4);
        }
        encodePng(file, 4, 4, pixels);
        return file;
    };
    const sample: ColourSample = { x: 8, y: 30, rgb: [4, 57, 94], selector: SELECTED };

    it('matches the token read back from a PNG in the token\'s colour', () => {
        const actual = pixelAt(filled([4, 57, 94]), 1, 2);
        expect(actual).toEqual([4, 57, 94, 255]);
        expect(sampleVerdict(sample, actual)).toEqual({ text: `sample rgb(4, 57, 94) ${SELECTED} at 8,30: rgb(4, 57, 94), match` });
    });

    it('fails loudly on the colour a display profile makes of it', () => {
        const actual = pixelAt(filled([27, 57, 92]), 3, 3);
        const verdict = sampleVerdict(sample, actual);
        expect(verdict.text).toBe(`sample rgb(4, 57, 94) ${SELECTED} at 8,30: rgb(27, 57, 92), mismatch`);
        expect(verdict.failure).toBe(`colour profile mismatch: ${SELECTED} computes rgb(4, 57, 94) and renders rgb(27, 57, 92) at 8,30`);
    });

    it('allows one level per channel and fails a sample it could not measure or read', () => {
        expect(colourMatches([4, 57, 94], [5, 56, 94, 255])).toBe(true);
        expect(colourMatches([4, 57, 94], [6, 57, 94, 255])).toBe(false);
        expect(sampleVerdict({ error: 'no x in the panel' }, undefined).failure).toBe('colour sample not measurable: no x in the panel');
        expect(sampleVerdict(sample, undefined).failure).toBe(`colour sample ${SELECTED} at 8,30 not read`);
    });

    /** jsdom has no layout: an element's box is its `data-rect` ("left,top,right,bottom"), and a point hits the deepest box. */
    const layOut = (): void => {
        const boxOf = (el: Element) => {
            const [left, top, right, bottom] = (el.getAttribute('data-rect') ?? '0,0,0,0').split(',').map(Number);
            return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) };
        };
        for (const el of document.querySelectorAll('[data-rect]')) {
            (el as HTMLElement).getBoundingClientRect = () => boxOf(el) as DOMRect;
        }
        document.elementFromPoint = (x: number, y: number) => {
            const hits = [...document.querySelectorAll('[data-rect]')].filter(el => {
                const box = boxOf(el);
                return x >= box.left && x < box.right && y >= box.top && y < box.bottom;
            });
            return hits.at(-1) ?? null;
        };
    };
    const run = (selector = SELECTED): ColourSample =>
        new Function(SAMPLE_COLOUR).apply(null, ['nuiget-app', selector, SATURATION_MIN]) as ColourSample;
    const page = (style: string, child = '<span data-rect="16,20,600,40">Newtonsoft.Json</span>'): void => {
        document.body.innerHTML = `<main data-testid="nuiget-app" data-rect="0,0,932,800"><div data-testid="package-row-newtonsoft.json" data-rect="0,0,327,60" style="${style}">${child}</div></main>`;
        layOut();
    };

    it('takes a point of the sample in its start padding, where the element itself is hit', () => {
        page('background-color: rgb(4, 57, 94); padding: 0 6px 0 16px');
        expect(run()).toEqual({ x: 8, y: 30, rgb: [4, 57, 94], selector: SELECTED });
    });

    it('takes another point when its children cover the start padding', () => {
        page('background-color: rgb(4, 57, 94); padding: 0 6px 0 16px', '<span data-rect="0,0,300,60">covers the start</span>');
        expect(run()).toEqual({ x: 324, y: 30, rgb: [4, 57, 94], selector: SELECTED });
    });

    it('refuses a missing, transparent, grey or covered sample', () => {
        page('background-color: rgb(4, 57, 94)');
        expect(run('[data-testid="nope"]')).toEqual({ error: 'no [data-testid="nope"] in the panel' });
        page('background-color: rgba(4, 57, 94, 0.5)');
        expect(run()).toEqual({ error: `${SELECTED} is not filled with an opaque colour (rgba(4, 57, 94, 0.5))` });
        page('background-color: rgb(60, 60, 60)');
        expect(run()).toEqual({ error: `${SELECTED} is not saturated (rgb(60, 60, 60))` });
        page('background-color: rgb(4, 57, 94)', '<span data-rect="0,0,327,60">covers it all</span>');
        expect(run()).toEqual({ error: `no point of ${SELECTED} shows its own background` });
    });
});
