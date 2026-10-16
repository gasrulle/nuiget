import { useEffect, useId, useState } from 'react';
import type React from 'react';
import { useMessageBus } from '../../../shared/bus/useMessageBus';
import { Dialog } from '../../../shared/primitives';
import { useAllProjects } from '../../../shared/store/allProjects';

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
 */
export function MultiInstallDialog({ open, packageId, version, onClose, onInstall }: MultiInstallDialogProps): React.JSX.Element | null {
    const all = useAllProjects();
    const bus = useMessageBus();
    const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
    const [central, setCentral] = useState<ReadonlyMap<string, CentralBlock>>(new Map());
    const [checking, setChecking] = useState(false);
    const baseId = useId();

    const projects = all.projects ?? [...all.chunks.values()].map(chunk => ({ name: chunk.projectName, path: chunk.projectPath }));
    const installedIn = (projectPath: string): string | undefined => {
        const entry = all.chunks.get(projectPath)?.result?.packages.find(candidate => candidate.id.toLowerCase() === packageId.toLowerCase());
        return entry === undefined ? undefined : (entry.resolvedVersion ?? entry.version);
    };
    const unsupported = (projectPath: string): boolean => all.chunks.get(projectPath)?.result?.unsupported !== undefined;
    /** The project's installed list has arrived; without it nothing says whether the package has a central entry there. */
    const listed = (projectPath: string): boolean => all.chunks.get(projectPath)?.result !== undefined;
    const cpmTargets = open
        ? projects.filter(project => all.chunks.get(project.path)?.result?.isCpm === true && !unsupported(project.path) && installedIn(project.path) !== version).map(project => project.path)
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
                        note = all.chunks.get(project.path)?.error !== undefined ? 'could not be read' : 'not listed yet';
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
