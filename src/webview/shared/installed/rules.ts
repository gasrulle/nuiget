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
 * Why a package cannot be uninstalled from this list, in a sentence for the user; `undefined` when it can.
 * A centrally managed package stays read-only until the preview of what a central change touches exists.
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
    if (entry.declaration === 'central' || entry.declaration === 'central-override') {
        return `${entry.id} is managed centrally and cannot be uninstalled from this view yet`;
    }
    return undefined;
}
