import { useEffect, useId, useState } from 'react';
import type React from 'react';
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

/**
 * The project picker of Install in All Projects (interaction model §3): every project with a checkbox and the version
 * already installed there; a project that has the chosen version cannot be picked. Plain checkboxes, not a listbox:
 * an option may hold no control (`nested-interactive`).
 */
export function MultiInstallDialog({ open, packageId, version, onClose, onInstall }: MultiInstallDialogProps): React.JSX.Element | null {
    const all = useAllProjects();
    const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
    const baseId = useId();

    useEffect(() => {
        if (open) {
            setPicked(new Set());
        }
    }, [open]);

    const projects = all.projects ?? [...all.chunks.values()].map(chunk => ({ name: chunk.projectName, path: chunk.projectPath }));
    const installedIn = (projectPath: string): string | undefined => {
        const entry = all.chunks.get(projectPath)?.result?.packages.find(candidate => candidate.id.toLowerCase() === packageId.toLowerCase());
        return entry === undefined ? undefined : (entry.resolvedVersion ?? entry.version);
    };
    const unsupported = (projectPath: string): boolean => all.chunks.get(projectPath)?.result?.unsupported !== undefined;
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
                    <button type="button" className="nuiget-button" disabled={picked.size === 0} onClick={() => onInstall([...picked])}>{`Install in ${picked.size} ${picked.size === 1 ? 'project' : 'projects'}`}</button>
                </>
            )}
        >
            <ul className="nuiget-multi-install" aria-label="Projects">
                {projects.map(project => {
                    const current = installedIn(project.path);
                    const blocked = current === version || unsupported(project.path);
                    const id = `${baseId}-${project.path}`;
                    let note = '';
                    if (unsupported(project.path)) {
                        note = 'unsupported';
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
