import { useEffect, useId, useState } from 'react';
import type React from 'react';
import type { PackageDependencyGroup as Group, PackageMetadata } from '../../../../protocol';
import { Banner, EmptyState, SectionHeader, Skeleton, VerifiedIcon, WarningIcon } from '../../../shared/primitives';
import { useDetails, useDetailsActions, type DetailsSelection } from '../../../shared/store/details';
import { useSession } from '../../../shared/store/session';
import { useSources } from '../../../shared/store/sources';

const formatSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
};

const formatDate = (iso: string): string => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10);
};

/** Only links a webview may hand to the browser. */
const isWebLink = (url: string | undefined): url is string => url !== undefined && /^https?:\/\//i.test(url);

/** A URL on nuget.org or one of its subdomains (`api.nuget.org`), where a package can be reported. */
const isNuGetOrg = (url: string | undefined): boolean => {
    if (url === undefined) {
        return false;
    }
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host === 'nuget.org' || host.endsWith('.nuget.org');
    } catch {
        return false;
    }
};

interface FactsProps {
    metadata: PackageMetadata;
    known: DetailsSelection['known'];
    reportAbuse: string | undefined;
}

/** The facts in the 1.x order: what the version is, who made it, under which license, how used and how big, when, where. */
function Facts({ metadata, known, reportAbuse }: FactsProps): React.JSX.Element {
    const facts: Array<[string, React.ReactNode]> = [];
    facts.push(['Version', metadata.version]);
    if (metadata.authors) {
        facts.push(['Author(s)', known?.verified ? <><VerifiedIcon title="Verified: the package id prefix is reserved by its owner" />{' '}{metadata.authors}</> : metadata.authors]);
    }
    if (metadata.license || metadata.licenseUrl) {
        facts.push(['License', isWebLink(metadata.licenseUrl) ? <a href={metadata.licenseUrl}>{metadata.license ?? 'View license'}</a> : metadata.license]);
    }
    const downloads = metadata.totalDownloads ?? known?.totalDownloads;
    if (downloads !== undefined) {
        facts.push(['Downloads', downloads.toLocaleString('en-US')]);
    }
    if (metadata.packageSize !== undefined) {
        facts.push(['Package size', formatSize(metadata.packageSize)]);
    }
    if (metadata.published) {
        facts.push(['Date published', formatDate(metadata.published)]);
    }
    if (isWebLink(metadata.projectUrl)) {
        facts.push(['Project URL', <a href={metadata.projectUrl}>{metadata.projectUrl}</a>]);
    }
    if (reportAbuse !== undefined) {
        facts.push(['Report abuse', <a href={reportAbuse}>Report this package</a>]);
    }
    return (
        <dl className="nuiget-details-facts">
            {facts.map(([term, value]) => (
                <div key={term} className="nuiget-details-fact">
                    <dt>{term}</dt>
                    <dd>{value}</dd>
                </div>
            ))}
        </dl>
    );
}

/** One target framework's dependencies under a toggle named with their count; nothing is rendered while it is closed. */
function DependencyGroup({ group, expanded, onToggle }: { group: Group; expanded: boolean; onToggle: () => void }): React.JSX.Element {
    const titleId = useId();
    const contentId = useId();
    return (
        <div className="nuiget-details-group">
            <SectionHeader
                level={4}
                title={`${group.targetFramework || 'Any framework'} (${group.dependencies.length})`}
                titleId={titleId}
                contentId={contentId}
                testKey={`dependencies-${group.targetFramework.toLowerCase() || 'any'}`}
                expanded={expanded}
                onToggle={onToggle}
            />
            {!expanded ? null : group.dependencies.length === 0 ? <p id={contentId}>No dependencies.</p> : (
                <ul id={contentId} aria-labelledby={titleId} className="nuiget-details-list">
                    {group.dependencies.map(dependency => <li key={dependency.id}>{`${dependency.id} ${dependency.versionRange}`}</li>)}
                </ul>
            )}
        </div>
    );
}

/**
 * The Details tab (interaction model §7): description, then Version, Author(s) with the Verified mark the row knew,
 * License, Downloads (the registration's, else the row's), Package size, Date published, Project URL and Report abuse
 * for a nuget.org package; vulnerabilities with their severity in words and an icon; dependencies per target framework,
 * collapsed with their counts. Details read from the local package cache are marked offline, saying whether a source
 * is down or no source knows the version. The pane keys it by package and version, so another package starts collapsed.
 */
export function DetailsInfo(): React.JSX.Element {
    const { metadata, selection } = useDetails();
    const { retryMetadata } = useDetailsActions();
    const { sources, failed, enable } = useSources();
    const allSources = useSession().committed?.selectedSource === 'all';
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

    useEffect(() => enable(), [enable]);

    if (metadata.status === 'loading' || metadata.status === 'idle') {
        return <Skeleton density="comfortable" />;
    }
    if (metadata.status === 'error') {
        return <Banner severity="error" action={{ label: 'Retry', onClick: retryMetadata }}>{`Details could not be loaded: ${metadata.error?.message ?? 'unknown error'}`}</Banner>;
    }
    const value = metadata.value;
    const toggle = (framework: string): void => setExpanded(previous => {
        const next = new Set(previous);
        if (!next.delete(framework)) {
            next.add(framework);
        }
        return next;
    });
    if (value === null || value === undefined) {
        return <EmptyState message={failed.length > 0 ? 'No details: a package source could not be reached.' : 'No package source has details for this version.'} />;
    }
    // Report abuse is nuget.org's: the answering source, else the row's, else All sources with nuget.org among them.
    const from = value.sourceUrl ?? selection?.sourceUrl;
    const onNuGetOrg = from !== undefined ? isNuGetOrg(from) : allSources && (sources ?? []).some(source => source.enabled && isNuGetOrg(source.url));
    const reportAbuse = onNuGetOrg ? `https://www.nuget.org/packages/${encodeURIComponent(value.id)}/${encodeURIComponent(value.version)}/ReportAbuse` : undefined;
    return (
        <div className="nuiget-details-info">
            {value.offline ? (
                <Banner severity="warning">
                    {failed.length > 0
                        ? 'Offline: a package source could not be reached. These details come from the package cache on this machine.'
                        : 'Offline: no package source knows this version. These details come from the package cache on this machine.'}
                </Banner>
            ) : null}
            {value.description ? <p className="nuiget-details-description">{value.description}</p> : null}
            <Facts metadata={value} known={selection?.known} reportAbuse={reportAbuse} />
            {value.vulnerabilities !== undefined && value.vulnerabilities.length > 0 ? (
                <section aria-label="Vulnerabilities" className="nuiget-details-section">
                    <h3>Vulnerabilities</h3>
                    <ul className="nuiget-details-list">
                        {value.vulnerabilities.map(vulnerability => (
                            <li key={vulnerability.advisoryUrl} className="nuiget-details-vulnerability">
                                <WarningIcon />
                                <span>{`${vulnerability.severity} severity`}</span>
                                {isWebLink(vulnerability.advisoryUrl) ? <a href={vulnerability.advisoryUrl}>Advisory</a> : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
            <section aria-label="Dependencies" className="nuiget-details-section">
                <h3>Dependencies</h3>
                {value.dependencies.length === 0 ? <p>No dependencies.</p> : value.dependencies.map(group => (
                    <DependencyGroup key={group.targetFramework} group={group} expanded={expanded.has(group.targetFramework)} onToggle={() => toggle(group.targetFramework)} />
                ))}
            </section>
        </div>
    );
}
