import { useEffect, useId, useState } from 'react';
import type React from 'react';
import type { PackageDependencyGroup as Group, PackageMetadata } from '../../../../protocol';
import { Banner, EmptyState, ErrorIcon, GroupCaption, InfoIcon, ProgressBar, PropertyList, SectionHeader, Skeleton, VerifiedIcon, WarningIcon } from '../../../shared/primitives';
import { deprecationSentence, severityLevel } from '../../../shared/installed/rules';
import { failure } from '../../../shared/updates/sentence';
import { useDetails, useDetailsActions, type DetailsSelection } from '../../../shared/store/details';
import { useSession } from '../../../shared/store/session';
import { useSources } from '../../../shared/store/sources';
import { LOADING_DETAILS, useFirstLoadAnnouncement } from '../../../shared/firstLoad';

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
        facts.push(['Authors', known?.verified ? <><VerifiedIcon size={12} className="nuiget-verified" title="Verified: the package id prefix is reserved by its owner" />{' '}{metadata.authors}</> : metadata.authors]);
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
    return <PropertyList items={facts.map(([term, value]) => ({ term, value }))} />;
}

/** One target framework's dependencies under a toggle with their count badge beside its name; nothing is rendered while it is closed. */
function DependencyGroup({ group, expanded, onToggle }: { group: Group; expanded: boolean; onToggle: () => void }): React.JSX.Element {
    const titleId = useId();
    const contentId = useId();
    return (
        <div className="nuiget-details-group">
            <SectionHeader
                level={4}
                variant="level"
                title={group.targetFramework || 'Any Framework'}
                count={group.dependencies.length}
                titleId={titleId}
                contentId={contentId}
                testKey={`dependencies-${group.targetFramework.toLowerCase() || 'any'}`}
                expanded={expanded}
                onToggle={onToggle}
            />
            {!expanded ? null : group.dependencies.length === 0 ? <p id={contentId} className="nuiget-details-note">No dependencies.</p> : (
                <ul id={contentId} aria-labelledby={titleId} className="nuiget-details-list">
                    {group.dependencies.map(dependency => <li key={dependency.id}>{`${dependency.id} ${dependency.versionRange}`}</li>)}
                </ul>
            )}
        </div>
    );
}

/**
 * An advisory line takes the glyph and colour role of the row badge's severity mapping (UX-P5.2b, DS-STATE-4 `advisories`):
 * Critical and High the error glyph, Moderate the warning glyph, Low the information glyph, each in its problems colour; the words
 * keep the text colour.
 */
const ADVISORY_LEVEL = {
    error: { className: 'nuiget-details-vulnerability nuiget-details-vulnerability--error' },
    warning: { className: 'nuiget-details-vulnerability nuiget-details-vulnerability--warning' },
    info: { className: 'nuiget-details-vulnerability nuiget-details-vulnerability--info' },
} as const;

function AdvisoryGlyph({ level }: { level: 'error' | 'warning' | 'info' }): React.JSX.Element {
    if (level === 'error') {
        return <ErrorIcon className="nuiget-details-advisory-glyph" />;
    }
    return level === 'warning' ? <WarningIcon className="nuiget-details-advisory-glyph" /> : <InfoIcon className="nuiget-details-advisory-glyph" />;
}

/**
 * The Details tab (interaction model §7): description, then a property list of Version, Authors with the Verified mark
 * the row knew, License, Downloads (the registration's, else the row's), Package size, Date published, Project URL and
 * Report abuse for a nuget.org package; vulnerabilities with their severity in words and an icon; dependencies per target
 * framework, collapsed, each with its count badge. Details read from the local package cache are marked offline, saying whether a source
 * is down or no source knows the version. The pane keys it by package and version, so another package starts collapsed.
 */
