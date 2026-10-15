import { useId, useMemo, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, type PackageUpdate } from '../../protocol';
import { IN_PROGRESS } from '../shared/installed/rules';
import { ArrowUpIcon, Badge, Banner, cssVars, EmptyState, IconButton, Listbox, Row, SectionHeader, Skeleton } from '../shared/primitives';
import { useInstalled } from '../shared/store/installed';
import { useOps, useOpsActions } from '../shared/store/ops';
import { useSession } from '../shared/store/session';
import { useUpdates } from '../shared/store/updates';
import { useRowRequests } from './rowRequests';

interface Item {
    id: string;
    update: PackageUpdate;
}

export interface UpdatesSectionProps {
    /** Something to say to a screen reader that no outcome of an operation says. */
    announce: (message: string) => void;
    /** The text after `@updates`: only updates whose id contains it are listed. */
    filter?: string;
    /** Whether the section is open; the sidebar keeps it with the view's state. When absent, the section keeps its own. */
    expanded?: boolean;
    onToggle?: () => void;
    /** The section's share of the height while both sections are open, a number of parts, for example `"60"` against `"40"`. */
    share?: string;
}

function emptyMessage(sourcesUnavailable: boolean, total: number, filter: string): string {
    if (sourcesUnavailable && total === 0) {
        return 'Updates could not be checked.';
    }
    return total > 0 && filter.length > 0 ? `No updates match "${filter}".` : 'No updates available.';
}

/**
 * The Updates section of the sidebar: one compact row per update of the selected project. Enter or the row's button
 * updates the package to its latest version; a centrally managed package is not updated from here until the central
 * editor exists (P6.3). A source that could not be checked is a banner, never "no updates".
 */
export function UpdatesSection({ announce, filter = '', expanded: controlled, onToggle, share }: UpdatesSectionProps): React.JSX.Element {
    const updates = useUpdates();
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

    const { projectPath, rows } = updates;
    const { menu, viewDetails } = useRowRequests(announce);
    const needle = filter.trim().toLowerCase();
    const items = useMemo<Item[]>(() => rows.filter(update => update.id.toLowerCase().includes(needle)).map(update => ({ id: update.id, update })), [rows, needle]);
    const centralIds = useMemo(() => new Set((installed.result?.packages ?? [])
        .filter(entry => entry.declaration === 'central' || entry.declaration === 'central-override')
        .map(entry => entry.id.toLowerCase())), [installed.result]);
    const isBusy = (id: string): boolean => projectPath !== null && isPackageBusy(projectPath, id);

    const busyStatus = (packageId: string): string => {
        const id = packageId.toLowerCase();
        for (const progress of active.values()) {
            if (progress.kind !== undefined && progress.projectPaths?.includes(projectPath ?? '') && progress.packageIds?.some(other => other.toLowerCase() === id)) {
                return IN_PROGRESS[progress.kind];
            }
        }
        return 'In progress';
    };

    const updateOne = ({ update }: Item): void => {
        if (projectPath === null || isBusy(update.id)) {
            return;
        }
        if (centralIds.has(update.id.toLowerCase())) {
            announce(`${update.id} is centrally managed; change its version in Directory.Packages.props.`);
            return;
        }
        run('ops/update', { projectPath, packageId: update.id, version: update.latestVersion, sourceUrl: update.sourceUrl }).catch((error: unknown) => {
            announce(`Update of ${update.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    const known = updates.status === 'ready' && !updates.sourcesUnavailable;
    let content: React.ReactNode;
    if (projectPath === null) {
        content = session === undefined
            ? <Skeleton density="compact" />
            : <EmptyState data-testid="sidebar-updates-empty" message={session.selectedProject === ALL_PROJECTS ? 'All Projects is not available in this view yet. Select a single project.' : 'No .NET projects found in this workspace.'} />;
    } else if (rows.length === 0 && updates.status === 'loading') {
        content = <Skeleton density="compact" />;
    } else {
        content = (
            <>
                {updates.sourcesUnavailable
                    ? <Banner severity="warning" data-testid="sidebar-updates-unavailable" action={{ label: 'Retry', onClick: updates.refresh }}>Some package sources could not be checked.</Banner>
                    : null}
                {updates.error
                    ? <Banner severity="error" action={{ label: 'Retry', onClick: updates.refresh }}>{`Updates could not be checked: ${updates.error.message}`}</Banner>
                    : null}
                <Listbox
                    items={items}
                    labelledBy={titleId}
                    hint="Enter updates to the latest version; Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu."
                    testId="sidebar-updates-list"
                    density="compact"
                    selectedId={selectedId}
                    busy={updates.revalidating}
                    onSelect={item => setSelectedId(item.id)}
                    onActivate={updateOne}
                    onSecondaryActivate={({ update }) => viewDetails(update.id, update.latestVersion)}
                    onContextMenu={({ update }) => {
                        if (projectPath !== null) {
                            const versionType = installed.result?.packages.find(entry => entry.id.toLowerCase() === update.id.toLowerCase())?.versionType;
                            menu({ packageId: update.id, installedVersion: update.installedVersion, latestVersion: update.latestVersion, context: 'updates', projectPath, versionType, sourceUrl: update.sourceUrl });
                        }
                    }}
                    empty={<EmptyState data-testid="sidebar-updates-empty" message={emptyMessage(updates.sourcesUnavailable, rows.length, filter.trim())} />}
                    renderRow={(item, placement) => {
                        const { update } = item;
                        const busy = isBusy(update.id);
                        const central = centralIds.has(update.id.toLowerCase());
                        return (
                            <Row
                                {...placement}
                                itemId={update.id}
                                name={update.id}
                                version={`${update.installedVersion} → ${update.latestVersion}`}
                                density="compact"
                                busy={busy}
                                status={busy ? busyStatus(update.id) : undefined}
                                badges={central ? <Badge label="CPM" title="Centrally managed" /> : undefined}
                                actions={central ? undefined : (
                                    <IconButton label={`Update ${update.id} to ${update.latestVersion}`} tabIndex={-1} data-testid="row-action-update" onClick={() => updateOne(item)}><ArrowUpIcon /></IconButton>
                                )}
                            />
                        );
                    }}
                />
            </>
        );
    }

    return (
        <section className={share ? 'nuiget-sidebar-section nuiget-sidebar-section--shared' : 'nuiget-sidebar-section'} style={share ? cssVars({ '--nuiget-sidebar-share': share }) : undefined}>
            <SectionHeader
                title="Updates"
                titleId={titleId}
                contentId={contentId}
                testKey="updates"
                expanded={expanded}
                onToggle={onToggle ?? (() => setOwn(previous => !previous))}
                count={known ? rows.length : undefined}
                busy={updates.status === 'loading' || updates.revalidating}
            />
            {expanded ? <div className="nuiget-sidebar-section-content" id={contentId}>{content}</div> : null}
        </section>
    );
}
