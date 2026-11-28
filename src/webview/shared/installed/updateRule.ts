import type { InstalledPackage, InstalledResult, PackageUpdate } from '../../../protocol';

/**
 * The update-candidate rule of a bulk update, one rule for the webviews and the host (UX-P5.7a, architecture-advisor opening
 * ruling of 2026-11-28, DO 2): protocol types only, no React and no store, so the host's palette command reads the same rule
 * as the panel's and the side bar's Update All. `rules.ts` re-exports it.
 */

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
