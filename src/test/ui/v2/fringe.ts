/**
 * DS-TYPE-10 (UX-P3.fix-4, H27; design-advisor opening ruling of 2026-11-13): whether the side bar's text keeps its
 * subpixel (LCD) rendering, read from a capture's pixels inside the client rect of every visible text line.
 *
 * Pure: the capture suite collects the line rects in the webview (`COLLECT_TEXT_LINES`), decodes the crop
 * (`scripts/crop-png.mjs`) and hands both here; `src/test/lint/fringe.test.ts` proves the reader on two tracked crops.
 */

/** A pixel is ink when one of its channels differs from the line's background by more than this. */
export const INK_DELTA = 30;
/** An ink pixel is a coloured fringe when its channel spread (max − min of R, G, B) exceeds this. */
export const FRINGE_SPREAD = 8;
/** A text colour or a background is neutral when its channel spread is at most this. */
export const NEUTRAL_SPREAD = 8;
/** A line with fewer ink pixels is too small to judge. */
export const MIN_INK = 40;
/** A judged line is greyscale when `fringe / ink` is below this. */
export const LCD_RATIO = 0.10;
/** A line rect lower than this (CSS px) is not judged. */
export const MIN_LINE_HEIGHT = 4;

/** One line of text as the page reports it: a client rect in CSS px of the webview's viewport. */
export interface TextLine {
    x: number;
    y: number;
    width: number;
    height: number;
    /** The nearest `data-testid`, else the first 20 characters of the text. */
    label: string;
    /** The computed `color` of the text's element, as `[r, g, b]`. */
    color: [number, number, number];
    /** Whether `elementFromPoint` at the rect's centre is the text's element or inside it (not covered, not clipped). */
    visible: boolean;
}

/** The decoded crop: RGBA bytes, row by row, in device pixels. */
export interface Pixels {
    width: number;
    height: number;
    pixels: Uint8Array;
}

export interface LineVerdict {
    label: string;
    ink: number;
    fringe: number;
    /** Why the line is not judged, or undefined when it is. */
    skipped?: string;
    greyscale: boolean;
}

export interface FringeSummary {
    judged: number;
    greyscale: number;
    skipped: number;
    /** The first greyscale line's label, or undefined. */
    first?: string;
    /** `judged ≥ 1` and no greyscale line. */
    pass: boolean;
}

const spread = (r: number, g: number, b: number): number => Math.max(r, g, b) - Math.min(r, g, b);

/** The verdict of one line on a crop taken at `dpr` device pixels per CSS px. */
export function lineVerdict(image: Pixels, line: TextLine, dpr: number): LineVerdict {
    const base = { label: line.label, ink: 0, fringe: 0, greyscale: false };
    if (line.height < MIN_LINE_HEIGHT) {
        return { ...base, skipped: 'low' };
    }
    if (!line.visible) {
        return { ...base, skipped: 'covered' };
    }
    if (spread(...line.color) > NEUTRAL_SPREAD) {
        return { ...base, skipped: 'coloured text' };
    }
    const left = Math.max(0, Math.round(line.x * dpr));
    const top = Math.max(0, Math.round(line.y * dpr));
    const right = Math.min(image.width, Math.round((line.x + line.width) * dpr));
    const bottom = Math.min(image.height, Math.round((line.y + line.height) * dpr));
    if (right <= left || bottom <= top) {
        return { ...base, skipped: 'outside' };
    }
    // The background is the most frequent colour inside the rect.
    const counts = new Map<number, number>();
    for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
            const at = (y * image.width + x) * 4;
            const key = (image.pixels[at] << 16) | (image.pixels[at + 1] << 8) | image.pixels[at + 2];
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
    }
    let background = 0;
    let most = -1;
    for (const [key, count] of counts) {
        if (count > most) {
            most = count;
            background = key;
        }
    }
    const [br, bg, bb] = [background >> 16, (background >> 8) & 255, background & 255];
    if (spread(br, bg, bb) > NEUTRAL_SPREAD) {
        return { ...base, skipped: 'coloured surface' };
    }
    let ink = 0;
    let fringe = 0;
    for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
            const at = (y * image.width + x) * 4;
            const [r, g, b] = [image.pixels[at], image.pixels[at + 1], image.pixels[at + 2]];
            if (Math.max(Math.abs(r - br), Math.abs(g - bg), Math.abs(b - bb)) > INK_DELTA) {
                ink++;
                if (spread(r, g, b) > FRINGE_SPREAD) {
                    fringe++;
                }
            }
        }
    }
    if (ink < MIN_INK) {
        return { ...base, ink, fringe, skipped: 'little ink' };
    }
    return { ...base, ink, fringe, greyscale: fringe / ink < LCD_RATIO };
}

/** Every line's verdict. */
export function lineVerdicts(image: Pixels, lines: readonly TextLine[], dpr: number): LineVerdict[] {
    return lines.map(line => lineVerdict(image, line, dpr));
}

export function summarize(verdicts: readonly LineVerdict[]): FringeSummary {
    const judged = verdicts.filter(verdict => verdict.skipped === undefined);
    const greyscale = judged.filter(verdict => verdict.greyscale);
    return {
        judged: judged.length,
        greyscale: greyscale.length,
        skipped: verdicts.length - judged.length,
        first: greyscale[0]?.label,
        pass: judged.length >= 1 && greyscale.length === 0,
    };
}

/** `[fringe] <name>: <judged> lines, <g> greyscale (<first>), <s> skipped`. */
export function fringeLine(name: string, summary: FringeSummary): string {
    const first = summary.first === undefined ? '' : ` (${summary.first})`;
    return `[fringe] ${name}: ${summary.judged} lines, ${summary.greyscale} greyscale${first}, ${summary.skipped} skipped`;
}

/** The value of DS-TYPE-10's `[measure]` line. */
export function fringeValue(summary: FringeSummary): string {
    return `${summary.judged} lines judged, ${summary.greyscale} greyscale${summary.first === undefined ? '' : ` (first ${summary.first})`}`;
}

/**
 * In the webview (one argument: the root's test id): the client rect of every line of every visible text node under the
 * root, with its element's computed colour and whether the element is what the page shows at the rect's centre.
 */
export const COLLECT_TEXT_LINES = `
const root = document.querySelector('[data-testid="' + arguments[0] + '"]') || document.body;
const rgb = text => { const m = /rgba?\\(([^)]+)\\)/.exec(text || ''); if (!m) { return [0, 0, 0]; } const p = m[1].split(',').map(Number); return [p[0], p[1], p[2]]; };
const lines = [];
const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
    const element = node.parentElement;
    if (!text || !element) { continue; }
    const style = getComputedStyle(element);
    if (style.visibility !== 'visible' || Number(style.opacity) === 0) { continue; }
    const range = document.createRange();
    range.selectNodeContents(node);
    const tagged = element.closest('[data-testid]');
    const label = tagged ? tagged.getAttribute('data-testid') : text.slice(0, 20);
    for (const rect of range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) { continue; }
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        lines.push({ x: rect.left, y: rect.top, width: rect.width, height: rect.height, label, color: rgb(style.color), visible: hit !== null && (hit === element || element.contains(hit)) });
    }
}
return lines;`;
