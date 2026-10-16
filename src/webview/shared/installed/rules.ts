import type { InstalledPackage, InstalledResult, OperationKind } from '../../../protocol';

/**
 * The rules an installed row follows on both surfaces: which version it shows, whether it can be uninstalled and
 * what it says while an operation runs on it. Lifted unchanged from `src/webview/sidebar-next/InstalledSection.tsx`
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

/** The tooltip of an unresolved version cell (interaction model §4). */
export const UNRESOLVED_HINT = 'Its version could not be resolved from the project files; edit the project file by hand.';
