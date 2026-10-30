import { execFileSync } from 'child_process';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { captureFile, type Look, MATRIX_THEMES, type Theme } from './states';

/**
 * The artboard export's list and checks (UX-P0.27; `docs/design/export-method.md`). The export suite
 * (`capture/zz-artboards.ui.test.ts`) renders each entry's artboard in VS Code's integrated browser, once per width, theme
 * and look, and writes `artboards/<state>.<theme>.<width>.png` (the capture naming of `states.ts`, `<theme>-classic` for the
 * classic look) beside the crops, with `artboards/<state>.spec.json` for the entry's first theme and width (helper 8's
 * input). Every render samples one saturated pixel whose colour the page computes, and a pixel that differs is a colour
 * profile the renderer did not ask for: the suite fails, after writing the PNG. `scripts/render-artboards.mjs` runs the
 * suite alone and narrows it with `NUIGET_ARTBOARD_STATES`, `NUIGET_ARTBOARD_THEMES` and `NUIGET_ARTBOARD_LOOKS`.
 *
 * Plain data and string scripts, like `measure.ts`: `src/test/lint` imports it without ExTester.
 */

/** A rendered width: the panel's width in the artboard at a viewport of `viewport` CSS px (DPR 1). */
export interface ArtboardWidth {
    panel: number;
    viewport: number;
}

export interface ArtboardEntry {
    /** The named state the artboard draws; the PNGs and the spec carry its name. */
    state: string;
    /** The artboard's page, relative to `docs/design` (the root `scripts/serve-artboards.mjs` serves). */
    source: string;
    /** The test id of the element the PNG clips: the surface the state's captures crop. */
    panel: string;
    /** A selector, inside the panel, of an element filled with one saturated colour: the render's colour sample. */
    sample: string;
    themes: readonly Theme[];
    looks: readonly Look[];
    widths: readonly ArtboardWidth[];
}

/** Artboard A (round 1, composition A; UX-P0.27a): the main panel at 932 px in Dark Modern, both looks. */
export const ARTBOARDS: readonly ArtboardEntry[] = [
    {
        state: 'main-installed-single',
        source: 'artboards/round1/A-Extensions.dc.html',
        panel: 'nuiget-app',
        // The selected row's band, `list.activeSelectionBackground` (#04395e in Dark Modern).
        sample: '[data-testid="package-row-newtonsoft.json"]',
        themes: ['dark-modern'],
        looks: ['modern', 'classic'],
        widths: [{ panel: 932, viewport: 1280 }],
    },
];

/** One render: an entry at a width, a theme and a look. */
export interface ArtboardJob {
    entry: ArtboardEntry;
    width: ArtboardWidth;
    theme: Theme;
    look: Look;
}

export interface ArtboardFilter {
    states?: readonly string[];
    themes?: readonly Theme[];
    looks?: readonly Look[];
}

const list = (value: string | undefined): string[] | undefined =>
    value === undefined || value.trim() === '' ? undefined : value.split(',').map(item => item.trim()).filter(item => item !== '');

/**
 * The filter of `NUIGET_ARTBOARD_STATES`, `NUIGET_ARTBOARD_THEMES` and `NUIGET_ARTBOARD_LOOKS` (comma lists; unset is
 * everything). A name the manifest, the themes or the looks do not know throws, so a typo never renders nothing.
 */
export function artboardFilter(env: Readonly<Record<string, string | undefined>>, entries: readonly ArtboardEntry[] = ARTBOARDS): ArtboardFilter {
    const states = list(env.NUIGET_ARTBOARD_STATES);
    const themes = list(env.NUIGET_ARTBOARD_THEMES);
    const looks = list(env.NUIGET_ARTBOARD_LOOKS);
    for (const state of states ?? []) {
        if (!entries.some(entry => entry.state === state)) {
            throw new Error(`NUIGET_ARTBOARD_STATES: no artboard for ${state} (${entries.map(entry => entry.state).join(', ')})`);
        }
    }
    for (const theme of themes ?? []) {
        if (!(MATRIX_THEMES as readonly string[]).includes(theme)) {
            throw new Error(`NUIGET_ARTBOARD_THEMES: no theme ${theme} (${MATRIX_THEMES.join(', ')})`);
        }
    }
    for (const look of looks ?? []) {
        if (look !== 'modern' && look !== 'classic') {
            throw new Error(`NUIGET_ARTBOARD_LOOKS: no look ${look} (modern, classic)`);
        }
    }
    return { states, themes: themes as Theme[] | undefined, looks: looks as Look[] | undefined };
}

/** The renders of `entries` the filter keeps, entry by entry, then width, theme and look (the viewport changes least). */
export function artboardJobs(entries: readonly ArtboardEntry[] = ARTBOARDS, filter: ArtboardFilter = {}): ArtboardJob[] {
    return entries
        .filter(entry => filter.states === undefined || filter.states.includes(entry.state))
        .flatMap(entry => entry.widths.flatMap(width => entry.themes
            .filter(theme => filter.themes === undefined || filter.themes.includes(theme))
            .flatMap(theme => entry.looks
                .filter(look => filter.looks === undefined || filter.looks.includes(look))
                .map(look => ({ entry, width, theme, look })))));
}

