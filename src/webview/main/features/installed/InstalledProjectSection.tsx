import type React from 'react';
import type { InstalledPackage, InstalledResult, PackageMetadataLite } from '../../../../protocol';
import { busyText, directVulnerability, filterById, versionCell, whyNotRemovable } from '../../../shared/installed/rules';
import { packageIconSrc } from '../../../shared/packageIcon';
import { Badge, IconButton, Row, TrashIcon, type RowPlacement } from '../../../shared/primitives';
import { useOps } from '../../../shared/store/ops';

/** A package as a project's rows hold it. */
export interface Item {
    id: string;
    entry: InstalledPackage;
}

/**
 * The rows a filter leaves, sorted by id as the sidebar's `visiblePackages` (P9.10, UX-P3.fix-1), what to say when it leaves
 * none, and whether a row the id filter keeps has unknown vulnerability data (UX-P5.1a). Under `@vulnerable` only the rows
 * known vulnerable stay; while the metadata ask has not `settled` and none is known vulnerable, the data is not available yet
 * (empty is not unknown). `settled` defaults to "some metadata answered", the rule of a caller that has no settled signal.
 */
export function visibleRows(result: InstalledResult, metadata: ReadonlyMap<string, PackageMetadataLite>, filter: string, vulnerableOnly: boolean, settled = metadata.size > 0): { items: Item[]; empty: string; unknown: boolean } {
    let entries = filterById(result.packages, filter);
    const unknown = entries.some(entry => directVulnerability(metadata, entry.id) === 'unknown');
    if (vulnerableOnly) {
        entries = entries.filter(entry => directVulnerability(metadata, entry.id) === 'vulnerable');
        if (entries.length === 0 && !settled) {
            return { items: [], empty: 'Vulnerability data is not available for this project yet.', unknown };
        }
    }
    const empty = result.packages.length === 0
        ? 'No packages installed.'
        : vulnerableOnly ? 'No vulnerable packages.' : `No installed package matches "${filter.trim()}".`;
    return { items: entries.map(entry => ({ id: entry.id, entry })), empty, unknown };
}

export interface InstalledRowProps {
    placement: RowPlacement;
    projectPath: string;
    entry: InstalledPackage;
    result: InstalledResult;
    metadata: ReadonlyMap<string, PackageMetadataLite>;
    onUninstall: (entry: InstalledPackage) => void;
}

/**
 * One installed package as a row of the tab's tree: the icon, authors and Verified mark of the lite metadata and no
 * description (D14); a package that cannot be uninstalled (SDK, props) keeps a muted check mark and its badge says why.
 */
export function InstalledRow({ placement, projectPath, entry, result, metadata, onUninstall }: InstalledRowProps): React.JSX.Element {
    const ops = useOps();
    const { isPackageBusy } = ops;
    const busy = isPackageBusy(projectPath, entry.id);
    const readOnly = whyNotRemovable(entry, result) !== undefined;
    const unresolved = entry.declaration === 'unresolved';
    const central = entry.declaration === 'central' || entry.declaration === 'central-override';
    const lite = metadata.get(entry.id.toLowerCase());
    const cell = versionCell(entry);
    const src = packageIconSrc(lite?.iconUrl);
    return (
        <Row
            {...placement}
            vscodeContext={{
                webviewSection: 'installedRow',
                packageId: entry.id,
                projectPath,
                installedVersion: entry.resolvedVersion ?? entry.version,
                versionType: entry.versionType,
                'nuiget.central': central,
                'nuiget.readOnly': readOnly,
            }}
            itemId={entry.id}
            name={entry.id}
            version={cell.text}
            versionTitle={cell.title}
            authors={lite?.authors}
            verified={lite?.verified}
            icon={src === undefined ? undefined : <img src={src} alt="" />}
            busy={busy}
            selectable={!readOnly}
            status={busy ? busyText(ops, projectPath, entry.id) : unresolved ? 'Its reference could not be resolved.' : readOnlyReason(entry, result)}
            badges={<>
                {entry.isImplicit ? <Badge label="SDK" title="Added by the .NET SDK; cannot be uninstalled" /> : null}
                {entry.declaration === 'props' ? <Badge label="Props" title="Declared in an imported props file; cannot be uninstalled from the project" /> : null}
                {central ? <Badge label="CPM" title="Centrally managed" /> : null}
                {entry.versionType === 'floating'
                    ? <Badge label="Floating" title="Floating version pattern" />
                    : entry.versionType === 'range' ? <Badge label="Range" title="Version range" /> : null}
                {directVulnerability(metadata, entry.id) === 'vulnerable' ? <Badge label="Vulnerable" tone="error" title="Has known vulnerabilities" /> : null}
            </>}
            actions={readOnly ? null : (
                <IconButton label={`Uninstall ${entry.id}`} tabIndex={-1} data-testid="row-action-uninstall" onClick={() => onUninstall(entry)}><TrashIcon /></IconButton>
            )}
        />
    );
}

/** Why a row cannot join a bulk action, in text (DS-STATE-7). */
function readOnlyReason(entry: InstalledPackage, result: InstalledResult): string | undefined {
    if (entry.isImplicit) {
        return 'Added by the SDK';
    }
    if (entry.declaration === 'props') {
        return 'From a props file';
    }
    return result.unsupported === undefined ? undefined : 'Read-only';
}

/** A project's status on its group row: `Unsupported` and `provisional`, as text. */
export function statusBadges(result: InstalledResult | undefined, marker?: string): React.ReactNode {
    if (!result?.unsupported && result?.fidelity !== 'provisional') {
        return undefined;
    }
    return (
        <>
            {result?.unsupported ? <Badge label="Unsupported" tone="warning" title={result.unsupported.message} /> : null}
            {result?.fidelity === 'provisional' ? <Badge label="Provisional" tone="info" data-testid={marker === undefined ? 'installed-provisional' : `installed-provisional-${marker}`} title="Versions come from the project files; a full evaluation is pending." /> : null}
        </>
    );
}

/**
 * A list header's count: the total, `k of N` while a filter is on (shared with the sidebar, UX-P3.7b). The Installed tree's
 * group rows take it through `groupCount` (`shared/installed/rules.ts`), which adds the `@vulnerable` rule (UX-P5.1a).
 */
export { directCount } from '../../../shared/counts';
