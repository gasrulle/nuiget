import type React from 'react';
import { Badge, Banner, EmptyState, ProgressBar, SectionHeader, Skeleton, type GroupPlacement } from '../../../shared/primitives';
import { groupCount, vulnerabilityOf } from '../../../shared/installed/rules';
import type { AllProjectsState } from '../../../shared/store/allProjects';
import { metadataKey } from '../../../shared/store/transitive';
import { rowId, type TreeItem } from './installedTree';
import { aggregateTransitive, describeOrigins, type AggregatedTransitive } from './transitiveAggregate';
import { failure } from '../../../shared/updates/sentence';

type GroupItem = Extract<TreeItem, { kind: 'group' }>;

/**
 * The aggregate's vulnerability knowledge under All Projects (UX-P5.1a): its rows as the section lists them, how many are
 * known vulnerable (a transitive package in three projects is one row), whether a row is unknown, and whether a part of the
 * transitive data is unknown (no answer yet, a stream error, an `errored` project, a chunk not restored or with an
 * `errorKind`).
 */
export function aggregateVulnerability(transitive: AllProjectsState['transitive']): { rows: AggregatedTransitive[]; vulnerable: number; rowUnknown: boolean; unknown: boolean } {
    const rows = aggregateTransitive(transitive.chunks.values());
    const known = rows.map(row => vulnerabilityOf(transitive.metadata.get(metadataKey(row.id, row.version))));
    const rowUnknown = known.some(state => state === 'unknown');
    const partUnknown = transitive.status !== 'ready' || transitive.error !== undefined || transitive.errored.length > 0
        || [...transitive.chunks.values()].some(chunk => !chunk.dataSourceAvailable || chunk.errorKind !== undefined);
    return { rows, vulnerable: known.filter(state => state === 'vulnerable').length, rowUnknown, unknown: rowUnknown || partUnknown };
}

/**
 * The transitive packages of every project in All Projects, aggregated under one group row (interaction model §3). The
 * main panel asks the stream once the projects' lists answered, without a click (the side bar only when the group is
 * opened), and it stays asked while All Projects is committed (closing keeps what was listed). Projects without a restored assets file are named in a banner with Restore, above the tree; while a
 * restore of one of them is queued or running (`restoring`) a bar says so (UX-P4.fix-10). A
 * row shows how many projects have it (the origins are its description through that badge) and opens a read-only details
 * view with one block per project. Once the stream has answered the group row shows the aggregate's row count; under
 * `@vulnerable` (`vulnerableOnly`) only the rows known vulnerable are listed and, once the view has first `settled`, the count
 * reads `k of N` whatever is unknown: the banner alone says that (UX-P5.1a).
 */
export function allProjectsTransitiveTree(all: AllProjectsState, expanded: boolean, restore: (projectPaths: string[]) => void, restoring: boolean, vulnerableOnly = false, settled = false): { items: TreeItem[]; message: React.ReactNode } {
    const { transitive } = all;
    const knowledge = aggregateVulnerability(transitive);
    const listed = vulnerableOnly ? knowledge.rows.filter(row => vulnerabilityOf(transitive.metadata.get(metadataKey(row.id, row.version))) === 'vulnerable') : knowledge.rows;
    const count = transitive.status === 'ready' ? groupCount(knowledge.rows.length, listed.length, false, vulnerableOnly, settled) : undefined;
    const items: TreeItem[] = [{ kind: 'group', id: 'transitive', level: 1, title: 'Transitive Packages', count, variant: 'group' }];
    if (!expanded) {
        return { items, message: null };
    }
    const chunks = [...transitive.chunks.values()];
    if (transitive.status === 'loading' && chunks.length === 0) {
        return { items, message: <><ProgressBar label="Loading transitive packages" data-testid="transitive-progress" /><Skeleton density="comfortable" /></> };
    }
    if (transitive.status === 'error' && chunks.length === 0) {
        return { items, message: <Banner severity="error" data-testid="transitive-error" action={{ label: 'Retry', onClick: transitive.refresh }}>{failure('The transitive packages', 'listed', transitive.error?.message)}</Banner> };
    }
    const rows = knowledge.rows;
    for (const row of listed) {
        const key = metadataKey(row.id, row.version);
        const projects = new Set(row.origins.map(origin => origin.projectPath)).size;
        items.push({
            kind: 'transitive',
            id: rowId('transitive:*', key),
            scope: { projectPath: null },
            entry: { id: row.id, version: row.version },
            key,
            badges: <Badge label={`${projects} ${projects === 1 ? 'project' : 'projects'}`} title={describeOrigins(row.origins)} />,
        });
    }
    const unrestored = chunks.filter(chunk => !chunk.dataSourceAvailable);
    return {
        items,
        message: (
            <>
                {restoring ? <ProgressBar label="Restoring projects" data-testid="transitive-progress" /> : null}
                {unrestored.length > 0 ? (
                    <Banner severity="warning" data-testid="transitive-restore-banner" action={{ label: 'Restore', onClick: () => restore(unrestored.map(chunk => chunk.projectPath)) }}>
                        {/* The projects are the sentence's subject, then their names (DS-COPY-3, UX-P5.fix-4); one project reads as the single view's. */}
                        {`${unrestored.length === 1 ? 'This project has' : 'These projects have'} not been restored, so ${unrestored.length === 1 ? 'its' : 'their'} transitive packages are not known: ${unrestored.map(chunk => chunk.projectName).join(', ')}.`}
                    </Banner>
                ) : null}
                {transitive.errored.length > 0 ? (
                    <Banner severity="error" action={{ label: 'Retry', onClick: transitive.refresh }}>
                        {`The assets files of ${transitive.errored.length} ${transitive.errored.length === 1 ? 'project' : 'projects'} could not be read.`}
                    </Banner>
                ) : null}
                {rows.length === 0 ? <EmptyState message="No transitive dependencies." data-testid="transitive-empty" /> : null}
            </>
        ),
    };
}

/** The content of the aggregate's group row. */
export function allProjectsTransitiveGroupContent(item: GroupItem, placement: GroupPlacement, all: AllProjectsState, restoring: boolean): React.JSX.Element {
    return <SectionHeader presentation="content" title={item.title} testKey={item.id} expanded={placement.expanded} variant="group" count={item.count} busy={restoring || (placement.expanded && all.transitive.status === 'loading')} />;
}
