import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { busyText } from '../../../shared/installed/rules';
import { Button, ConfirmDialog, GroupCaption, PropertyList } from '../../../shared/primitives';
import { consolidationUpdates, sameVersion, useAllProjects, versionDrift, type DriftEntry } from '../../../shared/store/allProjects';
import { useDetails, useDetailsActions, type DetailsSelection } from '../../../shared/store/details';
import { useOps, useOpsActions } from '../../../shared/store/ops';
import { sentence } from '../../../shared/updates/sentence';
import { projectsOf } from '../updates/ConsolidateTab';

/** Whether a version is in use by the Consolidate model's key (UX-P5.3c): the "(in use)" marks and the default read this alone. */
export const isInUse = (entry: DriftEntry, version: string): boolean => entry.inUse.some(used => sameVersion(used, version));

/** The default target (the 2026-11-27 pick): the first version of the host's list that is in use, else the list's first. */
export const defaultTarget = (list: readonly string[], entry: DriftEntry): string | undefined => list.find(version => isInUse(entry, version)) ?? list[0];

/** What the pane knows of a Consolidate selection: the live drift entry (absent when it no longer drifts) and the fan-out's state. */
export interface Consolidation {
    selection: DetailsSelection;
    entry: DriftEntry | undefined;
    /** The projects' lists were read in full once (the fan-out ready); before that no default is applied. */
    read: boolean;
    /** The lists are being asked again. */
    revalidating: boolean;
}

/**
 * The Consolidate part of the details pane (F3, UX-P5.3c): `undefined` for any other selection. For a Consolidate selection it
 * finds the live entry and, once the projects were read and the host listed the versions, offers the default target to the
 * details slice, which keeps the first offer for the selection (the default is applied once; design-advisor follow-up 1,
 * architecture-advisor follow-up 1).
 */
export function useConsolidation(): Consolidation | undefined {
    const { selection, versions } = useDetails();
    const { offerVersion } = useDetailsActions();
    const { status, projects, chunks, revalidating } = useAllProjects();
    const consolidate = selection !== null && selection.origin === 'consolidate' ? selection : null;
    const entry = useMemo(() => {
        if (consolidate === null) {
            return undefined;
        }
        const id = consolidate.packageId.toLowerCase();
        return versionDrift({ status, projects, chunks }).entries.find(candidate => candidate.id.toLowerCase() === id);
    }, [consolidate, status, projects, chunks]);
    const read = status === 'ready';
    const list = versions.status === 'ready' ? versions.value : undefined;
    const target = consolidate !== null && read && entry !== undefined && list !== undefined && list.length > 0 ? defaultTarget(list, entry) : undefined;
    useEffect(() => {
        if (consolidate !== null && target !== undefined) {
            offerVersion(consolidate, target);
        }
    }, [consolidate, target, offerVersion]);
    return consolidate === null ? undefined : { selection: consolidate, entry, read, revalidating };
}

/** Why Consolidate... is disabled, first match (design-advisor opening ruling DO 5, follow-up 1 DO 3); `note` when it shows as text. */
export function consolidateWhy(consolidation: Consolidation, chosen: string, versions: { status: string; listed: boolean; failed: boolean }): { text: string; note?: 'empty' | 'plain' } | undefined {
    const { entry, read, revalidating } = consolidation;
    if (!read || (entry === undefined && revalidating)) {
        return { text: 'The projects are being read.' };
    }
    if (entry === undefined) {
        return { text: 'No longer referenced at different versions.', note: 'empty' };
    }
    if (versions.status === 'loading' && !versions.listed) {
        return { text: 'The versions are being listed.' };
    }
    if (versions.failed) {
        return { text: 'The versions could not be listed.' };
    }
    if (entry.versions.length === 0) {
        return { text: 'No reference of this package can be changed from here.', note: 'plain' };
    }
    if (consolidationUpdates(entry, chosen).length === 0) {
        return { text: 'Every project that can change already uses this version.', note: 'plain' };
    }
    return undefined;
}

/**
 * Consolidate... and its confirmation (UX-P5.3b opening ruling DO 8): the dialog holds the version of the press, and its lines
 * and the `ops/bulkUpdateAllProjects` payload are one `consolidationUpdates` value of the live entry; central and other held
 * references are never in it. A busy entry reads its operation's word.
 */
export function ConsolidateAction({ consolidation, chosen, why, noteId, announce }: { consolidation: Consolidation; chosen: string; why: { text: string; note?: string } | undefined; noteId: string; announce: (message: string) => void }): React.JSX.Element {
    const ops = useOps();
    const { run } = useOpsActions();
    const [held, setHeld] = useState<string | null>(null);
    const { selection, entry } = consolidation;
    const busyProject = entry === undefined ? undefined : projectsOf(entry).find(path => ops.isPackageBusy(path, entry.id));
    const updates = entry === undefined || held === null ? [] : consolidationUpdates(entry, held, selection.sourceUrl);
    const fromOf = (projectPath: string): string | undefined => entry?.versions.find(at => at.projects.some(project => project.projectPath === projectPath))?.version;
    const confirm = (): void => {
        setHeld(null);
        if (updates.length === 0) {
            return;
        }
        run('ops/bulkUpdateAllProjects', { projectUpdates: updates }).catch((error: unknown) => {
            announce(`Consolidate failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };
    return (
        <>
            <Button
                data-testid="consolidate-button"
                disabled={busyProject !== undefined || why !== undefined}
                title={busyProject !== undefined ? 'An operation on this package is running.' : why?.note === undefined ? why?.text : undefined}
                aria-describedby={busyProject === undefined && why?.note !== undefined ? noteId : undefined}
                onClick={() => setHeld(chosen)}
            >
                {busyProject !== undefined ? busyText(ops, busyProject, selection.packageId) : 'Consolidate...'}
            </Button>
            <ConfirmDialog
                open={held !== null}
                title={`Consolidate ${selection.packageId} to ${held ?? chosen}?`}
                confirmLabel="Consolidate"
                onConfirm={confirm}
                onCancel={() => setHeld(null)}
                groups={updates.map(update => ({ label: `In ${update.projectName}:`, items: [{ id: selection.packageId, versions: { from: fromOf(update.projectPath) ?? '', to: held ?? chosen } }] }))}
            />
        </>
    );
}

/**
 * The Projects section that leads the Details tab panel (UX-P5.3b opening ruling DO 5, UX-P5.3c opening ruling DO 2): each
 * project and its version, then the references a consolidation leaves, with the reason.
 */
export function ConsolidateProjects({ entry }: { entry: DriftEntry }): React.JSX.Element {
    return (
        <div className="nuiget-details-lead">
            <section aria-label="Projects" className="nuiget-details-section" data-testid="consolidate-projects">
                <GroupCaption title="Projects" />
                <PropertyList items={entry.versions.flatMap(at => at.projects.map(project => ({ term: project.projectName, value: at.version })))} />
                {entry.held.length === 0 ? null : (
                    <div className="nuiget-details-block">
                        <GroupCaption level={4} title="Not Changed" />
                        <PropertyList items={entry.held.map(reference => ({
                            term: reference.projectName,
                            value: <>{reference.version === '' ? null : `${reference.version} `}<span className="nuiget-details-note">{sentence(reference.reason)}</span></>,
                        }))} />
                    </div>
                )}
            </section>
        </div>
    );
}
