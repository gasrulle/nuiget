import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, resourceKeys, type PackageUpdate, type ProtocolRequestError, type RequestResult } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';
import { useSession } from './session';
import { useResource, type ResourceState } from './useResource';

type UpdatesResult = RequestResult<'updates/get'>;

export interface UpdatesState {
    /** The project the rest belongs to; `null` when no single project is selected (none, or all projects). */
    projectPath: string | null;
    includePrerelease: boolean;
    status: ResourceState<UpdatesResult>['status'];
    /**
     * The updates to show: the host's answer once it is there (icon, authors and verification included), before
     * that the bare rows it streamed as it found them.
     */
    rows: readonly PackageUpdate[];
    /** True when a source could not be checked: the rows may be incomplete, and none does not mean "no updates". */
    sourcesUnavailable: boolean;
    error: ProtocolRequestError | undefined;
    revalidating: boolean;
    refresh: () => void;
}

const UpdatesContext = createContext<UpdatesState | null>(null);

const NO_ROWS: readonly PackageUpdate[] = [];
/**
 * How long a recovered source waits before the updates are asked again. A manual refresh announces the reset health
 * (`failed: []`) just before it invalidates the resource; the invalidation then asks once, and this request is dropped.
 */
export const RECOVERY_DELAY_MS = 300;

const singleProject = (selected: string | undefined): string | null =>
    selected === undefined || selected === '' || selected === ALL_PROJECTS ? null : selected;

/**
 * The updates slice: the updates of the project the host has committed as selected, under the committed prerelease
 * flag (another flag is another resource). When a source that was down is reported up again while the answer says a
 * source could not be checked, the updates are asked again once; a recovery invalidates nothing on the host.
 */
export function UpdatesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const bus = useMessageBus();
    const committed = useSession().committed;
    const projectPath = singleProject(committed?.selectedProject);
    const includePrerelease = committed?.includePrerelease ?? false;
    const key = projectPath === null ? null : resourceKeys.updates(projectPath, includePrerelease);
    const [found, setFound] = useState<{ key: string; rows: readonly PackageUpdate[] }>();
    const requests = useRef(0);

    const requester = useCallback((signal: AbortSignal) => {
        const requestedKey = key as string;
        requests.current++;
        setFound({ key: requestedKey, rows: NO_ROWS });
        return bus.request('updates/get', { projectPath: projectPath as string, includePrerelease }, {
            signal,
            onChunk: chunk => setFound(previous => ({ key: requestedKey, rows: [...(previous?.key === requestedKey ? previous.rows : NO_ROWS), chunk.update] })),
        });
    }, [bus, key, projectPath, includePrerelease]);

    const resource = useResource<UpdatesResult>(key, requester);
    const latest = useRef({ resource, failed: new Set<string>() });
    latest.current.resource = resource;

    useEffect(() => bus.onEvent('sources/health', ({ failed }) => {
        const now = new Set(failed.map(source => source.url));
        const recovered = [...latest.current.failed].some(url => !now.has(url));
        latest.current.failed = now;
        if (!recovered || latest.current.resource.data?.sourcesUnavailable !== true) {
            return;
        }
        const asked = requests.current;
        setTimeout(() => {
            // A request since then (the invalidation of a manual refresh) already asks again.
            if (requests.current === asked && latest.current.resource.data?.sourcesUnavailable === true) {
                latest.current.resource.refresh();
            }
        }, RECOVERY_DELAY_MS);
    }), [bus]);

    const state = useMemo<UpdatesState>(() => ({
        projectPath,
        includePrerelease,
        status: resource.status,
        rows: resource.data?.updates ?? (found !== undefined && found.key === key ? found.rows : NO_ROWS),
        sourcesUnavailable: resource.data?.sourcesUnavailable === true,
        error: resource.error,
        revalidating: resource.revalidating,
        refresh: resource.refresh,
    }), [projectPath, includePrerelease, key, found, resource.status, resource.data, resource.error, resource.revalidating, resource.refresh]);

    return <UpdatesContext.Provider value={state}>{children}</UpdatesContext.Provider>;
}

export function useUpdates(): UpdatesState {
    const state = useContext(UpdatesContext);
    if (state === null) {
        throw new Error('useUpdates needs an UpdatesProvider above it');
    }
    return state;
}
