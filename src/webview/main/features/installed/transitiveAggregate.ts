import type { ProjectTransitiveChunk } from '../../../../protocol';

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

/** The top-level packages that bring a package in, per project in the order of its origins (roots unioned). */
export function rootsByProject(origins: readonly TransitiveOrigin[]): Array<{ projectName: string; roots: string[] }> {
    const byProject = new Map<string, string[]>();
    for (const origin of origins) {
        byProject.set(origin.projectName, [...(byProject.get(origin.projectName) ?? []), ...origin.roots]);
    }
    return [...byProject].map(([projectName, roots]) => ({ projectName, roots: [...new Set(roots)] }));
}

/** One sentence per project: which top-level packages bring it in. */
export function describeOrigins(origins: readonly TransitiveOrigin[]): string {
    return rootsByProject(origins).map(({ projectName, roots }) => (roots.length === 0
        ? `${projectName}: no traceable top-level package`
        : `${projectName}: required by ${roots.join(', ')}`)).join('; ');
}
