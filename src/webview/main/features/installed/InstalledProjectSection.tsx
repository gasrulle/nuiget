import type React from 'react';
import type { InstalledPackage, InstalledResult, PackageMetadataLite } from '../../../../protocol';
import { IN_PROGRESS, versionCell, whyNotRemovable } from '../../../shared/installed/rules';
import { packageIconSrc } from '../../../shared/packageIcon';
import { Badge, IconButton, Row, TrashIcon, type RowPlacement } from '../../../shared/primitives';
import { useOps } from '../../../shared/store/ops';

/** A package as a project's rows hold it. */
export interface Item {
    id: string;
    entry: InstalledPackage;
}

const isVulnerable = (metadata: ReadonlyMap<string, PackageMetadataLite>, id: string): boolean =>
    (metadata.get(id.toLowerCase())?.vulnerabilities?.length ?? 0) > 0;

/** The rows a filter leaves, and what to say when it leaves none. */
export function visibleRows(result: InstalledResult, metadata: ReadonlyMap<string, PackageMetadataLite>, filter: string, vulnerableOnly: boolean): { items: Item[]; empty: string } {
    const needle = filter.trim().toLowerCase();
    let entries = result.packages.filter(entry => entry.id.toLowerCase().includes(needle));
    if (vulnerableOnly) {
        // Empty is not unknown: without any metadata nothing can be said about vulnerabilities.
        if (metadata.size === 0) {
            return { items: [], empty: 'Vulnerability data is not available for this project yet.' };
        }
        entries = entries.filter(entry => isVulnerable(metadata, entry.id));
    }
    const empty = result.packages.length === 0
        ? 'No packages installed.'
        : vulnerableOnly ? 'No vulnerable packages.' : `No installed package matches "${filter.trim()}".`;
    return { items: entries.map(entry => ({ id: entry.id, entry })), empty };
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
    const { isPackageBusy, active } = useOps();
    const busyStatus = (packageId: string): string => {
        const id = packageId.toLowerCase();
        for (const progress of active.values()) {
            if (progress.kind !== undefined && progress.projectPaths?.includes(projectPath) && progress.packageIds?.some(other => other.toLowerCase() === id)) {
                return IN_PROGRESS[progress.kind];
            }
        }
        return 'In progress';
    };
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
            itemId={entry.id}
            name={entry.id}
            version={cell.text}
            versionTitle={cell.title}
            authors={lite?.authors}
            verified={lite?.verified}
            icon={src === undefined ? undefined : <img src={src} alt="" />}
            density="comfortable"
            busy={busy}
            selectable={!readOnly}
            status={busy ? busyStatus(entry.id) : unresolved ? 'Unresolved' : undefined}
            badges={<>
                {entry.isImplicit ? <Badge label="SDK" title="Added by the .NET SDK; cannot be uninstalled" /> : null}
                {entry.declaration === 'props' ? <Badge label="props" title="Declared in an imported props file; cannot be uninstalled from the project" /> : null}
                {central ? <Badge label="CPM" title="Centrally managed" /> : null}
                {entry.versionType === 'floating'
                    ? <Badge label="floating" title="Floating version pattern" />
                    : entry.versionType === 'range' ? <Badge label="range" title="Version range" /> : null}
                {isVulnerable(metadata, entry.id) ? <Badge label="Vulnerable" tone="error" title="Has known vulnerabilities" /> : null}
            </>}
            actions={readOnly ? null : (
                <IconButton label={`Uninstall ${entry.id}`} tabIndex={-1} data-testid="row-action-uninstall" onClick={() => onUninstall(entry)}><TrashIcon /></IconButton>
            )}
        />
    );
}

/** A project's status on its group row: `Unsupported` and `provisional`, as text. */
export function statusBadges(result: InstalledResult | undefined): React.ReactNode {
    if (!result?.unsupported && result?.fidelity !== 'provisional') {
        return undefined;
    }
    return (
        <>
            {result?.unsupported ? <Badge label="Unsupported" tone="warning" title={result.unsupported.message} /> : null}
            {result?.fidelity === 'provisional' ? <Badge label="provisional" tone="info" title="Versions come from the project files; a full evaluation is pending." /> : null}
        </>
    );
}

/**
 * The single-project group row's title, as 1.x wrote it: `Direct packages (N)`, `(k of N)` while a filter is on. While the
 * vulnerability data is unknown `@vulnerable` counts nothing, so the title keeps `(N)`.
 */
export function directTitle(total: number, shown: number, filtering: boolean): string {
    return filtering ? `Direct packages (${shown} of ${total})` : `Direct packages (${total})`;
}
