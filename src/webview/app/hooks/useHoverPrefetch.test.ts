import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LRUMap, type PackageMetadata } from '../types';
import { useHoverPrefetch, type HoverPrefetchOptions } from './useHoverPrefetch';

function makeDeps(overrides: Partial<HoverPrefetchOptions> = {}): HoverPrefetchOptions {
    const versionsCache = { current: new LRUMap<string, string[]>(50) } as React.MutableRefObject<LRUMap<string, string[]>>;
    const metadataCache = { current: new LRUMap<string, PackageMetadata>(50) } as React.MutableRefObject<LRUMap<string, PackageMetadata>>;
    const selectedSourceRef = { current: '' } as React.MutableRefObject<string>;
    const includePrereleaseRef = { current: false } as React.MutableRefObject<boolean>;
    return {
        versionsCache,
        metadataCache,
        selectedSourceRef,
        includePrereleaseRef,
        postMessage: vi.fn(),
        debounceMs: 150,
        ...overrides,
    };
}

describe('useHoverPrefetch', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('debounces dispatch and emits prefetch messages after dwell', () => {
        const post = vi.fn();
        const deps = makeDeps({ postMessage: post });
        const { result } = renderHook(() => useHoverPrefetch(deps));

        act(() => { result.current.onMouseEnterRow('Newtonsoft.Json', '13.0.3'); });
        expect(post).not.toHaveBeenCalled();

        act(() => { vi.advanceTimersByTime(150); });

        expect(post).toHaveBeenCalledTimes(2);
        expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'prefetchPackageVersions', packageId: 'Newtonsoft.Json' }));
        expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'prefetchPackageMetadata', packageId: 'Newtonsoft.Json', version: '13.0.3' }));
        expect(result.current.pendingVersions.current.has('newtonsoft.json||false')).toBe(true);
        expect(result.current.pendingMetadata.current.has('newtonsoft.json@13.0.3|')).toBe(true);
    });

    it('cancels dispatch when leave fires before dwell', () => {
        const post = vi.fn();
        const deps = makeDeps({ postMessage: post });
        const { result } = renderHook(() => useHoverPrefetch(deps));

        act(() => { result.current.onMouseEnterRow('Foo', '1.0.0'); });
        act(() => { vi.advanceTimersByTime(100); });
        act(() => { result.current.onMouseLeaveRow(); });
        act(() => { vi.advanceTimersByTime(500); });

        expect(post).not.toHaveBeenCalled();
    });

    it('skips dispatch when both caches are populated', () => {
        const post = vi.fn();
        const deps = makeDeps({ postMessage: post });
        deps.versionsCache.current.set('foo||false', ['1.0.0']);
        deps.metadataCache.current.set('foo@1.0.0|', { id: 'Foo', version: '1.0.0' } as PackageMetadata);

        const { result } = renderHook(() => useHoverPrefetch(deps));
        act(() => { result.current.onMouseEnterRow('Foo', '1.0.0'); });
        act(() => { vi.advanceTimersByTime(150); });

        expect(post).not.toHaveBeenCalled();
    });

    it('dedupes a second hover on the same key while pending', () => {
        const post = vi.fn();
        const deps = makeDeps({ postMessage: post });
        const { result } = renderHook(() => useHoverPrefetch(deps));

        act(() => { result.current.onMouseEnterRow('Foo', '1.0.0'); });
        act(() => { vi.advanceTimersByTime(150); });
        expect(post).toHaveBeenCalledTimes(2);

        act(() => { result.current.onMouseEnterRow('Foo', '1.0.0'); });
        act(() => { vi.advanceTimersByTime(150); });
        expect(post).toHaveBeenCalledTimes(2);
    });

    it('only prefetches versions when version is unknown', () => {
        const post = vi.fn();
        const deps = makeDeps({ postMessage: post });
        const { result } = renderHook(() => useHoverPrefetch(deps));

        act(() => { result.current.onMouseEnterRow('Foo'); });
        act(() => { vi.advanceTimersByTime(150); });

        expect(post).toHaveBeenCalledTimes(1);
        expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'prefetchPackageVersions' }));
    });

    it('uses latest source/prerelease ref values at dispatch time', () => {
        const post = vi.fn();
        const sourceRef = { current: '' } as React.MutableRefObject<string>;
        const prereleaseRef = { current: false } as React.MutableRefObject<boolean>;
        const deps = makeDeps({ postMessage: post, selectedSourceRef: sourceRef, includePrereleaseRef: prereleaseRef });
        const { result } = renderHook(() => useHoverPrefetch(deps));

        act(() => { result.current.onMouseEnterRow('Foo', '1.0.0'); });
        sourceRef.current = 'https://api.nuget.org/v3/index.json';
        prereleaseRef.current = true;
        act(() => { vi.advanceTimersByTime(150); });

        expect(post).toHaveBeenCalledWith(expect.objectContaining({
            type: 'prefetchPackageVersions',
            source: 'https://api.nuget.org/v3/index.json',
            includePrerelease: true,
        }));
    });

    it('clears the timer on unmount', () => {
        const post = vi.fn();
        const deps = makeDeps({ postMessage: post });
        const { result, unmount } = renderHook(() => useHoverPrefetch(deps));

        act(() => { result.current.onMouseEnterRow('Foo', '1.0.0'); });
        unmount();
        act(() => { vi.advanceTimersByTime(500); });

        expect(post).not.toHaveBeenCalled();
    });

    // Ensures the hook's outer hoverPrefetch reference can change per render
    // without breaking the latest-source-ref guarantee (regression guard).
    it('keeps stable handler refs across re-renders', () => {
        const Wrapper = () => {
            const versionsCache = useRef(new LRUMap<string, string[]>(10));
            const metadataCache = useRef(new LRUMap<string, PackageMetadata>(10));
            const selectedSourceRef = useRef('');
            const includePrereleaseRef = useRef(false);
            return useHoverPrefetch({
                versionsCache,
                metadataCache,
                selectedSourceRef,
                includePrereleaseRef,
                postMessage: vi.fn(),
            });
        };
        const { result, rerender } = renderHook(Wrapper);
        const first = result.current.onMouseEnterRow;
        rerender();
        expect(result.current.onMouseEnterRow).toBe(first);
    });
});
