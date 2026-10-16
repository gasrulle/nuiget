import { useId, useState } from 'react';
import type React from 'react';
import type { InstalledPackage, InstalledResult, PackageMetadataLite } from '../../../../protocol';
import { IN_PROGRESS, versionCell, whyNotRemovable } from '../../../shared/installed/rules';
import { packageIconSrc } from '../../../shared/packageIcon';
import { Badge, Banner, EmptyState, IconButton, Listbox, Row, SectionHeader, Skeleton, TrashIcon } from '../../../shared/primitives';
import { useOps } from '../../../shared/store/ops';

/** A package as the list holds it; the list identifies its items by `id`. */
export interface Item {
    id: string;
    entry: InstalledPackage;
}

export interface InstalledProjectSectionProps {
    projectPath: string;
    projectName: string;
    result: InstalledResult | undefined;
    status: 'idle' | 'loading' | 'ready' | 'error';
    /** Why the list could not be read; shown with Retry. */
    error: string | undefined;
    onRetry: () => void;
    metadata: ReadonlyMap<string, PackageMetadataLite>;
    filter: string;
    vulnerableOnly: boolean;
    /** The packages of this project selected for a bulk action. */
    selected: ReadonlySet<string>;
    /** The id of the current row in this project, or `null`. */
    currentId: string | null;
    onToggle: (entry: InstalledPackage) => void;
    onCurrent: (id: string) => void;
    onUninstall: (entry: InstalledPackage) => void;
    /** All Projects: a heading with the project's name over the list, and a list id of its own. */
    grouped: boolean;
    /** The heading level of a grouped section: 3 under a workspace folder's heading. */
    level?: 2 | 3;
    revalidating: boolean;
}

const HINT = 'Space selects the package for a bulk action. Enter shows its details. Delete uninstalls it. Shift+F10 opens the actions menu.';

const isVulnerable = (metadata: ReadonlyMap<string, PackageMetadataLite>, id: string): boolean =>
    (metadata.get(id.toLowerCase())?.vulnerabilities?.length ?? 0) > 0;

/** The rows a filter leaves, and what to say when it leaves none. */
export function visibleRows(result: InstalledResult, metadata: ReadonlyMap<string, PackageMetadataLite>, filter: string, vulnerableOnly: boolean): { items: Item[]; empty: string } {
    const needle = filter.trim().toLowerCase();
    let entries = result.packages.filter(entry => entry.id.toLowerCase().includes(needle));
    if (vulnerableOnly) {
        // Empty is not unknown: without any metadata nothing can be said about vulnerabilities.
        if (metadata.size === 0) {
            return { items: [], empty: 'Vulnerability data is not available for this project yet.' };
        }
        entries = entries.filter(entry => isVulnerable(metadata, entry.id));
    }
    const empty = result.packages.length === 0
        ? 'No packages installed.'
        : vulnerableOnly ? 'No vulnerable packages.' : `No installed package matches "${filter.trim()}".`;
    return { items: entries.map(entry => ({ id: entry.id, entry })), empty };
}

/**
 * The installed packages of one project in the main panel: a multi-selectable list (Space marks a row for a
 * bulk action, Enter or a click makes it the current row, Delete uninstalls it) under a collapsible header, the
 * project's name in All Projects and `Direct packages (N)` for a single project, `(k of N)` while a filter hides
 * rows. The header carries the `provisional` and `Unsupported` badges. A row shows the icon, authors and Verified
 * mark of the lite metadata and no description (D14); a package that cannot be uninstalled (SDK, props) keeps a
 * muted check mark and its badge says why.
 */
