import { ALL_PROJECTS, type InstalledPackage, type InstalledResult, type OperationKind, type OperationProgress, type PackageDeprecation, type PackageMetadataLite, type PackageSearchResult, type PackageUpdate, type ProjectInstalledChunk, type TransitiveResult, type VulnerabilitySeverity } from '../../../protocol';
import { directCount } from '../counts';
import { busyKey, type OpsState } from '../store/ops';
import { metadataKey } from '../store/transitive';
import { isCentral, updateCandidates, whyNotUpdatable } from './updateRule';

// The update-candidate rule lives in a React-free leaf the host reads too (UX-P5.7a); its importers keep this path.
export { isCentral, updateCandidates, whyNotUpdatable };

/**
 * The rules an installed row follows on both surfaces: which version it shows, whether it can be uninstalled and
 * what it says while an operation runs on it. Lifted unchanged from `src/webview/sidebar/InstalledSection.tsx`
 * (P5.4), which re-exports them; the main panel may not import from the sidebar.
 */

/** What a busy row says is happening to its package. */
export const IN_PROGRESS: Record<OperationKind, string> = { install: 'Installing', update: 'Updating', remove: 'Uninstalling', restore: 'Restoring' };

/**
 * What the row or button of a busy package says on either surface: the kind of the operation the store reports on that
 * project and package, from the call that asked for it on (UX-P3.12b, V30); an operation without a kind yet says it is in
 * progress. It reads "Queued" while that operation is `queued` and another one runs or restores (UX-P4.7, X77; design-advisor
 * follow-up ruling of 2026-11-18): the queue runs one operation at a time and both surfaces hear every report, so on an idle
 * queue a row never reads Queued, and while another operation runs it reads Queued from the call. A queue that ever runs more
 * than one operation at a time re-rules this text and the status bar's. A package whose successful edit waits for its list
 * reads "Finishing" unless an operation is active on it (X31, UX-P4.8c); a settling package makes no other row Queued.
 */
export function busyText(ops: Pick<OpsState, 'active' | 'settling'>, projectPath: string, packageId: string): string {
    const progress = activeEntry(ops.active, projectPath, packageId);
    if (progress === undefined && ops.settling.has(busyKey(projectPath, packageId))) {
        return 'Finishing';
    }
    if (progress?.kind === undefined) {
        return 'In progress';
    }
    const waits = progress.status === 'queued' && [...ops.active.values()].some(other => other.opId !== progress.opId && (other.status === 'running' || other.status === 'restoring'));
    return waits ? 'Queued' : IN_PROGRESS[progress.kind];
}

/**
 * What `busyText` reads for that project and package: the first active operation with a kind (UX-P4.7: its button and its
 * word agree), else the package's settling entry, which keeps the kind of the edit that left it busy (X31, UX-P4.8c).
 */
export function busyEntry(ops: Pick<OpsState, 'active' | 'settling'>, projectPath: string, packageId: string): { kind?: OperationKind } | undefined {
    return activeEntry(ops.active, projectPath, packageId) ?? ops.settling.get(busyKey(projectPath, packageId));
}

function activeEntry(active: ReadonlyMap<string, OperationProgress>, projectPath: string, packageId: string): OperationProgress | undefined {
    const id = packageId.toLowerCase();
    return [...active.values()].find(progress => progress.kind !== undefined && progress.projectPaths?.includes(projectPath) && progress.packageIds?.some(other => other.toLowerCase() === id));
}

