import type { AllProjectsTransitiveOrigin } from '../types';

/**
 * One project's "Required by" entry in the all-projects transitive details panel.
 * Produced by collapsing every origin that belongs to the same project into a single
 * block, so a project that pulls a package via several chains is shown once.
 */
export interface RequiredByProjectGroup {
    projectPath: string;
    projectName: string;
    /** Distinct target frameworks across the project's origins, sorted. */
    frameworks: string[];
    /** Distinct top-level root packages across the project's origins, sorted. */
    roots: string[];
}

/**
 * Group transitive-package origins by project for the "Required by" details panel.
 *
 * Origins are keyed `(projectPath, chainHash)` upstream, so a single project can appear
 * as multiple origins (different root sets per TFM). This collapses them to one block per
 * project, unioning the root sets and frameworks. A project's `roots` is empty only when
 * *every* one of its origins has no traceable top-level package (mixed-origin rule: any
 * origin with roots contributes them and suppresses the empty state).
 *
 * Pure and deterministic: groups sorted by `projectName` (case-insensitive, `projectPath`
 * tiebreak); `roots` and `frameworks` sorted. Render-time only — does not mutate origins.
 */
export function groupOriginsByProject(origins: AllProjectsTransitiveOrigin[]): RequiredByProjectGroup[] {
    const work = new Map<string, { projectName: string; roots: Set<string>; frameworks: Set<string> }>();
    const order: string[] = [];

    for (const origin of origins) {
        let entry = work.get(origin.projectPath);
        if (!entry) {
            entry = { projectName: origin.projectName, roots: new Set<string>(), frameworks: new Set<string>() };
            work.set(origin.projectPath, entry);
            order.push(origin.projectPath);
        }
        // `fullChain` carries the complete root set when there are more than 5 roots;
        // otherwise `requiredByChain` already holds them all.
        const roots = origin.fullChain && origin.fullChain.length > 0 ? origin.fullChain : origin.requiredByChain;
        for (const root of roots) { entry.roots.add(root); }
        for (const tfm of origin.frameworks) { entry.frameworks.add(tfm); }
    }

    const groups: RequiredByProjectGroup[] = order.map(projectPath => {
        const entry = work.get(projectPath);
        return {
            projectPath,
            projectName: entry ? entry.projectName : projectPath,
            roots: entry ? Array.from(entry.roots).sort((a, b) => a.localeCompare(b)) : [],
            frameworks: entry ? Array.from(entry.frameworks).sort((a, b) => a.localeCompare(b)) : [],
        };
    });

    return groups.sort((a, b) =>
        a.projectName.toLowerCase().localeCompare(b.projectName.toLowerCase())
        || a.projectPath.localeCompare(b.projectPath)
    );
}
