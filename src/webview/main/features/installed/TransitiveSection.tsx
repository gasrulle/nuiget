import { useId, useState } from 'react';
import type React from 'react';
import type { TransitivePackage } from '../../../../protocol';
import { Badge, Banner, EmptyState, Listbox, Row, SectionHeader, Skeleton } from '../../../shared/primitives';
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

/**
 * The packages the project gets through its references, by target framework (interaction model §7 and the
 * transitive section of the Installed tab). Closed until the user opens it; nothing is asked before. When the
 * project has not been restored, a banner offers Restore.
 */
export function TransitiveSection(): React.JSX.Element | null {
    const transitive = useTransitive();
    const [open, setOpen] = useState(false);
    const baseId = useId();
    const titleId = `${baseId}-title`;
    const contentId = `${baseId}-content`;

    if (transitive.projectPath === null) {
        return null;
    }
    // The slice starts closed for another project; so does the section.
    const expanded = open && transitive.enabled;
    const toggle = (): void => {
        if (!expanded) {
            transitive.enable();
        }
        setOpen(!expanded);
    };

    const { result } = transitive;
    let content: React.ReactNode = null;
    if (expanded) {
        if (result === undefined) {
            content = transitive.error
                ? <Banner severity="error" action={{ label: 'Retry', onClick: transitive.refresh }}>{`The transitive packages could not be listed: ${transitive.error.message}`}</Banner>
                : <Skeleton density="compact" />;
        } else if (!result.dataSourceAvailable) {
            content = (
                <Banner severity="warning" data-testid="transitive-restore-banner" action={{ label: 'Restore', onClick: transitive.restore }}>
                    The project has not been restored, so its transitive packages are not known.
                </Banner>
            );
        } else if (result.errorKind !== undefined) {
            content = <Banner severity="error" action={{ label: 'Retry', onClick: transitive.refresh }}>{ERRORS[result.errorKind]}</Banner>;
        } else if (result.frameworks.every(framework => framework.packages.length === 0)) {
            content = <EmptyState message="No transitive dependencies." />;
        } else {
            const several = result.frameworks.length > 1;
            content = result.frameworks.map(framework => (
                <div key={framework.targetFramework} className="nuiget-transitive-framework">
                    {several ? <h3 className="nuiget-transitive-heading" id={`${baseId}-${framework.targetFramework}`}>{framework.targetFramework}</h3> : null}
                    <Listbox<Item>
                        items={framework.packages.map(entry => ({ id: entry.id, entry }))}
                        {...(several ? { labelledBy: `${baseId}-${framework.targetFramework}` } : { label: 'Transitive packages' })}
                        hint="Arrow keys move between the packages."
                        testId={several ? `transitive-list-${framework.targetFramework}` : 'transitive-list'}
                        density="compact"
                        busy={transitive.revalidating}
                        renderRow={(item, placement) => (
                            <Row
                                {...placement}
                                itemId={item.entry.id}
                                name={item.entry.id}
                                version={item.entry.version}
                                density="compact"
                                description={item.entry.requiredByChain.length > 0 ? `Required by: ${item.entry.requiredByChain.join(', ')}` : undefined}
                                badges={transitive.metadata.get(metadataKey(item.entry.id, item.entry.version))?.vulnerabilities?.length
                                    ? <Badge label="Vulnerable" tone="error" title="Has known vulnerabilities" />
                                    : undefined}
                            />
                        )}
                    />
                </div>
            ));
        }
    }

    return (
        <section className="nuiget-transitive" data-testid="transitive-section">
            <SectionHeader
                title="Transitive packages"
                titleId={titleId}
                expanded={expanded}
                onToggle={toggle}
                contentId={contentId}
                testKey="transitive"
                busy={expanded && (transitive.status === 'loading' || transitive.revalidating)}
            />
            <div id={contentId} hidden={!expanded} className="nuiget-transitive-content">{content}</div>
        </section>
    );
}
