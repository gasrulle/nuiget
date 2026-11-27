import { useMemo } from 'react';
import type React from 'react';
import { ALL_PROJECTS } from '../../../../protocol';
import { LOADING_INSTALLED, useFirstLoadAnnouncement } from '../../../shared/firstLoad';
import { packageIconSrc } from '../../../shared/packageIcon';
import { Banner, EmptyState, Listbox, ProgressBar, Row, Skeleton } from '../../../shared/primitives';
import { useAllProjects, versionDrift, type DriftEntry } from '../../../shared/store/allProjects';
import { useDetails, useDetailsActions } from '../../../shared/store/details';
import { useOps } from '../../../shared/store/ops';
import { failure } from '../../../shared/updates/sentence';
import type { ListView } from '../../MainShell';

/** The list's keys (UX-P5.3c, design-advisor opening ruling DO 7): Enter selects; the menu is the transitive row's. */
const HINT = 'Enter shows the package and its versions in the projects. Shift+F10 opens the actions menu. Ctrl+Up (Cmd+Up) returns to the search box.';

/** The 2 px bar over the list area's top edge while the fan-out runs or runs again (DS-STATE-2), one marker for both loads. */
const bar = (label: string): React.JSX.Element => <div className="nuiget-installed-progress"><ProgressBar label={label} data-testid="consolidate-progress" /></div>;

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Every project that references the package, held references included. */
export const projectsOf = (entry: DriftEntry): string[] => [
    ...entry.versions.flatMap(at => at.projects.map(project => project.projectPath)),
    ...entry.held.map(held => held.projectPath),
];

/**
 * The Consolidate tab under All Projects (F3, G5, UX-P5.3b): a flat list of the packages the projects reference at different
 * versions, from the Consolidate model of the All Projects fan-out. A press or Enter selects a row and shows its pane, where the
 * consolidation is chosen and confirmed (UX-P5.3c); Ctrl+Enter, Delete and Space do nothing. A project that was not compared (failed, not
 * read, unsupported) is one warning banner above the list; the count of the tab does not wait for it; an incomplete comparison
 * with no drift says only the banner, never "the same versions" (empty is not unknown).
 */
export function ConsolidateTab({ announce, focusSearch }: ListView): React.JSX.Element {
    const all = useAllProjects();
    const { isPackageBusy } = useOps();
    const { selection } = useDetails();
    const { select } = useDetailsActions();
    const current = selection !== null && selection.origin === 'consolidate' ? selection.packageId : null;
    // A press or Enter selects the row and shows its pane; on the row already shown it keeps the user's choice (UX-P5.3c).
    const show = (entry: DriftEntry): void => {
        if (current !== null && current.toLowerCase() === entry.id.toLowerCase()) {
            return;
        }
        select({ packageId: entry.id, version: entry.inUse[0] ?? '', origin: 'consolidate', projectPath: null });
    };
    const { status, projects, chunks } = all;
    const drift = useMemo(() => versionDrift({ status, projects, chunks }), [status, projects, chunks]);
    const firstLoad = status === 'loading' || (status === 'idle' && all.active);
    useFirstLoadAnnouncement(announce, LOADING_INSTALLED, all.active ? ALL_PROJECTS : null, firstLoad);

    const { entries, unread, complete } = drift;
    // The fan-out failed: alone when nothing was listed, else above what was (a first load that failed after some lists, or a failed
    // refresh: the reducer keeps `ready` with the error); a new request clears it.
    const error = all.error === undefined ? null : <Banner severity="error" data-testid="consolidate-error" action={{ label: 'Retry', onClick: all.refresh }}>{failure('The installed packages', 'loaded', all.error.message)}</Banner>;
    if (status === 'error' && entries.length === 0) {
        return <div className="nuiget-installed">{error}</div>;
    }
    const ready = status === 'ready';
    const incomplete = ready && unread.length > 0;
    const loading = firstLoad || all.revalidating;
    return (
        <div className="nuiget-installed">
            {error}
            {incomplete
                ? <Banner severity="warning" data-testid="consolidate-incomplete-banner">{unread.length === 1 ? `${unread[0].projectName} was not compared.` : `${unread.length} projects were not compared.`}</Banner>
                : null}
            {/* The list is the tab's scroller; the bar lies over its top edge (DS-STATE-2). */}
            <div className="nuiget-installed-lists">
            {loading ? bar(firstLoad ? LOADING_INSTALLED : 'Refreshing installed packages') : null}
            <Listbox
                items={entries}
                label="Packages at different versions"
                hint={HINT}
                onExitUp={focusSearch}
                typeaheadLabel={entry => entry.id}
                testId="consolidate-list"
                density="comfortable"
                checkColumn="reserved"
                busy={loading && entries.length > 0}
                selectedId={current === null ? null : entries.find(entry => entry.id.toLowerCase() === current.toLowerCase())?.id ?? null}
                onSelect={show}
                onActivate={show}
                empty={firstLoad
                    ? <Skeleton density="comfortable" />
                    : ready && complete ? <EmptyState data-testid="consolidate-empty" message="All projects use the same package versions." /> : undefined}
                renderRow={(entry, placement) => {
                    const paths = projectsOf(entry);
                    const icon = paths.map(path => all.metadata.get(path)?.get(entry.id.toLowerCase())?.iconUrl).find(url => url !== undefined);
                    const src = packageIconSrc(icon);
                    return (
                        <Row
                            {...placement}
                            vscodeContext={{ webviewSection: 'transitiveRow', packageId: entry.id, projectPath: ALL_PROJECTS, 'nuiget.readOnly': true }}
                            itemId={entry.id}
                            name={entry.id}
                            version={`${plural(entry.versionCount, 'version')} in ${plural(entry.projectCount, 'project')}`}
                            icon={src === undefined ? undefined : <img src={src} alt="" />}
                            busy={paths.some(path => isPackageBusy(path, entry.id))}
                        />
                    );
                }}
            />
            </div>
        </div>
    );
}
