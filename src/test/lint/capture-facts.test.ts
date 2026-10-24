// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_FACTS, sidecarFile } from '../ui/v2/golden';

/**
 * UX-P0.15: the in-page script that reads a capture's facts for its sidecar (`src/test/ui/v2/golden.ts`). jsdom has no
 * layout and no canvas: rectangles are stubbed and the font facts are empty; the UI job proves both in Chromium.
 */
describe('capture facts (UX-P0.15)', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('names the sidecar beside its crop', () => {
        expect(sidecarFile('main-installed-single.dark-modern.1200.png')).toBe('main-installed-single.dark-modern.1200.json');
    });

    it('resolves each mask to its rectangles, rounded outwards and clipped to the crop and the viewport', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        document.body.innerHTML = '<main data-testid="nuiget-app"><section data-testid="live" data-rect="10.4,20.6,1300,30"></section><section data-testid="live" data-rect="0,0,0,0"></section></main>';
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
            const [left, top, right, bottom] = ((this as HTMLElement).dataset.rect ?? '0,0,0,0').split(',').map(Number);
            return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect;
        });
        const facts = new Function(CAPTURE_FACTS).apply(null, ['nuiget-app', [{ selector: '[data-testid="live"]' }, { selector: '.absent' }], 1200]) as {
            masks: Array<{ selector: string; rects: Array<{ x: number; y: number; w: number; h: number }> }>; referenceWidth: number; dpr: number;
        };
        expect(facts.masks).toEqual([
            { selector: '[data-testid="live"]', rects: [{ x: 10, y: 20, w: 1190, h: 10 }] },
            { selector: '.absent', rects: [] },
        ]);
        expect(facts.referenceWidth).toBe(0);
        expect(typeof facts.dpr).toBe('number');
    });
});
