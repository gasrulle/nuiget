import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, resourceKeys, type InstalledResult, type PackageMetadataLite, type ProtocolRequestError } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';
import { useSession } from './session';
import { useResource, type ResourceState } from './useResource';

export interface InstalledState {
    /** The project the rest belongs to; `null` when no single project is selected (none, or all projects). */
    projectPath: string | null;
    status: ResourceState<InstalledResult>['status'];
    /**
     * The installed packages of `projectPath`. They stay on screen while a newer result is on its way; while a request
     * is unanswered, the provisional list it streamed is shown instead.
     */
    result: InstalledResult | undefined;
    /** What the host answered about the packages on screen (icon, description, …), by lower-cased package id. */
    metadata: ReadonlyMap<string, PackageMetadataLite>;
    error: ProtocolRequestError | undefined;
    revalidating: boolean;
    refresh: () => void;
}

const InstalledContext = createContext<InstalledState | null>(null);

const NO_METADATA: ReadonlyMap<string, PackageMetadataLite> = new Map();

/** A project a list of installed packages can be asked for: not "no project" and not "all projects". */
const singleProject = (selected: string | undefined): string | null =>
    selected === undefined || selected === '' || selected === ALL_PROJECTS ? null : selected;

/**
 * The installed slice: the packages of the project the host has committed as selected. A pending selection of
 * this surface asks for nothing; the host may still turn it into another project. The key is built from the
 * path exactly as the snapshot has it, which is how the host names it in `resources/invalidated`.
 */
export function InstalledProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const bus = useMessageBus();
    const projectPath = singleProject(useSession().committed?.selectedProject);
    // Metadata arrives with the answers of the asks below; kept per project.
    const [metadata, setMetadata] = useState<{ projectPath: string; byId: ReadonlyMap<string, PackageMetadataLite> }>();
    // The provisional list of the latest request, shown until that request is answered (ADR-009 d.3).
    const [provisional, setProvisional] = useState<{ projectPath: string; result: InstalledResult }>();

    const requester = useCallback((signal: AbortSignal) => {
        const requested = projectPath as string;
        setProvisional(undefined);
        return bus.request('installed/get', { projectPath: requested }, {
            signal,
            onChunk: chunk => {
                if (!signal.aborted) {
                    setProvisional({ projectPath: requested, result: chunk.result });
                }
            },
        });
    }, [bus, projectPath]);

    const resource = useResource<InstalledResult>(projectPath === null ? null : resourceKeys.installed(projectPath), requester);
    const unanswered = resource.status === 'loading' || resource.revalidating;
    const shown = provisional !== undefined && provisional.projectPath === projectPath && unanswered ? provisional.result : resource.data;

    // Two-phase (ADR-009 d.1): the lite metadata of the rows on screen is asked with their concrete versions, for the
    // provisional list as soon as it shows and again for the answer only when its rows differ; a cached list comes
    // without a chunk, so the ask cannot ride on `installed/get`. Another project or other rows cancel the ask; an
    // error, `unsupported` included, is no metadata.
    const asked = useMemo(() => JSON.stringify(shown === undefined ? [] : shown.packages
        .filter(entry => entry.declaration !== 'unresolved' && (entry.resolvedVersion !== undefined || (entry.versionType !== 'floating' && entry.versionType !== 'range')))
        .map(entry => ({ id: entry.id, version: entry.resolvedVersion ?? entry.version }))
        .filter(entry => entry.version !== '')), [shown]);
    useEffect(() => {
        const packages = JSON.parse(asked) as Array<{ id: string; version: string }>;
        if (projectPath === null || packages.length === 0) {
            return undefined;
        }
        const requested = projectPath;
        const controller = new AbortController();
        bus.request('transitive/metadata', { packages }, { signal: controller.signal }).then(({ result }) => {
            setMetadata(previous => {
                const byId = new Map(previous?.projectPath === requested ? previous.byId : []);
                for (const entry of result.metadata) {
                    byId.set(entry.id.toLowerCase(), entry);
                }
                return { projectPath: requested, byId };
            });
        }, () => undefined);
        return () => controller.abort();
    }, [bus, projectPath, asked]);

    const state = useMemo<InstalledState>(() => ({
        projectPath,
        status: resource.status,
        result: shown,
        metadata: metadata !== undefined && metadata.projectPath === projectPath ? metadata.byId : NO_METADATA,
        error: resource.error,
        revalidating: resource.revalidating,
        refresh: resource.refresh,
    }), [projectPath, resource.status, shown, resource.error, resource.revalidating, resource.refresh, metadata]);

    return <InstalledContext.Provider value={state}>{children}</InstalledContext.Provider>;
}

export function useInstalled(): InstalledState {
    const state = useContext(InstalledContext);
    if (state === null) {
        throw new Error('useInstalled needs an InstalledProvider above it');
    }
    return state;
}
