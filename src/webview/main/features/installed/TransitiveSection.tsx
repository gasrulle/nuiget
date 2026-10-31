import type React from 'react';
import type { PackageMetadataLite, TransitivePackage } from '../../../../protocol';
import { packageIconSrc } from '../../../shared/packageIcon';
import { Badge, Banner, EmptyState, Row, SectionHeader, Skeleton, type GroupPlacement, type RowPlacement } from '../../../shared/primitives';
import { metadataKey, type TransitiveState } from '../../../shared/store/transitive';
import { rowId, type TreeItem } from './installedTree';

type GroupItem = Extract<TreeItem, { kind: 'group' }>;

const ERRORS: Record<string, string> = {
    'parse-failed': 'The assets file of the project could not be read',
    'fs-error': 'The assets file of the project could not be opened',
    unknown: 'The transitive packages could not be listed',
};

/**
 * The packages the project gets through its references (interaction model §7), as rows of the tab's tree, asked for
 * shortly after the installed list. The collapsed group row reads `Transitive packages (N)` with the target framework; a
 * project with several frameworks has a group row per framework inside. Rows show the icon, authors and Verified mark of
 * the lite metadata and no description (D14) and open a read-only details view with what requires them. When the project
 * has not been restored, a banner above the tree offers Restore.
 */
export function transitiveTree(state: TransitiveState, expanded: boolean, collapsed: ReadonlySet<string>): { items: TreeItem[]; message: React.ReactNode } {
    if (state.projectPath === null) {
        return { items: [], message: null };
    }
    const { projectPath, result } = state;
    const usable = result !== undefined && result.dataSourceAvailable && result.errorKind === undefined;
    const frameworks = usable ? result.frameworks : [];
    const several = frameworks.length > 1;
    const total = frameworks.reduce((count, framework) => count + framework.packages.length, 0);
    const items: TreeItem[] = [{
        kind: 'group',
        id: 'transitive',
        level: 1,
        title: usable && !several ? `Transitive packages (${total})` : 'Transitive packages',
        variant: 'group',
        tfm: !several && frameworks.length === 1 ? frameworks[0].targetFramework : undefined,
    }];
    if (!expanded) {
        return { items, message: null };
    }
    for (const framework of frameworks) {
        const tfm = framework.targetFramework;
        const groupId = `transitive-${tfm}`;
        if (several) {
            items.push({ kind: 'group', id: groupId, level: 2, title: `Transitive packages (${framework.packages.length})`, variant: 'level', tfm });
        }
        if (!several || !collapsed.has(groupId)) {
            for (const entry of framework.packages) {
                const key = metadataKey(entry.id, entry.version);
                items.push({ kind: 'transitive', id: rowId(`transitive:${tfm}`, key), scope: { projectPath, tfm }, entry: { id: entry.id, version: entry.version }, key });
            }
        }
    }
    let message: React.ReactNode = null;
    if (result === undefined) {
        message = state.error
            ? <Banner severity="error" action={{ label: 'Retry', onClick: state.refresh }}>{`The transitive packages could not be listed: ${state.error.message}`}</Banner>
            : <Skeleton density="comfortable" />;
    } else if (!result.dataSourceAvailable) {
        message = (
            <Banner severity="warning" data-testid="transitive-restore-banner" action={{ label: 'Restore', onClick: state.restore }}>
                The project has not been restored, so its transitive packages are not known.
            </Banner>
        );
    } else if (result.errorKind !== undefined) {
        message = <Banner severity="error" action={{ label: 'Retry', onClick: state.refresh }}>{ERRORS[result.errorKind]}</Banner>;
    } else if (total === 0) {
        message = <EmptyState message="No transitive dependencies." />;
    }
    return { items, message };
}

/** The content of a transitive group row: the framework as a badge where the row stands for one. */
export function transitiveGroupContent(item: GroupItem, placement: GroupPlacement, state: TransitiveState): React.JSX.Element {
    return (
        <SectionHeader
            presentation="content"
            title={item.title}
            testKey={item.level === 1 ? 'transitive' : `transitive-${item.tfm ?? ''}`}
            expanded={placement.expanded}
            variant={item.level === 1 ? 'group' : 'level'}
            busy={state.status === 'loading' || state.revalidating}
            badges={item.tfm === undefined ? undefined : <Badge label={item.tfm} title={`Target framework ${item.tfm}`} />}
        />
    );
}

/** A comfortable transitive row: icon, authors and Verified from the lite metadata, the Vulnerable badge; no description. */
export function transitiveRow(entry: Pick<TransitivePackage, 'id' | 'version'>, lite: PackageMetadataLite | undefined, placement: RowPlacement, badges?: React.ReactNode): React.JSX.Element {
    const src = packageIconSrc(lite?.iconUrl);
    return (
        <Row
            {...placement}
            itemId={entry.id}
            name={entry.id}
            version={entry.version}
            authors={lite?.authors}
            verified={lite?.verified}
            icon={src === undefined ? undefined : <img src={src} alt="" />}
            selectable={false}
            badges={<>
                {badges}
                {lite?.vulnerabilities?.length ? <Badge label="Vulnerable" tone="error" title="Has known vulnerabilities" /> : null}
            </>}
        />
    );
}
