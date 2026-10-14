import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, resourceKeys, type PackageMetadataLite, type ProtocolRequestError, type TransitiveResult } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';
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

/**
 * The transitive slice: the packages the committed project gets through its references, by target framework. It
 * is lazy (the section is collapsed until the user opens it) and starts collapsed again for another project. The
 * metadata of the rows is asked for separately; when the host cannot answer it (`unsupported` until the feeds
 * exist), the rows are shown from `transitive/get` alone.
 */
export function TransitiveProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const bus = useMessageBus();
    const projectPath = singleProject(useSession().committed?.selectedProject);
    const [enabledFor, setEnabledFor] = useState<string | null>(null);
    const enabled = projectPath !== null && enabledFor === projectPath;
    // Another project starts collapsed, and so does this one when the user comes back to it.
    useEffect(() => {
        setEnabledFor(previous => (previous === projectPath ? previous : null));
    }, [projectPath]);
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