export function InstalledProjectSection(props: InstalledProjectSectionProps): React.JSX.Element {
    const { projectPath, projectName, result, status, error, onRetry, metadata, filter, vulnerableOnly, selected, currentId, onToggle, onCurrent, onUninstall, grouped, revalidating, level = 2 } = props;
    const { isPackageBusy, active } = useOps();
    const [expanded, setExpanded] = useState(true);
    const baseId = useId();
    const titleId = `${baseId}-title`;
    const contentId = `${baseId}-content`;

    const busyStatus = (packageId: string): string => {
        const id = packageId.toLowerCase();
        for (const progress of active.values()) {
            if (progress.kind !== undefined && progress.projectPaths?.includes(projectPath) && progress.packageIds?.some(other => other.toLowerCase() === id)) {
                return IN_PROGRESS[progress.kind];
            }
        }
        return 'In progress';
    };

    const shown = result === undefined ? undefined : visibleRows(result, metadata, filter, vulnerableOnly);
    let content: React.ReactNode;
    if (result === undefined || shown === undefined) {
        content = status === 'error' || error !== undefined
            ? <Banner severity="error" action={{ label: 'Retry', onClick: onRetry }}>{`Installed packages of ${projectName} could not be loaded: ${error ?? 'unknown error'}`}</Banner>
            : <Skeleton density="comfortable" />;
    } else {
        const { items, empty } = shown;
        // An unsupported project has no packages, except one whose SDK is too old (D13): it keeps its list, read-only.
        const listed = result.unsupported === undefined || result.packages.length > 0;
        content = (
            <>
                {result.unsupported ? <Banner severity="warning">{`Unsupported project: ${result.unsupported.message}`}</Banner> : null}
                {error !== undefined ? <Banner severity="error" action={{ label: 'Retry', onClick: onRetry }}>{`Installed packages of ${projectName} could not be loaded: ${error}`}</Banner> : null}
                {listed ? <Listbox
                    items={items}
                    {...(grouped ? { labelledBy: titleId } : { label: 'Installed packages' })}
                    hint={HINT}
                    testId={grouped ? `installed-list-${projectName.toLowerCase()}` : 'installed-list'}
                    density="comfortable"
                    busy={revalidating}
                    selectedId={currentId}
                    selectedIds={selected}
                    onToggleSelected={item => onToggle(item.entry)}
                    onSelect={item => onCurrent(item.id)}
                    onActivate={item => onCurrent(item.id)}
                    onDelete={item => onUninstall(item.entry)}
                    empty={<EmptyState message={empty} />}
                    renderRow={(item, placement) => {
                        const { entry } = item;
                        const busy = isPackageBusy(projectPath, entry.id);
                        const readOnly = whyNotRemovable(entry, result) !== undefined;
                        const unresolved = entry.declaration === 'unresolved';
                        const central = entry.declaration === 'central' || entry.declaration === 'central-override';
                        const lite = metadata.get(entry.id.toLowerCase());
                        const cell = versionCell(entry);
                        const src = packageIconSrc(lite?.iconUrl);
                        return (
                            <Row
                                {...placement}
                                itemId={entry.id}
                                name={entry.id}
                                version={cell.text}
                                versionTitle={cell.title}
                                authors={lite?.authors}
                                verified={lite?.verified}
                                icon={src === undefined ? undefined : <img src={src} alt="" />}
                                density="comfortable"
                                busy={busy}
                                disabled={unresolved}
                                selectable={!readOnly}
                                status={busy ? busyStatus(entry.id) : unresolved ? 'Unresolved' : undefined}
                                badges={<>
                                    {entry.isImplicit ? <Badge label="SDK" title="Added by the .NET SDK; cannot be uninstalled" /> : null}
                                    {entry.declaration === 'props' ? <Badge label="props" title="Declared in an imported props file; cannot be uninstalled from the project" /> : null}
                                    {central ? <Badge label="CPM" title="Centrally managed" /> : null}
                                    {entry.versionType === 'floating'
                                        ? <Badge label="floating" title="Floating version pattern" />
                                        : entry.versionType === 'range' ? <Badge label="range" title="Version range" /> : null}
                                    {isVulnerable(metadata, entry.id) ? <Badge label="Vulnerable" tone="error" title="Has known vulnerabilities" /> : null}
                                </>}
                                actions={readOnly ? null : (
                                    <IconButton label={`Uninstall ${entry.id}`} tabIndex={-1} data-testid="row-action-uninstall" onClick={() => onUninstall(entry)}><TrashIcon /></IconButton>
                                )}
                            />
                        );
                    }}
                /> : null}
            </>
        );
    }

    const badges = (
        <>
            {result?.unsupported ? <Badge label="Unsupported" tone="warning" title={result.unsupported.message} /> : null}
            {result?.fidelity === 'provisional' ? <Badge label="provisional" tone="info" title="Versions come from the project files; a full evaluation is pending." /> : null}
        </>
    );
    const empty = result === undefined || (result.unsupported !== undefined && result.packages.length === 0);
    return (
        <section className={grouped ? 'nuiget-installed-project nuiget-installed-project--grouped' : 'nuiget-installed-project'}>
            {grouped ? (
                <SectionHeader
                    title={projectName}
                    titleId={titleId}
                    expanded={expanded}
                    onToggle={() => setExpanded(value => !value)}
                    contentId={contentId}
                    testKey={`project-${projectName.toLowerCase()}`}
                    level={level}
                    count={empty ? undefined : result.packages.length}
                    busy={revalidating}
                    actions={badges}
                />
            ) : (
                <SectionHeader
                    title={empty ? 'Direct packages' : directTitle(result.packages.length, shown?.items.length ?? 0, (filter.trim() !== '' || vulnerableOnly) && !(vulnerableOnly && metadata.size === 0))}
                    titleId={titleId}
                    expanded={expanded}
                    onToggle={() => setExpanded(value => !value)}
                    contentId={contentId}
                    testKey="direct"
                    level={2}
                    busy={revalidating}
                    actions={badges}
                />
            )}
            <div id={contentId} hidden={!expanded} className="nuiget-installed-project-content">{content}</div>
        </section>
    );
}

/**
 * The single-project header, as 1.x wrote it: `Direct packages (N)`, `(k of N)` while a filter is on. While the
 * vulnerability data is unknown `@vulnerable` counts nothing, so the header keeps `(N)`.
 */
function directTitle(total: number, shown: number, filtering: boolean): string {
    return filtering ? `Direct packages (${shown} of ${total})` : `Direct packages (${total})`;
}
