import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { ProtocolRequestError, type FailedSource, type NuGetSource, type RequestPayload, type RequestResult } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';
import { useSession } from './session';

export interface SourcesState {
    /** The package sources of the committed project's directory; `undefined` until the first answer. */
    sources: readonly NuGetSource[] | undefined;
    /** The sources that could not be reached, from the answer, its `health` chunk and `sources/health`. */
    failed: readonly FailedSource[];
    /** `idle`: not enabled (or no session yet). `loading`: asked, nothing known yet. */
    status: 'idle' | 'loading' | 'ready' | 'error';
    error: ProtocolRequestError | undefined;
    /** Asked again while a list is shown; the list stays until the answer. */
    revalidating: boolean;
    /**
     * A consumer needs the list. Idempotent, and sticky for the surface: unlike the transitive slice's `enable`, it
     * does not reset for another project, whose list is then asked for at once.
     */
    enable: () => void;
    refresh: () => void;
    /** The names of the sources a mutation is running for (the name of the source being added included). */
    pending: ReadonlySet<string>;
    /** Adds a source; rejects with the host's message when it refuses. */
    add: (payload: RequestPayload<'sources/add'>) => Promise<void>;
    /** Removes a source from the file that declares it (the nearest file without `configFile`). */
    remove: (sourceName: string, configFile?: string) => Promise<void>;
    setEnabled: (sourceName: string, enabled: boolean) => Promise<void>;
    /** The config files a source can be added to, nearest first; asked once by `loadConfigFiles`. */
    configFiles: RequestResult<'sources/configFiles'>['configFiles'] | undefined;
    loadConfigFiles: () => void;
}

const SourcesContext = createContext<SourcesState | null>(null);

const NO_FAILED: readonly FailedSource[] = [];
const NO_PENDING: ReadonlySet<string> = new Set();

interface Stored {
    sources: readonly NuGetSource[] | undefined;
    failed: readonly FailedSource[];
    error: ProtocolRequestError | undefined;
    requesting: boolean;
}

/**
 * The sources slice: read part since P5.6, mutations since P5.8 (`add`, `remove`, `setEnabled`, each answered with the
 * list as it is after it, shown at once; the host's invalidation that follows asks the list again). Lazy: nothing is asked until a
 * consumer calls `enable()`, so a surface that never needs the list never asks for it. The host answers for the
 * committed project's directory and keys the resource by that directory, which the webview cannot compute, so this
 * is no `useResource`: the slice asks again when the committed project changes, on `refresh()`, and when an
 * invalidation has the scope `sources` or names a `sources:` key; the latest request wins.
 */
export function SourcesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const bus = useMessageBus();
    const committed = useSession().committed;
    const [enabled, setEnabled] = useState(false);
    const [asks, setAsks] = useState(0);
    const [stored, setStored] = useState<Stored>({ sources: undefined, failed: NO_FAILED, error: undefined, requesting: false });

    const [pending, setPending] = useState<ReadonlySet<string>>(NO_PENDING);
    const [configFiles, setConfigFiles] = useState<SourcesState['configFiles']>();
    const ready = enabled && committed !== undefined;
    const projectPath = committed?.selectedProject;

    useEffect(() => bus.onEvent('sources/health', ({ failed }) => setStored(previous => ({ ...previous, failed }))), [bus]);

    useEffect(() => {
        if (!enabled) {
            return undefined;
        }
        return bus.onEvent('resources/invalidated', event => {
            if (event.scope.kind === 'sources' || event.keys.some(({ key }) => key.startsWith('sources:'))) {
                setAsks(count => count + 1);
            }
        });
    }, [bus, enabled]);

    useEffect(() => {
        if (!ready) {
            return undefined;
        }
        const controller = new AbortController();
        setStored(previous => ({ ...previous, error: undefined, requesting: true }));
        bus.request('sources/list', {}, {
            signal: controller.signal,
            onChunk: chunk => setStored(previous => ({ ...previous, failed: chunk.failed })),
        }).then(
            ({ result }) => setStored({ sources: result.sources, failed: result.failed, error: undefined, requesting: false }),
            (error: unknown) => {
                if (!controller.signal.aborted) {
                    setStored(previous => ({ ...previous, error: error instanceof ProtocolRequestError ? error : new ProtocolRequestError('failed', String(error)), requesting: false }));
                }
            },
        );
        return () => controller.abort();
    }, [bus, ready, projectPath, asks]);

    const enable = useCallback((): void => setEnabled(true), []);
    const refresh = useCallback((): void => setAsks(count => count + 1), []);

    /** Runs a mutation for `name`; its answer is the list as it is now, which is shown at once. */
    const mutate = useCallback(async (name: string, send: () => Promise<{ result: { sources: NuGetSource[] } }>): Promise<void> => {
        setPending(previous => new Set(previous).add(name));
        try {
            const { result } = await send();
            setStored(previous => ({ ...previous, sources: result.sources, error: undefined }));
        } finally {
            setPending(previous => {
                const next = new Set(previous);
                next.delete(name);
                return next;
            });
        }
    }, []);
    const add = useCallback((payload: RequestPayload<'sources/add'>) => mutate(payload.name ?? payload.url, () => bus.request('sources/add', payload)), [bus, mutate]);
    const remove = useCallback((sourceName: string, configFile?: string) => mutate(sourceName, () => bus.request('sources/remove', configFile === undefined ? { sourceName } : { sourceName, configFile })), [bus, mutate]);
    const setSourceEnabled = useCallback((sourceName: string, on: boolean) => mutate(sourceName, () => bus.request(on ? 'sources/enable' : 'sources/disable', { sourceName })), [bus, mutate]);
    const loadConfigFiles = useCallback((): void => {
        bus.request('sources/configFiles', {}).then(({ result }) => setConfigFiles(result.configFiles), () => setConfigFiles([]));
    }, [bus]);

    const state = useMemo<SourcesState>(() => {
        let status: SourcesState['status'] = 'idle';
        if (ready) {
            if (stored.sources !== undefined) {
                status = 'ready';
            } else {
                status = stored.error !== undefined && !stored.requesting ? 'error' : 'loading';
            }
        }
        return {
            sources: stored.sources,
            failed: stored.failed,
            status,
            error: stored.error,
            revalidating: stored.sources !== undefined && stored.requesting,
            enable,
            refresh,
            pending,
            add,
            remove,
            setEnabled: setSourceEnabled,
            configFiles,
            loadConfigFiles,
        };
    }, [ready, stored, enable, refresh, pending, add, remove, setSourceEnabled, configFiles, loadConfigFiles]);

    return <SourcesContext.Provider value={state}>{children}</SourcesContext.Provider>;
}

export function useSources(): SourcesState {
    const state = useContext(SourcesContext);
    if (state === null) {
        throw new Error('useSources needs a SourcesProvider above it');
    }
    return state;
}
