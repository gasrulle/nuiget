import { useCallback, useEffect, useRef } from 'react';
import type { LRUMap, PackageMetadata } from '../types';

export interface HoverPrefetchOptions {
    versionsCache: React.MutableRefObject<LRUMap<string, string[]>>;
    metadataCache: React.MutableRefObject<LRUMap<string, PackageMetadata>>;
    selectedSourceRef: React.MutableRefObject<string>;
    includePrereleaseRef: React.MutableRefObject<boolean>;
    postMessage: (msg: unknown) => void;
    /** Hover dwell time before dispatch (default 150ms). */
    debounceMs?: number;
    /** Versions list size hint (default 20). */
    versionsTake?: number;
}

export interface HoverPrefetchHandle {
    /** Attach to a row's onMouseEnter. Pass the version string when known (installed/updates). */
    onMouseEnterRow: (packageId: string, version?: string) => void;
    /** Attach to a row's onMouseLeave (and call from row unmount in virtualized lists). */
    onMouseLeaveRow: () => void;
    /** Pending dispatch keys awaiting backend reply. App.tsx clears entries when prefetched messages land. */
    pendingVersions: React.MutableRefObject<Set<string>>;
    pendingMetadata: React.MutableRefObject<Set<string>>;
}

function echoSource(src: string): string {
    return !src || src === 'all' ? '' : src;
}

/**
 * Mouse-hover-driven prefetch for package metadata + versions.
 * Single shared timer (only one row can be hovered at a time).
 * Cache-hit and pending-dedupe short-circuit before postMessage.
 */
export function useHoverPrefetch(opts: HoverPrefetchOptions): HoverPrefetchHandle {
    const debounceMs = opts.debounceMs ?? 150;
    const versionsTake = opts.versionsTake ?? 20;

    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingVersions = useRef<Set<string>>(new Set());
    const pendingMetadata = useRef<Set<string>>(new Set());

    // Stable ref to options so the timer callback always sees the latest values
    // without re-creating the handlers (which are wired into many list rows).
    const optsRef = useRef(opts);
    optsRef.current = opts;

    const cancelTimer = useCallback(() => {
        if (hoverTimerRef.current !== null) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    }, []);

    const dispatch = useCallback((packageId: string, version: string | undefined) => {
        const o = optsRef.current;
        const sourceParam = o.selectedSourceRef.current ?? '';
        const includePrerelease = !!o.includePrereleaseRef.current;
        const echoed = echoSource(sourceParam);

        const vKey = `${packageId.toLowerCase()}|${echoed}|${includePrerelease}`;
        if (!o.versionsCache.current.has(vKey) && !pendingVersions.current.has(vKey)) {
            pendingVersions.current.add(vKey);
            o.postMessage({
                type: 'prefetchPackageVersions',
                packageId,
                source: sourceParam || undefined,
                includePrerelease,
                take: versionsTake,
            });
        }

        if (version) {
            const mKey = `${packageId.toLowerCase()}@${version}|${echoed}`;
            if (!o.metadataCache.current.has(mKey) && !pendingMetadata.current.has(mKey)) {
                pendingMetadata.current.add(mKey);
                o.postMessage({
                    type: 'prefetchPackageMetadata',
                    packageId,
                    version,
                    source: sourceParam || undefined,
                });
            }
        }
    }, [versionsTake]);

    const onMouseEnterRow = useCallback((packageId: string, version?: string) => {
        cancelTimer();
        hoverTimerRef.current = setTimeout(() => {
            hoverTimerRef.current = null;
            dispatch(packageId, version);
        }, debounceMs);
    }, [cancelTimer, dispatch, debounceMs]);

    const onMouseLeaveRow = useCallback(() => {
        cancelTimer();
    }, [cancelTimer]);

    useEffect(() => () => cancelTimer(), [cancelTimer]);

    return { onMouseEnterRow, onMouseLeaveRow, pendingVersions, pendingMetadata };
}
