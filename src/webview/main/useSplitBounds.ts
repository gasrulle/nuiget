import { useEffect, useState } from 'react';
import type React from 'react';

/** A percent range of the split's width. */
export interface SplitRange {
    min: number;
    max: number;
}

/**
 * The sash's bounds in percent of the split's width from the panes' px minimums (UX-P3.3b): the list keeps
 * `--nuiget-list-pane-min`, the details keep `--nuiget-details-pane-min` beside the sash. When both cannot fit, the list
 * keeps its minimum (`max` falls to `min`). Without a width (not laid out yet) the bounds are the fallback range.
 */
export function splitBounds(width: number, sash: number, listMin: number, detailsMin: number, fallback: SplitRange = { min: 25, max: 75 }): SplitRange {
    if (!(width > 0) || !Number.isFinite(listMin) || !Number.isFinite(detailsMin)) {
        return { min: fallback.min, max: fallback.max };
    }
    const min = Math.ceil(listMin / width * 100);
    const max = Math.floor((width - sash - detailsMin) / width * 100);
    return { min, max: Math.max(min, max) };
}

export const clampTo = (value: number, bounds: SplitRange): number => Math.min(bounds.max, Math.max(bounds.min, value));

/** The split's bounds, measured again whenever the split element changes size; the fallback until it is laid out. */
export function useSplitBounds(ref: React.RefObject<HTMLElement | null>, fallback: SplitRange): SplitRange {
    const [bounds, setBounds] = useState<SplitRange>({ min: fallback.min, max: fallback.max });
    const { min: fallbackMin, max: fallbackMax } = fallback;
    useEffect(() => {
        const element = ref.current;
        if (element === null || typeof ResizeObserver === 'undefined') {
            return undefined;
        }
        const measure = (): void => {
            const style = getComputedStyle(element);
            const sash = element.querySelector<HTMLElement>(':scope > .nuiget-sash')?.offsetWidth ?? 0;
            const listMin = Number.parseFloat(style.getPropertyValue('--nuiget-list-pane-min'));
            const detailsMin = Number.parseFloat(style.getPropertyValue('--nuiget-details-pane-min'));
            setBounds(splitBounds(element.clientWidth, sash, listMin, detailsMin, { min: fallbackMin, max: fallbackMax }));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref, fallbackMin, fallbackMax]);
    return bounds;
}
