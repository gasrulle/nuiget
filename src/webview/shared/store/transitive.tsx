import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, resourceKeys, type PackageMetadataLite, type ProtocolRequestError, type TransitiveResult } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';
import { useInstalled } from './installed';
import { useSession } from './session';
import { useResource, type ResourceState } from './useResource';

export interface TransitiveState {
    /** The project the rest belongs to; `null` without a single committed project. */
    projectPath: string | null;
    /** Whether the section has been opened for this project; nothing is asked before. */
    enabled: boolean;
    status: ResourceState<TransitiveResult>['status'];
    /** The transitive packages by target framework; they stay on screen while a newer result is on its way. */
    result: TransitiveResult | undefined;
    /** What `transitive/metadata` said about the packages, by lower-cased `id@version`; empty when it said nothing. */
    metadata: ReadonlyMap<string, PackageMetadataLite>;
    error: ProtocolRequestError | undefined;
    revalidating: boolean;
    /** The section was opened: from now on the list of this project is asked for and kept current. */
    enable: () => void;
    /** Restore the project, then list again: the next request asks with `forceRestore`. */
    restore: () => void;
    refresh: () => void;
}

const TransitiveContext = createContext<TransitiveState | null>(null);

const NO_METADATA: ReadonlyMap<string, PackageMetadataLite> = new Map();

const singleProject = (selected: string | undefined): string | null =>
    selected === undefined || selected === '' || selected === ALL_PROJECTS ? null : selected;

export const metadataKey = (id: string, version: string): string => `${id.toLowerCase()}@${version}`;

/** How long after the installed list of the project answered its transitive packages are asked for (MI9). */
export const TRANSITIVE_PREFETCH_MS = 500;

/**
 * The transitive slice: the packages the committed project gets through its references, by target framework. It is
 * asked for 500 ms after the project's installed list answered, so the collapsed header can show the count (1.x did
 * the same), or at once when the user opens the section first; another project starts again. The metadata of the
 * rows is asked for separately; when the host cannot answer it, the rows are shown from `transitive/get` alone.
 * `prefetch={false}` (the sidebar, which shows no transitive packages) asks only once something calls `enable`.
 */
export function TransitiveProvider({ children, prefetch = true }: { children: React.ReactNode; prefetch?: boolean }): React.JSX.Element {
    const bus = useMessageBus();
    const projectPath = singleProject(useSession().committed?.selectedProject);
    const installed = useInstalled();
    const [enabledFor, setEnabledFor] = useState<string | null>(null);
    const enabled = projectPath !== null && enabledFor === projectPath;
    // Another project starts without its list, and so does this one when the user comes back to it.
    useEffect(() => {
        setEnabledFor(previous => (previous === projectPath ? previous : null));
    }, [projectPath]);
    // The prefetch: once the project's installed list is ready, never for All Projects and never with a restore.
    const installedReady = installed.status === 'ready' && installed.projectPath === projectPath;
    useEffect(() => {
        if (!prefetch || projectPath === null || enabled || !installedReady) {
            return undefined;
        }
        const timer = setTimeout(() => setEnabledFor(projectPath), TRANSITIVE_PREFETCH_MS);
        return () => clearTimeout(timer);
    }, [prefetch, projectPath, enabled, installedReady]);
    // Set by `restore` for exactly the next request.
    const forceRestore = useRef(false);
    const [metadata, setMetadata] = useState<{ result: TransitiveResult; byKey: ReadonlyMap<string, PackageMetadataLite> }>();

    const requester = useCallback((signal: AbortSignal) => {
        const force = forceRestore.current;
        forceRestore.current = false;
        return bus.request('transitive/get', force ? { projectPath: projectPath as string, forceRestore: true } : { projectPath: projectPath as string }, { signal });
    }, [bus, projectPath]);

    const resource = useResource<TransitiveResult>(enabled ? resourceKeys.transitive(projectPath) : null, requester);
    const { refresh } = resource;

    const result = resource.data;
    useEffect(() => {
        if (result === undefined) {
            return undefined;
        }
        const pairs = new Map<string, { id: string; version: string }>();
        for (const framework of result.frameworks) {
            for (const entry of framework.packages) {
                pairs.set(metadataKey(entry.id, entry.version), { id: entry.id, version: entry.version });
            }
        }
        if (pairs.size === 0) {
            return undefined;
        }
        const controller = new AbortController();
        bus.request('transitive/metadata', { packages: [...pairs.values()] }, { signal: controller.signal }).then(answer => {
            setMetadata({ result, byKey: new Map(answer.result.metadata.map(entry => [metadataKey(entry.id, entry.version), entry])) });
        }, () => {
            // No metadata (`unsupported` until the feeds exist, or any other error) is no error of the list.
        });
        return () => controller.abort();
    }, [bus, result]);

    const enable = useCallback((): void => setEnabledFor(projectPath), [projectPath]);
    const restore = useCallback((): void => {
        forceRestore.current = true;
        if (enabled) {
            refresh();
        } else {
            setEnabledFor(projectPath);
        }
    }, [enabled, projectPath, refresh]);

    const state = useMemo<TransitiveState>(() => ({
        projectPath,
        enabled,
        status: resource.status,
        result,
        metadata: metadata !== undefined && metadata.result === result ? metadata.byKey : NO_METADATA,
        error: resource.error,
        revalidating: resource.revalidating,
        enable,
        restore,
        refresh,
    }), [projectPath, enabled, resource.status, result, metadata, resource.error, resource.revalidating, enable, restore, refresh]);

    return <TransitiveContext.Provider value={state}>{children}</TransitiveContext.Provider>;
}

export function useTransitive(): TransitiveState {
    const state = useContext(TransitiveContext);
    if (state === null) {
        throw new Error('useTransitive needs a TransitiveProvider above it');
    }
    return state;
}
