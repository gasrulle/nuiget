import { useCallback, useId, useMemo, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, type InstalledPackage } from '../../protocol';
import { IN_PROGRESS, shownVersion, whyNotRemovable } from '../shared/installed/rules';
import { Badge, cssVars, EmptyState, IconButton, Listbox, Row, SectionHeader, Skeleton, TrashIcon } from '../shared/primitives';
import { useInstalled } from '../shared/store/installed';
import { useOps, useOpsActions } from '../shared/store/ops';
import { useSession } from '../shared/store/session';
import { useRowRequests } from './rowRequests';

/** A package as the list holds it; the list identifies its items by `id`. */
interface Item {
    id: string;
    entry: InstalledPackage;
}

export { shownVersion, whyNotRemovable } from '../shared/installed/rules';

export interface InstalledSectionProps {
    /** Shows the packages whose id contains this text, whatever the case. */
    filter: string;
    /** Something to say to a screen reader that no outcome of an operation says. */
    announce: (message: string) => void;
    /** Whether the section is open; the sidebar keeps it with the view's state. When absent, the section keeps its own. */
    expanded?: boolean;
    onToggle?: () => void;
    /** The section's share of the height while both sections are open, a number of parts, for example `"40"` against `"60"`. */
    share?: string;
}

/**
 * The Installed section of the sidebar: the packages of the selected project, one row each. Enter, Delete or
 * the row's button uninstalls; the row shows a spinner from the click until the operation has ended, and the
 * list is asked for again by the store when the host says it changed, with the rows left in place meanwhile.
 */
export function InstalledSection({ filter, announce, expanded: controlled, onToggle, share }: InstalledSectionProps): React.JSX.Element {
    const installed = useInstalled();
    const { isPackageBusy, active } = useOps();
    const { run } = useOpsActions();
    const { session } = useSession();
    const [own, setOwn] = useState(true);
    const expanded = controlled ?? own;
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const baseId = useId();
    const titleId = `${baseId}-title`;
    const contentId = `${baseId}-content`;

    const { projectPath, result } = installed;
    const { menu, viewDetails } = useRowRequests(announce);
    const needle = filter.trim().toLowerCase();
    const items = useMemo<Item[]>(
        () => (result?.packages ?? []).filter(entry => entry.id.toLowerCase().includes(needle)).map(entry => ({ id: entry.id, entry })),
        [result, needle],
    );
    const isBusy = useCallback(
        (packageId: string): boolean => projectPath !== null && isPackageBusy(projectPath, packageId),
        [projectPath, isPackageBusy],
    );

    /** What the row of a busy package says: the operation the store reports, from the call that asked for it on. */
    const busyStatus = (packageId: string): string => {
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
        // The row is busy from this call on (the ops slice). The outcome, also a refusal, is announced from the
        // slice; here only a request that got no answer.
        run('ops/remove', { projectPath, packageId: entry.id }).catch((error: unknown) => {
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
                hint={readOnly
                    ? 'Read-only. Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu.'
                    : 'Enter or Delete uninstalls; Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu.'}
                testId="sidebar-installed-list"
                density="compact"
                selectedId={selectedId}
                busy={installed.revalidating}
                onSelect={item => setSelectedId(item.id)}
                onActivate={uninstall}
                onDelete={uninstall}
                onSecondaryActivate={({ entry }) => viewDetails(entry.id, entry.resolvedVersion ?? entry.version)}
                onContextMenu={({ entry }) => {
                    if (projectPath !== null) {
                        menu({ packageId: entry.id, installedVersion: entry.resolvedVersion ?? entry.version, context: 'installed', projectPath, versionType: entry.versionType });
                    }
                }}
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
        <section className={share ? 'nuiget-sidebar-section nuiget-sidebar-section--shared' : 'nuiget-sidebar-section'} style={share ? cssVars({ '--nuiget-sidebar-share': share }) : undefined}>
            <SectionHeader
                title="Installed"
                titleId={titleId}
                contentId={contentId}
                testKey="installed"
                expanded={expanded}
                onToggle={onToggle ?? (() => setOwn(previous => !previous))}
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
