import { useId, useState } from 'react';
import type React from 'react';
import type { PackageMetadataLite, TransitiveFrameworkSection, TransitivePackage } from '../../../../protocol';
import { packageIconSrc } from '../../../shared/packageIcon';
import { Badge, Banner, EmptyState, Listbox, Row, SectionHeader, Skeleton, type RowPlacement } from '../../../shared/primitives';
import { useDetails, type DetailsSelection } from '../../../shared/store/details';
import { metadataKey, useTransitive } from '../../../shared/store/transitive';

interface Item {
    id: string;
    entry: TransitivePackage;
}

const ERRORS: Record<string, string> = {
    'parse-failed': 'The assets file of the project could not be read',
    'fs-error': 'The assets file of the project could not be opened',
    unknown: 'The transitive packages could not be listed',
};

const HINT = 'Arrow keys move between the packages. Enter shows the details of one.';

export interface TransitiveSectionProps {
    /** A row was made current: its details show what the transitive slice knows of it. */
    onCurrent: (selection: DetailsSelection) => void;
}

/**
 * The packages the project gets through its references (interaction model §7 and the transitive section of the
 * Installed tab), asked for shortly after the installed list. The collapsed header reads `Transitive packages (N)`
 * with the target framework; a project with several frameworks has one collapsible header per framework inside. Rows
 * show the icon, authors and Verified mark of the lite metadata and no description (D14); a row opens a read-only
 * details view with what requires it. When the project has not been restored, a banner offers Restore.
 */
export function TransitiveSection({ onCurrent }: TransitiveSectionProps): React.JSX.Element | null {
    const transitive = useTransitive();
    const { selection } = useDetails();
    const [open, setOpen] = useState(false);
    const baseId = useId();
    const titleId = `${baseId}-title`;
    const contentId = `${baseId}-content`;

    if (transitive.projectPath === null) {
        return null;
    }
    const projectPath = transitive.projectPath;
    const expanded = open && transitive.enabled;
    const toggle = (): void => {
        if (!expanded) {
            transitive.enable();
        }
        setOpen(!expanded);
    };

    const { result } = transitive;
    const usable = result !== undefined && result.dataSourceAvailable && result.errorKind === undefined;
    const frameworks = usable ? result.frameworks : [];
    const several = frameworks.length > 1;
    const total = frameworks.reduce((count, framework) => count + framework.packages.length, 0);
    const selectedId = selection?.origin === 'transitive' && selection.projectPath === projectPath ? `${selection.packageId.toLowerCase()}@${selection.version}` : null;

    const list = (framework: TransitiveFrameworkSection, naming: { label: string } | { labelledBy: string }): React.ReactNode => (
        <Listbox<Item>
            items={framework.packages.map(entry => ({ id: metadataKey(entry.id, entry.version), entry }))}
            {...naming}
            hint={HINT}
            testId={several ? `transitive-list-${framework.targetFramework}` : 'transitive-list'}
            density="comfortable"
            busy={transitive.revalidating}
            selectedId={selectedId}
            onSelect={item => onCurrent({ packageId: item.entry.id, version: item.entry.version, origin: 'transitive', projectPath })}
            onActivate={item => onCurrent({ packageId: item.entry.id, version: item.entry.version, origin: 'transitive', projectPath })}
            renderRow={(item, placement) => transitiveRow(item.entry, transitive.metadata.get(item.id), placement)}
        />
    );

    let content: React.ReactNode = null;
    if (expanded) {
        if (result === undefined) {
            content = transitive.error
                ? <Banner severity="error" action={{ label: 'Retry', onClick: transitive.refresh }}>{`The transitive packages could not be listed: ${transitive.error.message}`}</Banner>
                : <Skeleton density="comfortable" />;
        } else if (!result.dataSourceAvailable) {
            content = (
                <Banner severity="warning" data-testid="transitive-restore-banner" action={{ label: 'Restore', onClick: transitive.restore }}>
                    The project has not been restored, so its transitive packages are not known.
                </Banner>
            );
        } else if (result.errorKind !== undefined) {
            content = <Banner severity="error" action={{ label: 'Retry', onClick: transitive.refresh }}>{ERRORS[result.errorKind]}</Banner>;
        } else if (total === 0) {
            content = <EmptyState message="No transitive dependencies." />;
        } else if (several) {
            content = frameworks.map(framework => <FrameworkSection key={framework.targetFramework} framework={framework} render={list} />);
        } else {
            content = list(frameworks[0], { label: 'Transitive packages' });
        }
    }

    const tfm = !several && frameworks.length === 1 ? frameworks[0].targetFramework : undefined;
    return (
        <section className="nuiget-transitive" data-testid="transitive-section">
            <SectionHeader
                title={usable && !several ? `Transitive packages (${total})` : 'Transitive packages'}
                titleId={titleId}
                expanded={expanded}
                onToggle={toggle}
                contentId={contentId}
                testKey="transitive"
                busy={transitive.status === 'loading' || transitive.revalidating}
                actions={tfm === undefined ? undefined : <Badge label={tfm} title={`Target framework ${tfm}`} />}
            />
            <div id={contentId} hidden={!expanded} className="nuiget-transitive-content">{content}</div>
        </section>
    );
}

/** One target framework of a project that has several: its own collapsible header with the count and the framework. */
function FrameworkSection({ framework, render }: {
    framework: TransitiveFrameworkSection;
    render: (framework: TransitiveFrameworkSection, naming: { labelledBy: string }) => React.ReactNode;
}): React.JSX.Element {
    const [expanded, setExpanded] = useState(true);
    const baseId = useId();
    const titleId = `${baseId}-title`;
    const contentId = `${baseId}-content`;
    const tfm = framework.targetFramework;
    return (
        <section className="nuiget-transitive-framework">
            <SectionHeader
                title={`Transitive packages (${framework.packages.length})`}
                titleId={titleId}
                expanded={expanded}
                onToggle={() => setExpanded(value => !value)}
                contentId={contentId}
                testKey={`transitive-${tfm}`}
                level={3}
                actions={<Badge label={tfm} title={`Target framework ${tfm}`} />}
            />
            <div id={contentId} hidden={!expanded}>{render(framework, { labelledBy: titleId })}</div>
        </section>
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
            density="comfortable"
            badges={<>
                {badges}
                {lite?.vulnerabilities?.length ? <Badge label="Vulnerable" tone="error" title="Has known vulnerabilities" /> : null}
            </>}
        />
    );
}