/** The PNG of a render, named as the state's capture at that theme, look and panel width. */
export const artboardFile = (job: ArtboardJob): string => captureFile(job.entry.state, { theme: job.theme, look: job.look, width: job.width.panel });

/** The render whose spec the entry writes: its first width and theme (helper 8 compares a capture of that theme and width). */
export const isSpecRender = (job: ArtboardJob): boolean => job.width === job.entry.widths[0] && job.theme === job.entry.themes[0];

/** What the page says of its colour sample: a point in page coordinates and the colour the page computes there. */
export type ColourSample = { x: number; y: number; rgb: [number, number, number]; selector: string } | { error: string };

/** The least spread between a sample's channels: a grey sample cannot tell one colour profile from another. */
export const SATURATION_MIN = 32;

/**
 * Runs in the artboard page with the panel's test id and the sample's selector: a point inside the sample element, off
 * its children and its outline, where the element itself is hit, and its computed background, which must be opaque and
 * saturated. Anything else is an error, which fails the render.
 */
export const SAMPLE_COLOUR = `
const panel = document.querySelector('[data-testid="' + arguments[0] + '"]');
const el = panel ? panel.querySelector(arguments[1]) : null;
if (!el) return { error: 'no ' + arguments[1] + ' in the panel' };
const colour = getComputedStyle(el).backgroundColor;
const parts = /^rgba?\\(([\\d.]+), ([\\d.]+), ([\\d.]+)(?:, ([\\d.]+))?\\)$/.exec(colour);
if (!parts || (parts[4] !== undefined && Number(parts[4]) !== 1)) return { error: arguments[1] + ' is not filled with an opaque colour (' + colour + ')' };
const rgb = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
if (Math.max(...rgb) - Math.min(...rgb) < arguments[2]) return { error: arguments[1] + ' is not saturated (' + colour + ')' };
const r = el.getBoundingClientRect();
const s = getComputedStyle(el);
const left = r.left + (parseFloat(s.borderLeftWidth) || 0);
const right = r.right - (parseFloat(s.borderRightWidth) || 0);
const middle = Math.floor(r.top + r.height / 2);
const inset = Math.max(3, Math.abs(parseFloat(s.outlineOffset) || 0) + (parseFloat(s.outlineWidth) || 0) + 2);
const candidates = [
    [left + Math.max(inset, (parseFloat(s.paddingLeft) || 0) / 2), middle],
    [right - Math.max(inset, (parseFloat(s.paddingRight) || 0) / 2), middle],
    [r.left + r.width / 2, middle],
];
for (const [x, y] of candidates.map(([x, y]) => [Math.floor(x), y])) {
    if (document.elementFromPoint(x + 0.5, y + 0.5) === el) return { x, y, rgb, selector: arguments[1] };
}
return { error: 'no point of ' + arguments[1] + ' shows its own background' };
`;

/** Whether `actual` is `expected` within `tolerance` levels per channel (a colour profile moves saturated colours by tens). */
export const colourMatches = (expected: readonly number[], actual: readonly number[], tolerance = 1): boolean =>
    expected.length === 3 && actual.length >= 3 && expected.every((value, index) => Math.abs(value - actual[index]) <= tolerance);

const rgb = (channels: readonly number[]): string => `rgb(${channels.slice(0, 3).join(', ')})`;

/** The sample's part of the `[artboard]` line, and the failure when it does not match. */
export function sampleVerdict(sample: ColourSample, actual: readonly number[] | undefined): { text: string; failure?: string } {
    if ('error' in sample) {
        return { text: `sample not measurable: ${sample.error}`, failure: `colour sample not measurable: ${sample.error}` };
    }
    const at = `${sample.selector} at ${sample.x},${sample.y}`;
    if (actual === undefined) {
        return { text: `sample ${rgb(sample.rgb)} ${at}: not read`, failure: `colour sample ${at} not read` };
    }
    if (colourMatches(sample.rgb, actual)) {
        return { text: `sample ${rgb(sample.rgb)} ${at}: ${rgb(actual)}, match` };
    }
    return {
        text: `sample ${rgb(sample.rgb)} ${at}: ${rgb(actual)}, mismatch`,
        failure: `colour profile mismatch: ${sample.selector} computes ${rgb(sample.rgb)} and renders ${rgb(actual)} at ${sample.x},${sample.y}`,
    };
}

/** Prints the RGBA of one pixel of a PNG, read with the decoder of `scripts/crop-png.mjs`. */
const PIXEL_AT = 'const { decodePng } = await import(process.argv[1]); const [file, x, y] = process.argv.slice(2); const png = decodePng(file); '
    + 'const at = (Number(y) * png.width + Number(x)) * 4; console.log(JSON.stringify([...png.pixels.subarray(at, at + 4)]));';

/** The RGBA of the pixel at `x`, `y` of a PNG (the capture suite reads its scrollbar probe the same way). */
export function pixelAt(png: string, x: number, y: number): number[] {
    const decoder = pathToFileURL(path.resolve('scripts/crop-png.mjs')).href;
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', PIXEL_AT, decoder, png, String(Math.round(x)), String(Math.round(y))], { encoding: 'utf8' })) as number[];
}
