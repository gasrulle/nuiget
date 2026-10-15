import { useId, useMemo, useState } from 'react';
import type React from 'react';
import type { ProjectTransitiveChunk } from '../../../../protocol';
import { Banner, EmptyState, Listbox, Row, SectionHeader, Skeleton } from '../../../shared/primitives';
import { useAllProjects } from '../../../shared/store/allProjects';
import { useOpsActions } from '../../../shared/store/ops';

/** Where an aggregated transitive package comes from: one project and one set of top-level roots. */
export interface TransitiveOrigin {
    projectPath: string;
    projectName: string;
    /** The target frameworks of the project in which the package has these roots. */
    frameworks: string[];
    /** The full set of top-level packages that require it; empty when none can be traced. */
    roots: string[];
}

export interface AggregatedTransitive {
    id: string;
    version: string;
    origins: TransitiveOrigin[];
}

/**
 * One row per package and version over every project (1.x's aggregation): keyed by the lower-cased id and the version,
 * with one origin per project and full root set; frameworks that share a root set merge into one origin.
 */
export function aggregateTransitive(chunks: Iterable<ProjectTransitiveChunk>): AggregatedTransitive[] {
    const rows = new Map<string, AggregatedTransitive>();
    for (const chunk of chunks) {
        for (const framework of chunk.frameworks) {
            for (const entry of framework.packages) {
                const key = `${entry.id.toLowerCase()}@${entry.version}`;
                const row = rows.get(key) ?? { id: entry.id, version: entry.version, origins: [] };
                rows.set(key, row);
                const roots = [...new Set(entry.fullChain ?? entry.requiredByChain)].sort();
                const rootKey = roots.join('\n');
                const origin = row.origins.find(candidate => candidate.projectPath === chunk.projectPath && candidate.roots.join('\n') === rootKey);
                if (origin === undefined) {
                    row.origins.push({ projectPath: chunk.projectPath, projectName: chunk.projectName, frameworks: [framework.targetFramework], roots });
                } else if (!origin.frameworks.includes(framework.targetFramework)) {
                    origin.frameworks.push(framework.targetFramework);
                }
            }
        }
    }
    return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id, 'en') || a.version.localeCompare(b.version, 'en'));
}

/** One sentence per project: which top-level packages bring it in. */
export function describeOrigins(origins: readonly TransitiveOrigin[]): string {
    const byProject = new Map<string, string[]>();
    for (const origin of origins) {
        byProject.set(origin.projectName, [...(byProject.get(origin.projectName) ?? []), ...origin.roots]);
    }
    return [...byProject].map(([project, roots]) => {
        const unique = [...new Set(roots)];
        return unique.length === 0 ? `${project}: no traceable top-level package` : `${project}: required by ${unique.join(', ')}`;
    }).join('; ');
}

interface Item {
    id: string;
    row: AggregatedTransitive;
}

/**
 * The transitive packages of every project in All Projects, aggregated into one section (interaction model §3). It is
 * closed until opened; opening it asks the stream, which then stays asked while All Projects is committed (closing
 * keeps what was listed). Projects without a restored assets file are named in a banner with Restore.
 */
export function AllProjectsTransitiveSection(): React.JSX.Element {
    const all = useAllProjects();
    const { run } = useOpsActions();
    const [open, setOpen] = useState(false);
    const baseId = useId();
    const titleId = `${baseId}-title`;
    const contentId = `${baseId}-content`;
    const { transitive } = all;
    const expanded = open && transitive.enabled;
    const chunks = [...transitive.chunks.values()];
    const items = useMemo<Item[]>(
        () => aggregateTransitive(transitive.chunks.values()).map(row => ({ id: `${row.id}@${row.version}`, row })),
        [transitive.chunks],
    );
    const unrestored = chunks.filter(chunk => !chunk.dataSourceAvailable);

    const toggle = (): void => {
        if (!expanded) {
            all.enableTransitive();
        }
        setOpen(!expanded);
    };

    let content: React.ReactNode = null;
    if (expanded) {
        if (transitive.status === 'loading' && chunks.length === 0) {
            content = <Skeleton density="compact" />;
        } else if (transitive.status === 'error' && chunks.length === 0) {
            content = <Banner severity="error" action={{ label: 'Retry', onClick: transitive.refresh }}>{`The transitive packages could not be listed: ${transitive.error?.message ?? 'unknown error'}`}</Banner>;
        } else {
            content = (
                <>
                    {unrestored.length > 0 ? (
                        <Banner severity="warning" data-testid="transitive-restore-banner" action={{ label: 'Restore', onClick: () => { run('ops/restore', { projectPaths: unrestored.map(chunk => chunk.projectPath) }).catch(() => undefined); } }}>
                            {`Not restored, so their transitive packages are not known: ${unrestored.map(chunk => chunk.projectName).join(', ')}.`}
                        </Banner>
                    ) : null}
                    {transitive.errored.length > 0 ? (
                        <Banner severity="error" action={{ label: 'Retry', onClick: transitive.refresh }}>
                            {`The assets files of ${transitive.errored.length} ${transitive.errored.length === 1 ? 'project' : 'projects'} could not be read.`}
                        </Banner>
                    ) : null}
                    <Listbox<Item>
                        items={items}
                        label="Transitive packages of all projects"
                        hint="Arrow keys move between the packages."
                        testId="transitive-list"
                        density="compact"
                        busy={transitive.status === 'loading'}
                        empty={<EmptyState message="No transitive dependencies." />}
                        renderRow={(item, placement) => (
                            <Row
                                {...placement}
                                itemId={item.row.id}
                                name={item.row.id}
                                version={item.row.version}
                                density="compact"
                                description={describeOrigins(item.row.origins)}
                            />
                        )}
                    />
                </>
            );
        }
    }

    return (
        <section className="nuiget-transitive" data-testid="transitive-section">
            <SectionHeader
                title="Transitive packages"
                titleId={titleId}
                expanded={expanded}
                onToggle={toggle}
                contentId={contentId}
                testKey="transitive"
                busy={expanded && transitive.status === 'loading'}
            />
            <div id={contentId} hidden={!expanded} className="nuiget-transitive-content">{content}</div>
        </section>
    );
}
