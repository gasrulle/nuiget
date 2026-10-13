import { useCallback, useId, useMemo, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, type InstalledPackage, type InstalledResult, type OperationKind } from '../../protocol';
import { Badge, EmptyState, IconButton, Listbox, Row, SectionHeader, Skeleton, TrashIcon } from '../shared/primitives';
import { useInstalled } from '../shared/store/installed';
import { useOps, useOpsActions } from '../shared/store/ops';
import { useSession } from '../shared/store/session';

/** A package as the list holds it; the list identifies its items by `id`. */
interface Item {
    id: string;
    entry: InstalledPackage;
}

const pendingKey = (projectPath: string, packageId: string): string => `${projectPath}|${packageId.toLowerCase()}`;

/** What a busy row says is happening to its package. */
const IN_PROGRESS: Record<OperationKind, string> = { install: 'Installing', update: 'Updating', remove: 'Uninstalling', restore: 'Restoring' };

/** The version a row shows: what the project resolves to where the declaration is a pattern, else what it declares. */
export function shownVersion(entry: InstalledPackage): string {
    if (entry.declaration === 'unresolved' || entry.versionType === 'unresolved') {
        return 'unresolved';
    }
    const pattern = entry.versionType === 'floating' || entry.versionType === 'range';
    return (pattern ? entry.resolvedVersion : undefined) ?? entry.version;
}

/**
 * Why a package cannot be uninstalled from this list, in a sentence for the user; `undefined` when it can.
 * A centrally managed package stays read-only until the preview of what a central change touches exists.
 */
export function whyNotRemovable(entry: InstalledPackage, result: InstalledResult): string | undefined {
    if (result.unsupported) {
        return `${entry.id} cannot be uninstalled: ${result.unsupported.message}`;
    }
    if (entry.declaration === 'unresolved') {
        return `${entry.id} cannot be uninstalled: its reference could not be resolved`;
    }
    if (entry.isImplicit) {
        return `${entry.id} is added by the .NET SDK and cannot be uninstalled`;
    }
    if (entry.declaration === 'props') {
        return `${entry.id} is declared in an imported props file and cannot be uninstalled from the project`;
    }
    if (entry.declaration === 'central' || entry.declaration === 'central-override') {
        return `${entry.id} is managed centrally and cannot be uninstalled from this view yet`;
    }
    return undefined;
}

export interface InstalledSectionProps {
    /** Shows the packages whose id contains this text, whatever the case. */
    filter: string;
    /** Something to say to a screen reader that no outcome of an operation says. */
    announce: (message: string) => void;
}

/**
 * The Installed section of the sidebar: the packages of the selected project, one row each. Enter, Delete or
 * the row's button uninstalls; the row shows a spinner from the click until the operation has ended, and the
 * list is asked for again by the store when the host says it changed, with the rows left in place meanwhile.
 */
