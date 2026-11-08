import { ALL_PROJECTS, type InstalledPackage, type InstalledResult, type OperationKind, type PackageSearchResult, type PackageUpdate, type ProjectInstalledChunk } from '../../../protocol';

/**
 * The rules an installed row follows on both surfaces: which version it shows, whether it can be uninstalled and
 * what it says while an operation runs on it. Lifted unchanged from `src/webview/sidebar/InstalledSection.tsx`
 * (P5.4), which re-exports them; the main panel may not import from the sidebar.
 */

/** What a busy row says is happening to its package. */
export const IN_PROGRESS: Record<OperationKind, string> = { install: 'Installing', update: 'Updating', remove: 'Uninstalling', restore: 'Restoring' };

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
 * Why a package cannot be updated from this list, in a sentence for the user; `undefined` when it can. A row with a
 * `VersionOverride` updates in its project alone (`dotnet package add --version` rewrites the override and leaves the
 * central entry; probe row `add-override`, N74).
 */
export function whyNotUpdatable(entry: InstalledPackage, result: InstalledResult): string | undefined {
    if (result.unsupported) {
        return `${entry.id} cannot be updated: ${result.unsupported.message}`;
    }
    if (entry.declaration === 'unresolved') {
        return `${entry.id} cannot be updated: its reference could not be resolved`;
    }
    return undefined;
}

/** A row whose version comes from the central entry: its update changes every project that uses the entry. */
export const isCentral = (entry: InstalledPackage): boolean => entry.declaration === 'central';

/**
 * The updates a bulk update takes, on both surfaces (UX-P3.7d): the package is installed in the project and can be updated
 * there (a supported project, a resolved reference), its version is not set centrally (a `central` row goes through its
 * preview, N76; a `central-override` row joins, N74) and it is not busy. The subset keeps the order of `rows`: the callers
 * filter and sort.
 */
export function updateCandidates(rows: readonly PackageUpdate[], installed: InstalledResult | undefined, isBusy: (id: string) => boolean): PackageUpdate[] {
    if (installed === undefined) {
        return [];
    }
    return rows.filter(row => {
        const entry = installed.packages.find(candidate => candidate.id.toLowerCase() === row.id.toLowerCase());
        return entry !== undefined && whyNotUpdatable(entry, installed) === undefined && !isCentral(entry) && !isBusy(row.id);
    });
}

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

/** A Browse row's context in one project. */
export const browseRowContext = (result: PackageSearchResult, projectPath: string, installedVersion: string | undefined): Readonly<Record<string, unknown>> => ({
    webviewSection: 'browseRow',
    packageId: result.id,
    projectPath,
    installedVersion,
    latestVersion: result.version,
    sourceUrl: result.sourceUrl,
    'nuiget.installed': installedVersion !== undefined,
});
