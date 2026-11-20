import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, resourceKeys, type InstalledPackage, type InstalledResult, type PackageMetadataLite, type ProtocolRequestError } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';
import { useSession } from './session';
import { useResource, type ResourceState } from './useResource';

export interface InstalledState {
    /** The project the rest belongs to; `null` when no single project is selected (none, or all projects). */
    projectPath: string | null;
    status: ResourceState<InstalledResult>['status'];
    /**
     * The installed packages of `projectPath`. They stay on screen while a newer result is on its way. While a request is
     * unanswered, the latest provisional chunk is shown when no list or a provisional one is on screen; over an evaluated
     * list only its static changes are merged in, against the provisional list that came with that answer, and the
     * evaluated rows and `fidelity` stay (X7, UX-P4.8a).
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

const NO_ROWS: readonly InstalledPackage[] = [];

/** The rows of a list by lower-cased package id, in list order. */
function rowsById(rows: readonly InstalledPackage[]): Map<string, InstalledPackage[]> {
    const byId = new Map<string, InstalledPackage[]>();
    for (const row of rows) {
        const id = row.id.toLowerCase();
        const list = byId.get(id);
        if (list === undefined) {
            byId.set(id, [row]);
        } else {
            list.push(row);
        }
    }
    return byId;
}

/** What the static inspection says of a row: everything but the version the assets file resolved. */
const staticForm = (row: InstalledPackage): string => JSON.stringify({ ...row, resolvedVersion: undefined });

const sameStatic = (left: readonly InstalledPackage[], right: readonly InstalledPackage[]): boolean =>
    left.length === right.length && left.every((row, index) => staticForm(row) === staticForm(right[index]));

/**
 * One package id of the merge: `evaluated` the rows on screen, `witness` the provisional rows that came with them, `chunk`
 * the new provisional rows. Returns `evaluated` itself when nothing changes.
 */
function mergeRows(evaluated: readonly InstalledPackage[], witness: readonly InstalledPackage[], chunk: readonly InstalledPackage[]): readonly InstalledPackage[] {
    if (chunk.length === 0) {
        // Gone from the files when the static pass saw it before; an evaluated-only row otherwise.
        return witness.length > 0 ? NO_ROWS : evaluated;
    }
    if (sameStatic(chunk, witness)) {
        if (evaluated.length === 1 && chunk.length === 1 && chunk[0].resolvedVersion !== undefined && chunk[0].resolvedVersion !== evaluated[0].resolvedVersion) {
            return [{ ...evaluated[0], resolvedVersion: chunk[0].resolvedVersion }];
        }
        return evaluated;
    }
    if (evaluated.length > 1 || chunk.length > 1) {
        return evaluated.length > 0 ? evaluated : chunk;
    }
    const [row] = chunk;
    if (row.declaration === 'unresolved' && evaluated.length > 0) {
        return evaluated;
    }
    const before = evaluated[0];
    return [{
        ...row,
        ...(before?.isImplicit === true ? { isImplicit: true } : {}),
        ...(row.targetFrameworks === undefined && before?.targetFrameworks !== undefined ? { targetFrameworks: before.targetFrameworks } : {}),
    }];
}

/**
 * The static changes between two provisional lists of one project applied to the evaluated list on screen (X7, UX-P4.8a):
 * a reference gone from the files leaves, a new or re-versioned one comes from the chunk, every other evaluated row stays,
 * and so do the list's `fidelity` and the rest of it. Rows keep the evaluated order; a new id follows in chunk order.
 */
function mergeProvisional(evaluated: InstalledResult, witness: InstalledResult, chunk: InstalledResult): InstalledResult {
    const before = rowsById(evaluated.packages);
    const seen = rowsById(witness.packages);
    const now = rowsById(chunk.packages);
    let changed = false;
    const packages: InstalledPackage[] = [];
    for (const id of new Set([...before.keys(), ...now.keys()])) {
        const rows = before.get(id) ?? NO_ROWS;
        const merged = mergeRows(rows, seen.get(id) ?? NO_ROWS, now.get(id) ?? NO_ROWS);
        changed ||= merged !== rows;
        packages.push(...merged);
    }
    return changed ? { ...evaluated, packages } : evaluated;
}

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
    // The latest provisional chunk. A request that starts with no list on screen drops it; over a list it stays until a newer
    // chunk or an answer. It counts only over the answer that was on screen when it came (ADR-009 d.3, X7, UX-P4.8a).
    const [provisional, setProvisional] = useState<{ projectPath: string; result: InstalledResult; over: InstalledResult | undefined }>();
    // Each answer that streamed a chunk, with that chunk: the witness of what the static pass saw then (X7, UX-P4.8a).
    const [witnesses] = useState(() => new WeakMap<InstalledResult, InstalledResult>());
    const onScreen = useRef<InstalledResult | undefined>(undefined);

    const requester = useCallback((signal: AbortSignal) => {
        if (onScreen.current === undefined) {
            setProvisional(undefined);
        }
        const requested = projectPath as string;
        let streamed: InstalledResult | undefined;
        return bus.request('installed/get', { projectPath: requested }, {
            signal,
            onChunk: chunk => {
                if (!signal.aborted) {
                    streamed = chunk.result;
                    setProvisional({ projectPath: requested, result: chunk.result, over: onScreen.current });
                }
            },
        }).then(answer => {
            if (streamed !== undefined) {
                witnesses.set(answer.result, streamed);
            }
            return answer;
        });
    }, [bus, projectPath, witnesses]);

    const resource = useResource<InstalledResult>(projectPath === null ? null : resourceKeys.installed(projectPath), requester);
    const data = resource.data;
    onScreen.current = data;
    const unanswered = resource.status === 'loading' || resource.revalidating;
    const chunk = provisional !== undefined && provisional.projectPath === projectPath && provisional.over === data && unanswered ? provisional.result : undefined;
    const witness = data === undefined ? undefined : witnesses.get(data);
    const shown = useMemo(() => {
        if (chunk === undefined) {
            return data;
        }
        if (data === undefined || data.fidelity === 'provisional') {
            return chunk;
        }
        if (witness === undefined || data.unsupported !== undefined || chunk.isCpm !== witness.isCpm) {
            return data;
        }
        return mergeProvisional(data, witness, chunk);
    }, [data, witness, chunk]);

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