/** The rows whose id holds the filter (trimmed, any case), sorted by id, as every list on both surfaces shows them (MU9, P9.10; UX-P3.12b). */
export function filterById<T extends { id: string }>(rows: readonly T[], filter: string): T[] {
    const needle = filter.trim().toLowerCase();
    return rows.filter(row => row.id.toLowerCase().includes(needle)).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The update rows of one project as a list shows them: in arrival order while the first check streams them, so a row already
 * shown never moves under the pointer, and by id from the answer on, as every list does (X76, UX-P4.8b).
 */
export function updatesInOrder<T extends { id: string }>(rows: readonly T[], filter: string, streaming: boolean): T[] {
    if (!streaming) {
        return filterById(rows, filter);
    }
    const needle = filter.trim().toLowerCase();
    return rows.filter(row => row.id.toLowerCase().includes(needle));
}

/** The version a row shows: what the project resolves to where the declaration is a pattern, else what it declares. */
export function shownVersion(entry: InstalledPackage): string {
    if (entry.declaration === 'unresolved' || entry.versionType === 'unresolved') {
        return 'unresolved';
    }
    const pattern = entry.versionType === 'floating' || entry.versionType === 'range';
    return (pattern ? entry.resolvedVersion : undefined) ?? entry.version;
}

/**
 * The version cell of a main-panel row: a floating or ranged declaration shows its pattern with the version it
 * resolves to (`10.* (10.2.0)`, or `(run restore)` before a restore), a wildcard says it is always the latest. The
 * sidebar keeps `shownVersion`.
 */
export function versionCell(entry: InstalledPackage): { text: string; title?: string } {
    if (entry.declaration === 'unresolved' || entry.versionType === 'unresolved') {
        return { text: 'unresolved', title: UNRESOLVED_HINT };
    }
    if (entry.isAlwaysLatest) {
        return { text: `* (always latest${entry.resolvedVersion ? `: ${entry.resolvedVersion}` : ''})`, title: 'Always the latest version' };
    }
    if (entry.versionType === 'floating' || entry.versionType === 'range') {
        return { text: `${entry.version} (${entry.resolvedVersion ?? 'run restore'})`, title: entry.versionType === 'floating' ? 'Floating version pattern' : 'Version range' };
    }
    return { text: entry.version };
}

/**
 * Why a package cannot be uninstalled from this list, in a sentence for the user; `undefined` when it can. A centrally
 * managed package can: an uninstall removes the project's reference only and keeps the central entry (ADR-004).
 */
export function whyNotRemovable(entry: InstalledPackage, result: InstalledResult): string | undefined {
    if (result.unsupported) {
        return `${entry.id} cannot be uninstalled: ${result.unsupported.message}`;
    }
    if (entry.declaration === 'unresolved') {
        return `${entry.id} cannot be uninstalled: its reference could not be resolved`;
    }
    if (entry.isImplicit) {
        return `${entry.id} is added by the .NET SDK and cannot be uninstalled`;
    }
    if (entry.declaration === 'props') {
        return `${entry.id} is declared in an imported props file and cannot be uninstalled from the project`;
    }
    return undefined;
}

/**
 * Why the Delete key cannot uninstall an update row's package, in the sentence the menu's rule reads (`updateRowContext`):
 * the installed entry's `whyNotRemovable`, or, with no entry, an unsupported project's reason; `undefined` when it can
 * (UX-P4.2a).
 */
export function whyNotDeletable(packageId: string, entry: InstalledPackage | undefined, result: InstalledResult | undefined): string | undefined {
    if (entry !== undefined && result !== undefined) {
        return whyNotRemovable(entry, result);
    }
    return result?.unsupported === undefined ? undefined : `${packageId} cannot be uninstalled: ${result.unsupported.message}`;
}

/** A project's name as the lists show it: the listed name, else the file name without its extension. */
export const projectNameOf = (projects: ReadonlyArray<{ name: string; path: string }> | undefined, projectPath: string): string =>
    projects?.find(project => project.path === projectPath)?.name ?? projectPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? projectPath;

/** The tooltip of an unresolved version cell (interaction model §4). */
export const UNRESOLVED_HINT = 'Its version could not be resolved from the project files; edit the project file by hand.';

/** An update row's context for the actions menu (ADR-013 Decision 4): its project, versions and what the `when` clauses read. */
export const updateRowContext = (update: PackageUpdate, projectPath: string, entry: InstalledPackage | undefined, installed: InstalledResult | undefined): Readonly<Record<string, unknown>> => ({
    webviewSection: 'updateRow',
    packageId: update.id,
    projectPath,
    installedVersion: update.installedVersion,
    latestVersion: update.latestVersion,
    versionType: entry?.versionType,
    sourceUrl: update.sourceUrl,
    'nuiget.floating': entry?.versionType === 'floating' || entry?.versionType === 'range',
    'nuiget.central': entry?.declaration === 'central' || entry?.declaration === 'central-override',
    'nuiget.readOnly': installed?.unsupported !== undefined || (entry !== undefined && installed !== undefined && whyNotUpdatable(entry, installed) !== undefined),
});

/** Where each package is installed, by lower-cased id, from the All Projects chunks. */
export function installedProjectsOf(chunks: Iterable<ProjectInstalledChunk>): ReadonlyMap<string, Array<{ projectPath: string; projectName: string; version: string }>> {
    const byId = new Map<string, Array<{ projectPath: string; projectName: string; version: string }>>();
    for (const chunk of chunks) {
        for (const entry of chunk.result?.packages ?? []) {
            const id = entry.id.toLowerCase();
            byId.set(id, [...(byId.get(id) ?? []), { projectPath: chunk.projectPath, projectName: chunk.projectName, version: entry.resolvedVersion ?? entry.version }]);
        }
    }
    return byId;
}

/** A Browse row's context under All Projects: the host's picker reads where the package is installed. */
export const allProjectsBrowseContext = (result: PackageSearchResult, where: ReadonlyArray<{ projectPath: string; projectName: string; version: string }>, listedCount: number): Readonly<Record<string, unknown>> => ({
    webviewSection: 'browseRow',
    packageId: result.id,
    projectPath: ALL_PROJECTS,
    latestVersion: result.version,
    sourceUrl: result.sourceUrl,
    installedProjects: where,
    installedVersion: where[0]?.version,
    partiallyInstalled: where.length > 0 && where.length < listedCount,
    'nuiget.installed': where.length > 0,
    'nuiget.partial': where.length > 0 && where.length < listedCount,
});

/**
 * A Browse row's context in one project. `readOnly` is true when the project's entry for the id cannot be removed
 * (`whyNotRemovable`: SDK-implicit, from props, unresolved, an unsupported project): the menu's Uninstall and Change
 * Version hide, and the host refuses them (UX-P4.1, from UX-P2.9a's review).
 */
export const browseRowContext = (result: PackageSearchResult, projectPath: string, installedVersion: string | undefined, readOnly = false): Readonly<Record<string, unknown>> => ({
    webviewSection: 'browseRow',
    packageId: result.id,
    projectPath,
    installedVersion,
    latestVersion: result.version,
    sourceUrl: result.sourceUrl,
    'nuiget.installed': installedVersion !== undefined,
    'nuiget.readOnly': readOnly,
});

/**
 * A group row's count in the Installed tree (DS-COPY-5, UX-P5.1a): `k of N` while the id filter is on (`idFiltering`, for
 * the groups that read it), and under `@vulnerable` once the view has first `settled`, whatever is unknown: the banner
 * alone says that. Before the first settle under `@vulnerable` the count is the total.
 */
export function groupCount(total: number, shown: number, idFiltering: boolean, vulnerableOnly: boolean, settled: boolean): number | string {
    return directCount(total, shown, vulnerableOnly ? settled : idFiltering);
}

/**
 * What the lite metadata says about a row's vulnerabilities (UX-P5.1a, D38): `vulnerable` with one or more advisories,
 * `clear` with an empty list, `unknown` without an entry or without the field (no data, a partial read, the bound, a
 * failed ask). The one predicate of both surfaces; never a second copy in a feature.
 */
export type VulnerabilityKnowledge = 'vulnerable' | 'clear' | 'unknown';

export function vulnerabilityOf(lite: PackageMetadataLite | undefined): VulnerabilityKnowledge {
    const advisories = lite?.vulnerabilities;
    if (advisories === undefined) {
        return 'unknown';
    }
    return advisories.length > 0 ? 'vulnerable' : 'clear';
}

/** The severities from the lowest, so a later one is higher. */
const SEVERITY_ORDER: readonly VulnerabilitySeverity[] = ['Low', 'Moderate', 'High', 'Critical'];

/** The problems colour of each severity (UX-P5.1b): Critical and High are errors, Moderate a warning, Low information. */
const SEVERITY_LEVEL: Record<VulnerabilitySeverity, 'error' | 'warning' | 'info'> = { Critical: 'error', High: 'error', Moderate: 'warning', Low: 'info' };

/**
 * What a vulnerable row's badge says (UX-P5.1b, MI7, DP8): the highest severity of its advisories, how many there are and
 * the problems level of that severity; undefined unless `vulnerabilityOf` says vulnerable. The one mapping of both rows.
 */
export function vulnerabilitySeverity(lite: PackageMetadataLite | undefined): { highest: VulnerabilitySeverity; count: number; level: 'error' | 'warning' | 'info' } | undefined {
    const advisories = lite?.vulnerabilities;
    if (vulnerabilityOf(lite) !== 'vulnerable' || advisories === undefined) {
        return undefined;
    }
    const highest = advisories.reduce<VulnerabilitySeverity>((top, advisory) => (SEVERITY_ORDER.indexOf(advisory.severity) > SEVERITY_ORDER.indexOf(top) ? advisory.severity : top), 'Low');
    return { highest, count: advisories.length, level: SEVERITY_LEVEL[highest] };
}

/** The problems level of one severity (UX-P5.2b): the glyph and colour role of an advisory line, as of the row badge. */
export const severityLevel = (severity: VulnerabilitySeverity): 'error' | 'warning' | 'info' => SEVERITY_LEVEL[severity];

/** The clause of each known deprecation reason, matched case-insensitively; any other word reads as Other (UX-P5.2b). */
const DEPRECATION_CLAUSE: Record<string, string> = { legacy: 'it is legacy and no longer maintained', criticalbugs: 'it has critical bugs' };

/**
 * What a deprecation says (UX-P5.2b, design-advisor opening ruling of 2026-11-27, DO 2): "This version is deprecated" with the
 * known reasons as clauses (Legacy, then CriticalBugs), and "Use <id> instead." when the source names an alternate package; its
 * range is not shown. Other or unknown reason words add no clause. The one mapping of the badge and the details notice.
 */
export function deprecationSentence(deprecation: PackageDeprecation): string {
    const words = new Set(deprecation.reasons.map(reason => reason.toLowerCase()));
    const clauses = ['legacy', 'criticalbugs'].filter(word => words.has(word)).map(word => DEPRECATION_CLAUSE[word]);
    const first = clauses.length === 0 ? 'This version is deprecated.' : `This version is deprecated: ${clauses.length === 2 ? `${clauses[0]}, and ${clauses[1]}` : clauses[0]}.`;
    return deprecation.alternatePackage ? `${first} Use ${deprecation.alternatePackage.id} instead.` : first;
}

/**
 * An Updates row's lite entry, only when it describes the row's installed version (UX-P5.2b, architecture ruling DO 9): the lite
 * entry is asked at the resolved version, the row's at the effective one; when they differ, nothing is known about the row.
 */
export const liteOfInstalled = (lite: PackageMetadataLite | undefined, update: Pick<PackageUpdate, 'installedVersion'>): PackageMetadataLite | undefined =>
    lite !== undefined && lite.version === update.installedVersion ? lite : undefined;

/** A direct row's knowledge, by its lower-cased id in the installed slice's map. */
export const directVulnerability = (metadata: ReadonlyMap<string, PackageMetadataLite>, id: string): VulnerabilityKnowledge =>
    vulnerabilityOf(metadata.get(id.toLowerCase()));

/**
 * The transitive rows `@vulnerable` would show and whether any part is unknown (UX-P5.1a): a package under two frameworks
 * is two rows; an unusable list (not restored, `errorKind`) or no list is all unknown.
 */
export function transitiveVulnerability(result: TransitiveResult | undefined, metadata: ReadonlyMap<string, PackageMetadataLite>): { vulnerable: number; unknown: boolean } {
    if (result === undefined || !result.dataSourceAvailable || result.errorKind !== undefined) {
        return { vulnerable: 0, unknown: true };
    }
    let vulnerable = 0;
    let unknown = false;
    for (const framework of result.frameworks) {
        for (const entry of framework.packages) {
            const known = vulnerabilityOf(metadata.get(metadataKey(entry.id, entry.version)));
            vulnerable += known === 'vulnerable' ? 1 : 0;
            unknown = unknown || known === 'unknown';
        }
    }
    return { vulnerable, unknown };
}