export function DetailsInfo({ announce, shownKey, find }: { announce: (message: string) => void; shownKey: string | null; find?: (packageId: string) => void }): React.JSX.Element {
    const { metadata, selection } = useDetails();
    const { retryMetadata } = useDetailsActions();
    const { sources, failed, enable } = useSources();
    const allSources = useSession().committed?.selectedSource === 'all';
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

    useEffect(() => enable(), [enable]);
    // The shown package's first details are said once (a11y-first-load-announced, UX-P4.6).
    const loading = metadata.status === 'loading' || metadata.status === 'idle';
    useFirstLoadAnnouncement(announce, LOADING_DETAILS, shownKey, loading);

    // The selection's first metadata: the 2 px bar over the skeleton facts (DS-STATE-2; UX-P3.10, design-advisor DO 11).
    if (loading) {
        return (
            <>
                <div className="nuiget-details-progress">
                    <ProgressBar label={LOADING_DETAILS} data-testid="details-progress" />
                </div>
                <Skeleton density="compact" />
            </>
        );
    }
    if (metadata.status === 'error') {
        return <Banner severity="error" data-testid="details-error" action={{ label: 'Retry', onClick: retryMetadata }}>{failure('The details', 'loaded', metadata.error?.message)}</Banner>;
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
    // Report abuse is nuget.org's: the answering source, else the row's, else All Sources with nuget.org among them.
    const from = value.sourceUrl ?? selection?.sourceUrl;
    const onNuGetOrg = from !== undefined ? isNuGetOrg(from) : allSources && (sources ?? []).some(source => source.enabled && isNuGetOrg(source.url));
    const reportAbuse = onNuGetOrg ? `https://www.nuget.org/packages/${encodeURIComponent(value.id)}/${encodeURIComponent(value.version)}/ReportAbuse` : undefined;
    return (
        <div className="nuiget-details-info">
            {value.offline ? (
                <div className="nuiget-details-notice">
                    <Banner severity="warning">
                        {failed.length > 0
                            ? 'Offline: a package source could not be reached. These details come from the package cache on this machine.'
                            : 'Offline: no package source knows this version. These details come from the package cache on this machine.'}
                    </Banner>
                </div>
            ) : null}
            {value.deprecation ? (
                <div className="nuiget-details-notice">
                    <Banner
                        severity="warning"
                        data-testid="details-deprecation"
                        action={value.deprecation.alternatePackage && find ? { label: 'Find Alternative', onClick: () => find((value.deprecation?.alternatePackage as { id: string }).id) } : undefined}
                    >
                        {deprecationSentence(value.deprecation)}
                    </Banner>
                    {/* The source's own words, text only: never HTML, never a link (UX-P5.2b, design DO 4). */}
                    {value.deprecation.message ? <p className="nuiget-details-note" data-testid="details-deprecation-message">{value.deprecation.message}</p> : null}
                </div>
            ) : null}
            {value.description ? <p className="nuiget-details-description">{value.description}</p> : null}
            <Facts metadata={value} known={selection?.known} reportAbuse={reportAbuse} />
            {value.vulnerabilities !== undefined && value.vulnerabilities.length > 0 ? (
                <section aria-label="Vulnerabilities" className="nuiget-details-section">
                    <GroupCaption title="Vulnerabilities" />
                    <ul className="nuiget-details-list">
                        {value.vulnerabilities.map(vulnerability => (
                            <li key={vulnerability.advisoryUrl} className={ADVISORY_LEVEL[severityLevel(vulnerability.severity)].className}>
                                <AdvisoryGlyph level={severityLevel(vulnerability.severity)} />
                                <span>{`${vulnerability.severity} severity`}</span>
                                {isWebLink(vulnerability.advisoryUrl) ? <a href={vulnerability.advisoryUrl}>Advisory</a> : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
            <section aria-label="Dependencies" className="nuiget-details-section">
                <GroupCaption title="Dependencies" />
                {value.dependencies.length === 0 ? <p className="nuiget-details-note">No dependencies.</p> : (
                    <div className="nuiget-details-groups">
                        {value.dependencies.map(group => (
                            <DependencyGroup key={group.targetFramework} group={group} expanded={expanded.has(group.targetFramework)} onToggle={() => toggle(group.targetFramework)} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
