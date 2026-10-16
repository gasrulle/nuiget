import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, ProtocolRequestError, type PackageMetadata, type RequestResult } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';
import { useInstalled } from './installed';
import { useSession } from './session';

/** The package whose details are shown, as the list that selected it knew it. */
export interface DetailsSelection {
    packageId: string;
    /** The version to show first: the installed (resolved) version, the latest of an update, or the version found. */
    version: string;
    /** The source the row came from; absent for an installed package (every allowed source is asked). */
    sourceUrl?: string;
    /**
     * Where it came from: an installed or update row belongs to its project and leaves when that project no longer has
     * it. A transitive row (`projectPath` `null` for the All Projects aggregate) asks nothing of the feeds: its view reads
     * the transitive slices.
     */
    origin: 'installed' | 'updates' | 'browse' | 'transitive';
    /** The project the row belongs to (its section's in All Projects); `null` for a row found by a search. */
    projectPath: string | null;
}

export interface Loadable<T> {
    status: 'idle' | 'loading' | 'ready' | 'error';
    value: T | undefined;
    error: ProtocolRequestError | undefined;
}

export interface DetailsState {
    selection: DetailsSelection | null;
    /** The version chosen in the version selector; the selection's version until the user picks another. */
    version: string | null;
    /** Every version of the package on its source (or the allowed sources), newest first. */
    versions: Loadable<readonly string[]>;
    /** The details of the chosen version; `null` when no source knows it. */
    metadata: Loadable<PackageMetadata | null>;
    /** The README of the chosen version, asked once `showReadme()` was called for the selection; `null` without one. */
    readme: Loadable<string | null>;
    /**
     * The committed project changed under an installed or update selection and its new installed list has not
     * answered yet: the content stays, read-only, until that list confirms the package (or the selection goes).
     */
    stale: boolean;
}

/** The views of the main panel that keep a selection of their own: the Installed tab (transitive rows too), Updates, Browse. */
export type DetailsView = 'installed' | 'updates' | 'browse';

export interface DetailsActions {
    /** Selects in the view of the selection's origin and shows that view; `null` clears the shown view's selection. */
    select: (selection: DetailsSelection | null) => void;
    /** The shell shows another view: its own selection comes back; Browse always starts without one. Never changes identity. */
    showView: (view: DetailsView) => void;
    chooseVersion: (version: string) => void;
    /** The README tab is shown: from now on the README of the chosen version is asked for. */
    showReadme: () => void;
    retryVersions: () => void;
    retryMetadata: () => void;
    retryReadme: () => void;
}

const DetailsContext = createContext<DetailsState | null>(null);
const DetailsActionsContext = createContext<DetailsActions | null>(null);

const IDLE: Loadable<never> = { status: 'idle', value: undefined, error: undefined };

const asRequestError = (error: unknown): ProtocolRequestError =>
    error instanceof ProtocolRequestError ? error : new ProtocolRequestError('failed', error instanceof Error ? error.message : String(error));

const singleProject = (selected: string | undefined): string | null =>
    selected === undefined || selected === '' || selected === ALL_PROJECTS ? null : selected;

const sameId = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const viewOf = (origin: DetailsSelection['origin']): DetailsView => (origin === 'browse' ? 'browse' : origin === 'updates' ? 'updates' : 'installed');

/** A view's selection and the committed project selection when it was made (a path, ALL_PROJECTS or empty). */
interface Remembered {
    selection: DetailsSelection;
    selectedUnder: string | undefined;
}

interface Views {
    view: DetailsView;
    remembered: ReadonlyMap<DetailsView, Remembered>;
}

/**
 * Asks `request` whenever `key` changes or `attempt` goes up, and keeps the answer only while it is still the one
 * asked for: the request before is cancelled, and `accept` checks the answer against what was asked (the gate
 * "response for other package ignored"). What is shown stays while the same key is asked again.
 */
