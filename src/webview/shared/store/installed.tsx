import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, resourceKeys, type InstalledResult, type PackageMetadataLite, type ProtocolRequestError } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';
import { useSession } from './session';
import { useResource, type ResourceState } from './useResource';

export interface InstalledState {
    /** The project the rest belongs to; `null` when no single project is selected (none, or all projects). */
    projectPath: string | null;
    status: ResourceState<InstalledResult>['status'];
    /** The installed packages of `projectPath`. They stay on screen while a newer result is on its way. */
    result: InstalledResult | undefined;
    /** What the host sent after the list about its packages (icon, description, …), by lower-cased package id. */
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
    // Metadata arrives in chunks, each for the request it belongs to; kept per project.
    const [metadata, setMetadata] = useState<{ projectPath: string; byId: ReadonlyMap<string, PackageMetadataLite> }>();

    const requester = useCallback((signal: AbortSignal) => {
        const requested = projectPath as string;
        return bus.request('installed/get', { projectPath: requested }, {
            signal,
            onChunk: chunk => {
                setMetadata(previous => {
                    const byId = new Map(previous?.projectPath === requested ? previous.byId : []);
                    for (const entry of chunk.packages) {
                        byId.set(entry.id.toLowerCase(), entry);
                    }
                    return { projectPath: requested, byId };
                });
            },
        });
    }, [bus, projectPath]);

    const resource = useResource<InstalledResult>(projectPath === null ? null : resourceKeys.installed(projectPath), requester);

    const state = useMemo<InstalledState>(() => ({
        projectPath,
        status: resource.status,
        result: resource.data,
        metadata: metadata !== undefined && metadata.projectPath === projectPath ? metadata.byId : NO_METADATA,
        error: resource.error,
        revalidating: resource.revalidating,
        refresh: resource.refresh,
    }), [projectPath, resource.status, resource.data, resource.error, resource.revalidating, resource.refresh, metadata]);

    return <InstalledContext.Provider value={state}>{children}</InstalledContext.Provider>;
}

export function useInstalled(): InstalledState {
    const state = useContext(InstalledContext);
    if (state === null) {
        throw new Error('useInstalled needs an InstalledProvider above it');
    }
    return state;
}
