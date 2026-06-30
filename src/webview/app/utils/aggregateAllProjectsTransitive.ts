import type { AllProjectsTransitiveOrigin, AllProjectsTransitiveRow, TransitiveFrameworkSection } from '../types';

/**
 * Per-project slot tracked while the backend streams `allProjectsTransitive*` chunks.
 *
 * `received=false` slots are placeholders inserted on `allProjectsTransitiveStart`. They
 * are excluded from both row aggregation (no frameworks yet) and the "Restore"/error
 * banner — otherwise in-flight projects look like errors during streaming.
 */
export interface ProjectTransitiveSlot {
    projectName: string;
    workspaceFolder?: string;
    frameworks: TransitiveFrameworkSection[];
    dataSourceAvailable: boolean;
    errorKind?: 'parse-failed' | 'fs-error' | 'unknown';
    received?: boolean;
}

export interface ErroredTransitiveProject {
    projectPath: string;
    projectName: string;
    errorKind?: string;
    missing?: boolean;
}

/**
 * Dedupe transitive packages across all projects by `(lowerId, normalizedVersion)`.
 *
 * - `versionNormalized = (pkg.version ?? '').trim().toLowerCase()` — matches backend echo behavior.
 * - Each row collects per-project origins keyed by `(projectPath, chainHash)` where
 *   `chainHash = (pkg.fullChain ?? pkg.requiredByChain).join('→')` — the FULL root set, so
 *   origins differing only beyond the 5-item display slice don't collide.
 * - Frameworks are merged per-origin and per-row (deduped, insertion order preserved).
 * - Sorted alphabetically by `id` (case-insensitive). Stable across stream chunks since
 *   the same input slot map produces the same output.
 *
 * Slots with `dataSourceAvailable=false` are skipped — those surface in
 * {@link selectErroredTransitiveProjects} as restore candidates instead.
 */
export function aggregateAllProjectsTransitive(
    slots: Record<string, ProjectTransitiveSlot>
): AllProjectsTransitiveRow[] {
    const rowMap = new Map<string, AllProjectsTransitiveRow>();
    for (const [projectPath, slot] of Object.entries(slots)) {
        if (!slot.dataSourceAvailable) { continue; }
        for (const fwSection of slot.frameworks) {
            for (const pkg of fwSection.packages) {
                const lowerId = pkg.id.toLowerCase();
                const versionNorm = (pkg.version ?? '').trim().toLowerCase();
                const rowKey = `${lowerId}@${versionNorm}`;
                let row = rowMap.get(rowKey);
                if (!row) {
                    row = {
                        id: pkg.id,
                        version: pkg.version,
                        versionNormalized: versionNorm,
                        iconUrl: pkg.iconUrl,
                        verified: pkg.verified,
                        authors: pkg.authors,
                        origins: [],
                        frameworks: [],
                    };
                    rowMap.set(rowKey, row);
                } else {
                    if (!row.iconUrl && pkg.iconUrl) { row.iconUrl = pkg.iconUrl; }
                    if (row.verified === undefined && pkg.verified !== undefined) { row.verified = pkg.verified; }
                    if (!row.authors && pkg.authors) { row.authors = pkg.authors; }
                }
                // Identity uses the FULL root set (not the 5-item display slice) so two
                // origins that differ only beyond the first 5 roots don't collide/merge.
                const rootsForKey = pkg.fullChain && pkg.fullChain.length > 0 ? pkg.fullChain : (pkg.requiredByChain || []);
                const chainHash = rootsForKey.join('→');
                let origin: AllProjectsTransitiveOrigin | undefined = row.origins.find(
                    o => o.projectPath === projectPath && o.chainHash === chainHash
                );
                if (!origin) {
                    origin = {
                        projectPath,
                        projectName: slot.projectName,
                        workspaceFolder: slot.workspaceFolder,
                        frameworks: [],
                        requiredByChain: pkg.requiredByChain || [],
                        fullChain: pkg.fullChain,
                        chainHash,
                    };
                    row.origins.push(origin);
                }
                if (!origin.frameworks.includes(fwSection.targetFramework)) {
                    origin.frameworks.push(fwSection.targetFramework);
                }
                if (!row.frameworks.includes(fwSection.targetFramework)) {
                    row.frameworks.push(fwSection.targetFramework);
                }
            }
        }
    }
    return Array.from(rowMap.values()).sort((a, b) => a.id.toLowerCase().localeCompare(b.id.toLowerCase()));
}

/**
 * Errored/missing-data projects derived from slots — surfaces "Restore" banner candidates.
 *
 * Only counts slots that have actually `received` a chunk from the backend. In-flight
 * placeholders (`received=false`) are ignored to avoid false positives during streaming.
 */
export function selectErroredTransitiveProjects(
    slots: Record<string, ProjectTransitiveSlot>
): ErroredTransitiveProject[] {
    const out: ErroredTransitiveProject[] = [];
    for (const [projectPath, slot] of Object.entries(slots)) {
        if (!slot.received) { continue; }
        if (!slot.dataSourceAvailable) {
            out.push({ projectPath, projectName: slot.projectName, missing: true });
        } else if (slot.errorKind) {
            out.push({ projectPath, projectName: slot.projectName, errorKind: slot.errorKind });
        }
    }
    return out;
}