function useLoadable<T>(key: string | null, attempt: number, request: (signal: AbortSignal) => Promise<T>, accept: (value: T) => boolean): Loadable<T> {
    const [stored, setStored] = useState<{ key: string | null } & Loadable<T>>({ key: null, ...IDLE });
    useEffect(() => {
        if (key === null) {
            setStored({ key: null, ...IDLE });
            return undefined;
        }
        const controller = new AbortController();
        setStored(previous => (previous.key === key && previous.value !== undefined
            ? { ...previous, error: undefined }
            : { key, status: 'loading', value: undefined, error: undefined }));
        request(controller.signal).then(
            value => {
                if (!controller.signal.aborted && accept(value)) {
                    setStored({ key, status: 'ready', value, error: undefined });
                }
            },
            (error: unknown) => {
                if (!controller.signal.aborted) {
                    setStored(previous => ({ key, status: previous.key === key && previous.value !== undefined ? 'ready' : 'error', value: previous.key === key ? previous.value : undefined, error: asRequestError(error) }));
                }
            },
        );
        return () => controller.abort();
        // `request` and `accept` belong to `key`; a new attempt asks again.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, attempt]);
    // One object while nothing is asked, so the state above it keeps its identity.
    return stored.key === key ? stored : IDLE;
}

/**
 * The details slice (interaction model §7): the package selected in a list of the main panel, the version chosen
 * for it, and its versions, details and README. Each is asked per selection; an answer for another package or
 * version is never shown. `package/versions` and `package/metadata` carry no generation (N70): they are asked again
 * when an invalidation names a `versions:<id>|` or `metadata:<id>@` key of the package. When the committed project
 * changes under an installed or update selection, the selection becomes stale until the new project's installed
 * list answers: it stays when the package is there and goes when it is not. Each view of the main panel (Installed,
 * Updates, Browse) keeps its own selection; `showView` shows the one of the active view, and its versions and details
 * are asked again (the host answers them from its cache). Browse starts without a selection each time.
 */
export function DetailsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const bus = useMessageBus();
    const committed = useSession().committed;
    const installed = useInstalled();
    const [views, setViews] = useState<Views>({ view: 'installed', remembered: new Map() });
    const shown = views.remembered.get(views.view);
    const selection = shown?.selection ?? null;
    const selectedUnder = shown?.selectedUnder;
    // Read through a ref, so that `showView` never changes.
    const latestViews = useRef(views);
    latestViews.current = views;
    const [version, setVersion] = useState<string | null>(null);
    const [readmeWanted, setReadmeWanted] = useState(false);
    const [attempts, setAttempts] = useState({ versions: 0, metadata: 0, readme: 0 });

    const includePrerelease = committed?.includePrerelease ?? false;
    const committedProject = singleProject(committed?.selectedProject);

    const committedSelection = committed?.selectedProject;
    // Read through a ref, so that `select`, and with it the actions context, never changes.
    const latestCommitted = useRef(committedSelection);
    latestCommitted.current = committedSelection;
    const select = useCallback((next: DetailsSelection | null): void => {
        setViews(previous => {
            const remembered = new Map(previous.remembered);
            if (next === null) {
                remembered.delete(previous.view);
                return { ...previous, remembered };
            }
            const view = viewOf(next.origin);
            remembered.set(view, { selection: next, selectedUnder: latestCommitted.current });
            return { view, remembered };
        });
        setVersion(next?.version ?? null);
        setReadmeWanted(false);
    }, []);
    const showView = useCallback((next: DetailsView): void => {
        const current = latestViews.current;
        if (current.view === next) {
            return;
        }
        const remembered = new Map(current.remembered);
        if (next === 'browse') {
            // The shell clears the search when Browse ends: there is nothing to come back to.
            remembered.delete('browse');
        }
        setViews({ view: next, remembered });
        setVersion(remembered.get(next)?.selection.version ?? null);
        setReadmeWanted(false);
    }, []);

    // Stale selection: an installed or update row of another project is kept read-only until the new list says.
    const stale = selection !== null && selection.origin !== 'browse' && selectedUnder !== committedSelection;
    useEffect(() => {
        if (!stale || selection === null) {
            return;
        }
        // All Projects or no project: no single installed list can confirm the package.
        if (committedProject === null) {
            select(null);
            return;
        }
        if (installed.status !== 'ready' || installed.projectPath !== committedProject || installed.result === undefined) {
            return;
        }
        const entry = installed.result.packages.find(candidate => sameId(candidate.id, selection.packageId));
        if (entry === undefined) {
            select(null);
        } else {
            setViews(previous => ({ ...previous, remembered: new Map(previous.remembered).set(previous.view, { selection: { ...selection, projectPath: committedProject }, selectedUnder: committedSelection }) }));
        }
    }, [stale, selection, committedProject, committedSelection, installed.status, installed.projectPath, installed.result, select]);

    const packageId = selection?.packageId;
    const sourceUrl = selection?.sourceUrl;
    // A transitive selection shows what the transitive slices know: no versions, details or README are asked.
    const asksFeeds = selection !== null && selection.origin !== 'transitive';
    useEffect(() => {
        if (packageId === undefined) {
            return undefined;
        }
        const id = packageId.toLowerCase();
        return bus.onEvent('resources/invalidated', event => {
            const keys = event.keys.map(entry => entry.key);
            const versions = keys.some(key => key.startsWith(`versions:${id}|`));
            const metadata = keys.some(key => key.startsWith(`metadata:${id}@`));
            if (versions || metadata) {
                setAttempts(previous => ({ ...previous, versions: previous.versions + (versions ? 1 : 0), metadata: previous.metadata + (metadata ? 1 : 0), readme: previous.readme }));
            }
        });
    }, [bus, packageId]);

    const versionsKey = packageId === undefined || !asksFeeds ? null : `${packageId.toLowerCase()}|${sourceUrl ?? 'all'}|${includePrerelease}`;
    const listed = useLoadable<RequestResult<'package/versions'>>(
        versionsKey,
        attempts.versions,
        async signal => (await bus.request('package/versions', { packageId: packageId as string, sourceUrl, includePrerelease }, { signal })).result,
        value => sameId(value.packageId, packageId as string),
    );
    const versions = useMemo<Loadable<readonly string[]>>(() => ({ ...listed, value: listed.value?.versions }), [listed]);

    const metadataKey = packageId === undefined || version === null || !asksFeeds ? null : `${packageId.toLowerCase()}@${version.toLowerCase()}|${sourceUrl ?? 'all'}`;
    const metadata = useLoadable<PackageMetadata | null>(
        metadataKey,
        attempts.metadata,
        async signal => (await bus.request('package/metadata', { packageId: packageId as string, version: version as string, sourceUrl }, { signal })).result.metadata,
        value => value === null || (sameId(value.id, packageId as string) && value.version.toLowerCase() === (version as string).toLowerCase()),
    );

    const readme = useLoadable<string | null>(
        readmeWanted ? metadataKey : null,
        attempts.readme,
        async signal => (await bus.request('package/readme', { packageId: packageId as string, version: version as string, sourceUrl }, { signal })).result.readme,
        () => true,
    );

    const actions = useMemo<DetailsActions>(() => ({
        select,
        showView,
        chooseVersion: next => setVersion(next),
        showReadme: () => setReadmeWanted(true),
        retryVersions: () => setAttempts(previous => ({ ...previous, versions: previous.versions + 1 })),
        retryMetadata: () => setAttempts(previous => ({ ...previous, metadata: previous.metadata + 1 })),
        retryReadme: () => setAttempts(previous => ({ ...previous, readme: previous.readme + 1 })),
    }), [select, showView]);

    const state = useMemo<DetailsState>(
        () => ({ selection, version, versions, metadata, readme, stale }),
        [selection, version, versions, metadata, readme, stale],
    );

    return (
        <DetailsActionsContext.Provider value={actions}>
            <DetailsContext.Provider value={state}>{children}</DetailsContext.Provider>
        </DetailsActionsContext.Provider>
    );
}

export function useDetails(): DetailsState {
    const state = useContext(DetailsContext);
    if (state === null) {
        throw new Error('useDetails needs a DetailsProvider above it');
    }
    return state;
}

export function useDetailsActions(): DetailsActions {
    const actions = useContext(DetailsActionsContext);
    if (actions === null) {
        throw new Error('useDetailsActions needs a DetailsProvider above it');
    }
    return actions;
}
