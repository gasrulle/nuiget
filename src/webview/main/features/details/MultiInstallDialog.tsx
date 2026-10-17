import { useEffect, useId, useReducer, useRef, useState } from 'react';
import type React from 'react';
import { ProtocolRequestError } from '../../../../protocol';
import { useMessageBus } from '../../../shared/bus/useMessageBus';
import { Dialog } from '../../../shared/primitives';
import { allProjectsReducer, EMPTY_ALL_PROJECTS, useAllProjects } from '../../../shared/store/allProjects';
import { useProjects } from '../../../shared/store/projects';

export interface MultiInstallDialogProps {
    open: boolean;
    packageId: string;
    version: string;
    onClose: () => void;
    /** Install into these projects; the dialog closes. */
    onInstall: (projectPaths: string[]) => void;
}

/** Why a Central Package Management project is left out: its central entry, or a preview that could not be taken. */
type CentralBlock = 'central' | 'failed';

/**
 * The project picker of Install in All Projects (interaction model §3): every project with a checkbox and the version
 * already installed there; a project that has the chosen version cannot be picked. Plain checkboxes, not a listbox:
 * an option may hold no control (`nested-interactive`). A bulk install shows no preview, so a Central Package
 * Management project where the package has a central entry (or whose preview fails) cannot be picked either (N76):
 * installing there changes the central version for every project that uses it, which the single install shows first.
 * A project whose installed list has not arrived, or carries an error, cannot be picked either (P7 phase review).
 * Under All Projects it reads the slice's lists; from a single project (Install in projects…, P9.8) it streams
 * `allProjects/installed` itself while it is open, with the slice's reducer, and never activates the slice.
 */
export function MultiInstallDialog({ open, packageId, version, onClose, onInstall }: MultiInstallDialogProps): React.JSX.Element | null {
    const all = useAllProjects();
    const bus = useMessageBus();
    const listedProjects = useProjects().projects;
    const [own, dispatch] = useReducer(allProjectsReducer, EMPTY_ALL_PROJECTS);
    const ownSeq = useRef(0);
    const source = all.active ? all : own;
    const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
    const [central, setCentral] = useState<ReadonlyMap<string, CentralBlock>>(new Map());
    const [checking, setChecking] = useState(false);
    const baseId = useId();

    // Outside All Projects the slice is idle: the dialog lists the projects itself while it is open.
    useEffect(() => {
        if (!open) {
            dispatch({ type: 'reset' });
            return undefined;
        }
        if (all.active) {
            return undefined;
        }
        const seq = ++ownSeq.current;
        const controller = new AbortController();
        dispatch({ type: 'requested', seq });
        bus.request('allProjects/installed', {}, { signal: controller.signal, onChunk: chunk => dispatch({ type: 'chunk', seq, chunk }) }).then(
            answer => dispatch({ type: 'answered', seq, result: answer.result }),
            (error: unknown) => {
                if (!controller.signal.aborted) {
                    dispatch({ type: 'failed', seq, error: error instanceof ProtocolRequestError ? error : new ProtocolRequestError('failed', error instanceof Error ? error.message : String(error)) });
                }
            },
        );
        return () => controller.abort();
    }, [open, all.active, bus]);

    const projects = source.projects ?? listedProjects ?? [...source.chunks.values()].map(chunk => ({ name: chunk.projectName, path: chunk.projectPath }));
    const installedIn = (projectPath: string): string | undefined => {
        const entry = source.chunks.get(projectPath)?.result?.packages.find(candidate => candidate.id.toLowerCase() === packageId.toLowerCase());
        return entry === undefined ? undefined : (entry.resolvedVersion ?? entry.version);
    };
    const unsupported = (projectPath: string): boolean => source.chunks.get(projectPath)?.result?.unsupported !== undefined;
    /** The project's installed list has arrived; without it nothing says whether the package has a central entry there. */
    const listed = (projectPath: string): boolean => source.chunks.get(projectPath)?.result !== undefined;
    const cpmTargets = open
        ? projects.filter(project => source.chunks.get(project.path)?.result?.isCpm === true && !unsupported(project.path) && installedIn(project.path) !== version).map(project => project.path)
        : [];
    const cpmKey = cpmTargets.join('\n');

    useEffect(() => {
        if (open) {
            setPicked(new Set());
        }
    }, [open]);

    // One preview per CPM target when the dialog opens, one after the other; closing or unmounting aborts the rest.
    useEffect(() => {
        setCentral(new Map());
        if (cpmKey === '') {
            setChecking(false);
            return undefined;
        }
        const controller = new AbortController();
        setChecking(true);
        void (async () => {
            const blocked = new Map<string, CentralBlock>();
            for (const projectPath of cpmKey.split('\n')) {
                try {
                    const { result } = await bus.request('cpm/preview', { projectPath, packageId, version }, { signal: controller.signal });
                    if (result.preview !== null) {
                        blocked.set(projectPath, 'central');
                    }
                } catch {
                    if (controller.signal.aborted) {
                        return;
                    }
                    blocked.set(projectPath, 'failed');
                }
            }
            if (!controller.signal.aborted) {
                setCentral(blocked);
                setPicked(previous => new Set([...previous].filter(projectPath => !blocked.has(projectPath))));
                setChecking(false);
            }
        })();
        return () => controller.abort();
    }, [bus, cpmKey, packageId, version]);
    const toggle = (projectPath: string): void => setPicked(previous => {
        const next = new Set(previous);
        if (!next.delete(projectPath)) {
            next.add(projectPath);
        }
        return next;
    });

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={`Install ${packageId} ${version}`}
            description="Choose the projects to install it into."
            data-testid="multi-install-dialog"
            footer={(
                <>
                    <button type="button" className="nuiget-button nuiget-button--secondary" onClick={onClose}>Cancel</button>
                    <button type="button" className="nuiget-button" disabled={picked.size === 0 || checking} onClick={() => onInstall([...picked])}>{`Install in ${picked.size} ${picked.size === 1 ? 'project' : 'projects'}`}</button>
                </>
            )}
        >
            <ul className="nuiget-multi-install" aria-label="Projects">
                {projects.map(project => {
                    const current = installedIn(project.path);
                    const centralBlock = central.get(project.path);
                    const blocked = current === version || unsupported(project.path) || centralBlock !== undefined || !listed(project.path);
                    const id = `${baseId}-${project.path}`;
                    let note = '';
                    if (unsupported(project.path)) {
                        note = 'unsupported';
                    } else if (!listed(project.path)) {
                        note = source.chunks.get(project.path)?.error !== undefined ? 'could not be read' : 'not listed yet';
                    } else if (centralBlock === 'central') {
                        note = 'centrally managed: install it from the project to see the preview';
                    } else if (centralBlock === 'failed') {
                        note = 'preview failed';
                    } else if (current !== undefined) {
                        note = current === version ? `${current} installed` : `installed: ${current}`;
                    }
                    return (
                        <li key={project.path} className="nuiget-multi-install-row">
                            <input id={id} type="checkbox" checked={picked.has(project.path)} disabled={blocked} onChange={() => toggle(project.path)} />
                            <label htmlFor={id} title={project.path}>{project.name}</label>
                            {note ? <span className="nuiget-multi-install-note">{note}</span> : null}
                        </li>
                    );
                })}
            </ul>
        </Dialog>
    );
}
