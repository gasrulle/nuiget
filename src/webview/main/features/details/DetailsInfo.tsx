import { useEffect } from 'react';
import type React from 'react';
import type { PackageMetadata } from '../../../../protocol';
import { Banner, EmptyState, Skeleton, WarningIcon } from '../../../shared/primitives';
import { useDetails, useDetailsActions } from '../../../shared/store/details';
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

function Facts({ metadata }: { metadata: PackageMetadata }): React.JSX.Element {
    const facts: Array<[string, React.ReactNode]> = [];
    if (metadata.authors) {
        facts.push(['Authors', metadata.authors]);
    }
    if (metadata.totalDownloads !== undefined) {
        facts.push(['Downloads', metadata.totalDownloads.toLocaleString('en-US')]);
    }
    if (metadata.published) {
        facts.push(['Published', formatDate(metadata.published)]);
    }
    if (metadata.license || metadata.licenseUrl) {
        facts.push(['License', isWebLink(metadata.licenseUrl) ? <a href={metadata.licenseUrl}>{metadata.license ?? 'View license'}</a> : metadata.license]);
    }
    if (isWebLink(metadata.projectUrl)) {
        facts.push(['Project URL', <a href={metadata.projectUrl}>{metadata.projectUrl}</a>]);
    }
    if (metadata.packageSize !== undefined) {
        facts.push(['Size', formatSize(metadata.packageSize)]);
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

/**
 * The Details tab (interaction model §7): description, authors, downloads, publication date, license, project URL,
 * size, vulnerabilities with their severity in words and an icon, and dependencies by target framework. Details read
 * from the local package cache are marked offline, saying whether a source is down or no source knows the version.
 */
export function DetailsInfo(): React.JSX.Element {
    const { metadata } = useDetails();
    const { retryMetadata } = useDetailsActions();
    const { failed, enable } = useSources();

    useEffect(() => enable(), [enable]);

    if (metadata.status === 'loading' || metadata.status === 'idle') {
        return <Skeleton density="comfortable" />;
    }
    if (metadata.status === 'error') {
        return <Banner severity="error" action={{ label: 'Retry', onClick: retryMetadata }}>{`Details could not be loaded: ${metadata.error?.message ?? 'unknown error'}`}</Banner>;
    }
    const value = metadata.value;
    if (value === null || value === undefined) {
        return <EmptyState message={failed.length > 0 ? 'No details: a package source could not be reached.' : 'No package source has details for this version.'} />;
    }
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
            <Facts metadata={value} />
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
                    <div key={group.targetFramework} className="nuiget-details-group">
                        <h4>{group.targetFramework || 'Any framework'}</h4>
                        {group.dependencies.length === 0 ? <p>No dependencies.</p> : (
                            <ul className="nuiget-details-list">
                                {group.dependencies.map(dependency => <li key={dependency.id}>{`${dependency.id} ${dependency.versionRange}`}</li>)}
                            </ul>
                        )}
                    </div>
                ))}
            </section>
        </div>
    );
}
