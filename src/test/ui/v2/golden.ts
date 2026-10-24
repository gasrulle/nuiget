/**
 * The capture sidecar of the pixel diff (UX-P0.15; plan MS-9, H27, H76, H78): beside each webview crop
 * `<state>.<theme>.<width>.png` the capture suite writes `<state>.<theme>.<width>.json` with what `scripts/compare-goldens.mjs`
 * needs to compare the crop with its golden offline: the state's masks resolved to rectangles in the crop (live regions a
 * diff leaves out), the state's tolerance, and a text-metrics fingerprint (the resolved font, the width of a reference
 * string, the device pixel ratio, the host) that tells a font or host change from a regression. The goldens under
 * `src/test/ui/v2/golden/` carry the sidecar of the run they were copied from.
 *
 * Plain data and string scripts, like `measure.ts`: `src/test/lint` imports it without ExTester.
 */

/** A rectangle in the crop, in CSS px (equal to image px at DPR 1). */
export interface CropRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** What tells one rendering host from another: a diff across two fingerprints is not a regression signal. */
export interface Fingerprint {
    /** The webview root's computed `font-family`. */
    fontFamily: string;
    /** The canvas font the reference string was measured in. */
    font: string;
    /** The width of `REFERENCE_TEXT` in that font, in CSS px to 0.01. */
    referenceWidth: number;
    dpr: number;
    vscode: string;
    chromium: string;
    /** The runner image (`ImageOS` and `ImageVersion` on GitHub's runners), else the platform. */
    image: string;
}

export interface Sidecar {
    state: string;
    theme: string;
    look: 'modern' | 'classic';
    width: number;
    /** The share of the crop's pixels that may differ, in percent (`NamedState.diffTolerance`). */
    tolerance: number;
    masks: Array<{ selector: string; reason: string; rects: CropRect[] }>;
    fingerprint: Fingerprint;
    run: string;
}

export const REFERENCE_TEXT = 'The quick brown fox jumps over the lazy dog 0123456789';

/** The sidecar's file name beside its crop. */
export const sidecarFile = (crop: string): string => crop.replace(/\.png$/, '.json');

/**
 * Runs in the webview: `arguments[0]` is the root's test id, `arguments[1]` the state's masks (`{ selector }`),
 * `arguments[2]` the crop's width. Returns the root's font facts and each mask's rectangles clipped to the crop.
 */
export const CAPTURE_FACTS = `
const [rootTestId, masks, width] = arguments;
const root = document.querySelector('[data-testid="' + rootTestId + '"]') || document.body;
const style = getComputedStyle(root);
const context = document.createElement('canvas').getContext('2d');
if (context) context.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
const round = n => Math.round(n * 100) / 100;
const height = window.innerHeight;
return {
    fontFamily: style.fontFamily,
    font: context ? context.font : '',
    referenceWidth: context ? round(context.measureText(${JSON.stringify(REFERENCE_TEXT)}).width) : 0,
    dpr: window.devicePixelRatio,
    masks: masks.map(mask => ({
        selector: mask.selector,
        rects: [...document.querySelectorAll(mask.selector)].map(el => el.getBoundingClientRect()).map(r => {
            const left = Math.max(0, Math.floor(r.left)), top = Math.max(0, Math.floor(r.top));
            const right = Math.min(width, Math.ceil(r.right)), bottom = Math.min(height, Math.ceil(r.bottom));
            return { x: left, y: top, w: right - left, h: bottom - top };
        }).filter(r => r.w > 0 && r.h > 0),
    })),
};
`;
