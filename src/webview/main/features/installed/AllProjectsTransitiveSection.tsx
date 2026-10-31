import type React from 'react';
import { Badge, Banner, EmptyState, SectionHeader, Skeleton, type GroupPlacement } from '../../../shared/primitives';
import type { AllProjectsState } from '../../../shared/store/allProjects';
import { metadataKey } from '../../../shared/store/transitive';
import { rowId, type TreeItem } from './installedTree';
import { aggregateTransitive, describeOrigins } from './transitiveAggregate';

type GroupItem = Extract<TreeItem, { kind: 'group' }>;

/**
 * The transitive packages of every project in All Projects, aggregated under one group row (interaction model §3). It is
 * closed until opened; opening it asks the stream, which then stays asked while All Projects is committed (closing
 * keeps what was listed). Projects without a restored assets file are named in a banner with Restore, above the tree. A
 * row shows how many projects have it (the origins are its description through that badge) and opens a read-only details
 * view with one block per project.
 */
export function allProjectsTransitiveTree(all: AllProjectsState, expanded: boolean, restore: (projectPaths: string[]) => void): { items: TreeItem[]; message: React.ReactNode } {
    const { transitive } = all;
    const items: TreeItem[] = [{ kind: 'group', id: 'transitive', level: 1, title: 'Transitive packages', variant: 'group' }];
    if (!expanded) {
        return { items, message: null };
    }
    const chunks = [...transitive.chunks.values()];
    if (transitive.status === 'loading' && chunks.length === 0) {
        return { items, message: <Skeleton density="comfortable" /> };
    }
    if (transitive.status === 'error' && chunks.length === 0) {
        return { items, message: <Banner severity="error" action={{ label: 'Retry', onClick: transitive.refresh }}>{`The transitive packages could not be listed: ${transitive.error?.message ?? 'unknown error'}`}</Banner> };
    }
    const rows = aggregateTransitive(transitive.chunks.values());
    for (const row of rows) {
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
                {unrestored.length > 0 ? (
                    <Banner severity="warning" data-testid="transitive-restore-banner" action={{ label: 'Restore', onClick: () => restore(unrestored.map(chunk => chunk.projectPath)) }}>
                        {`Not restored, so their transitive packages are not known: ${unrestored.map(chunk => chunk.projectName).join(', ')}.`}
                    </Banner>
                ) : null}
                {transitive.errored.length > 0 ? (
                    <Banner severity="error" action={{ label: 'Retry', onClick: transitive.refresh }}>
                        {`The assets files of ${transitive.errored.length} ${transitive.errored.length === 1 ? 'project' : 'projects'} could not be read.`}
                    </Banner>
                ) : null}
                {rows.length === 0 ? <EmptyState message="No transitive dependencies." /> : null}
            </>
        ),
    };
}

/** The content of the aggregate's group row. */
export function allProjectsTransitiveGroupContent(item: GroupItem, placement: GroupPlacement, all: AllProjectsState): React.JSX.Element {
    return <SectionHeader presentation="content" title={item.title} testKey={item.id} expanded={placement.expanded} variant="group" busy={placement.expanded && all.transitive.status === 'loading'} />;
}