export function InstalledSection({ filter, announce }: InstalledSectionProps): React.JSX.Element {
    const installed = useInstalled();
    const { isPackageBusy, active } = useOps();
    const { run } = useOpsActions();
    const { session } = useSession();
    const [expanded, setExpanded] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Asked for by this surface and not answered yet. The store knows an operation from its first progress
    // report on; while it waits in the queue only the surface that asked knows of it.
    const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
    const baseId = useId();
    const titleId = `${baseId}-title`;
    const contentId = `${baseId}-content`;

    const { projectPath, result } = installed;
    const needle = filter.trim().toLowerCase();
    const items = useMemo<Item[]>(
        () => (result?.packages ?? []).filter(entry => entry.id.toLowerCase().includes(needle)).map(entry => ({ id: entry.id, entry })),
        [result, needle],
    );
    const isBusy = useCallback(
        (packageId: string): boolean => projectPath !== null && (pending.has(pendingKey(projectPath, packageId)) || isPackageBusy(projectPath, packageId)),
        [projectPath, pending, isPackageBusy],
    );

    /** What the row of a busy package says: the uninstall asked for here, else the operation the store reports. */
    const busyStatus = (packageId: string): string => {
        if (projectPath !== null && pending.has(pendingKey(projectPath, packageId))) {
            return IN_PROGRESS.remove;
        }
        const id = packageId.toLowerCase();
        for (const progress of active.values()) {
            if (progress.kind !== undefined && progress.projectPaths?.includes(projectPath ?? '') && progress.packageIds?.some(other => other.toLowerCase() === id)) {
                return IN_PROGRESS[progress.kind];
            }
        }
        return 'In progress';
    };

    const uninstall = ({ entry }: Item): void => {
        if (projectPath === null || result === undefined || isBusy(entry.id)) {
            return;
        }
        const obstacle = whyNotRemovable(entry, result);
        if (obstacle !== undefined) {
            announce(obstacle);
            return;
        }
        const key = pendingKey(projectPath, entry.id);
        setPending(previous => new Set(previous).add(key));
        const settled = (): void => setPending(previous => {
            const next = new Set(previous);
            next.delete(key);
            return next;
        });
        // The outcome, also a refusal, is announced from the ops slice; here only a request that got no answer.
        run('ops/remove', { projectPath, packageId: entry.id }).then(settled, (error: unknown) => {
            settled();
            announce(`Uninstall of ${entry.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    const all = result?.packages.length;
    const readOnly = result?.unsupported !== undefined;

    let content: React.ReactNode;
    if (projectPath === null) {
        content = session === undefined
            ? <Skeleton density="compact" />
            : <EmptyState data-testid="sidebar-installed-empty" message={session.selectedProject === ALL_PROJECTS ? 'All Projects is not available in this view yet. Select a single project.' : 'No .NET projects found in this workspace.'} />;
    } else if (result === undefined) {
        // An error is shown by the banner above the section; there is nothing to list.
        content = installed.status === 'error' ? null : <Skeleton density="compact" />;
    } else {
        const nothing = all === 0
            ? (readOnly ? 'No packages to show.' : 'No packages installed.')
            : `No installed packages match "${filter.trim()}".`;
        content = (
            <Listbox
                items={items}
                labelledBy={titleId}
                hint={readOnly ? 'This project is read-only.' : 'Enter or Delete uninstalls the package.'}
                testId="sidebar-installed-list"
                density="compact"
                selectedId={selectedId}
                busy={installed.revalidating}
                onSelect={item => setSelectedId(item.id)}
                onActivate={uninstall}
                onDelete={uninstall}
                empty={<EmptyState data-testid="sidebar-installed-empty" message={nothing} />}
                renderRow={(item, placement) => {
                    const { entry } = item;
                    const busy = isBusy(entry.id);
                    const unresolved = entry.declaration === 'unresolved';
                    const central = entry.declaration === 'central' || entry.declaration === 'central-override';
                    return (
                        <Row
                            {...placement}
                            itemId={entry.id}
                            name={entry.id}
                            version={shownVersion(entry)}
                            density="compact"
                            busy={busy}
                            disabled={unresolved}
                            status={busy ? busyStatus(entry.id) : unresolved ? 'Unresolved' : undefined}
                            badges={central ? <Badge label="CPM" title="Centrally managed" /> : undefined}
                            actions={whyNotRemovable(entry, result) === undefined
                                ? <IconButton label={`Uninstall ${entry.id}`} tabIndex={-1} data-testid="row-action-uninstall" onClick={() => uninstall(item)}><TrashIcon /></IconButton>
                                : undefined}
                        />
                    );
                }}
            />
        );
    }

    return (
        <section className="nuiget-sidebar-section">
            <SectionHeader
                title="Installed"
                titleId={titleId}
                contentId={contentId}
                testKey="installed"
                expanded={expanded}
                onToggle={() => setExpanded(previous => !previous)}
                count={all}
                busy={installed.status === 'loading' || installed.revalidating}
                actions={result?.fidelity === 'provisional'
                    ? <span className="nuiget-sidebar-fidelity" title="Versions come from the project files; a full evaluation is pending." data-testid="sidebar-installed-provisional"><Badge label="provisional" tone="info" /></span>
                    : undefined}
            />
            {expanded ? <div className="nuiget-sidebar-section-content" id={contentId}>{content}</div> : null}
        </section>
    );
}
