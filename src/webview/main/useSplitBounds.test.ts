import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampTo, splitBounds, useSplitBounds } from './useSplitBounds';

describe('useSplitBounds (UX-P3.3b)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('measures the split on mount and again when it resizes, and disconnects on unmount', () => {
        let resized: (() => void) | undefined;
        const disconnect = vi.fn();
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback: () => void) {
                resized = callback;
            }
            observe(): void {}
            disconnect(): void {
                disconnect();
            }
        });
        const split = document.createElement('div');
        split.style.setProperty('--nuiget-list-pane-min', '170px');
        split.style.setProperty('--nuiget-details-pane-min', '220px');
        const sash = document.createElement('div');
        sash.className = 'nuiget-sash';
        Object.defineProperty(sash, 'offsetWidth', { value: 4 });
        split.append(sash);
        let width = 1200;
        Object.defineProperty(split, 'clientWidth', { get: () => width });
        // One ref for the hook's life, as a component's `useRef` gives it.
        const ref = { current: split };
        const { result, unmount } = renderHook(() => useSplitBounds(ref, { min: 25, max: 75 }));
        expect(result.current).toEqual({ min: 15, max: 81 });
        width = 800;
        act(() => resized?.());
        expect(result.current).toEqual({ min: 22, max: 72 });
        unmount();
        expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it('keeps the fallback without a ResizeObserver or before layout', () => {
        vi.stubGlobal('ResizeObserver', undefined);
        const ref = { current: document.createElement('div') };
        const { result } = renderHook(() => useSplitBounds(ref, { min: 25, max: 75 }));
        expect(result.current).toEqual({ min: 25, max: 75 });
        expect(splitBounds(0, 4, 170, 220, { min: 30, max: 70 })).toEqual({ min: 30, max: 70 });
    });

    it('clamps a share into the bounds', () => {
        expect(clampTo(10, { min: 15, max: 81 })).toBe(15);
        expect(clampTo(90, { min: 15, max: 81 })).toBe(81);
        expect(clampTo(35, { min: 15, max: 81 })).toBe(35);
    });
});
