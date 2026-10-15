import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { PackageSearchResult } from '../../../../protocol';
import { Badge, Banner, EmptyState, Listbox, ProgressBar, Row, Skeleton } from '../../../shared/primitives';
import { useDetailsActions } from '../../../shared/store/details';
import { useInstalled } from '../../../shared/store/installed';
import { useSearch } from '../../../shared/store/search';
import type { BrowseView } from '../../MainShell';

interface Item {
    id: string;
    result: PackageSearchResult;
}

const HINT = 'Enter shows the package\'s details.';

const formatDownloads = (count: number | undefined): string | undefined => {
    if (count === undefined) {
        return undefined;
    }
    if (count >= 1_000_000) {
        return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M downloads`;
    }
    return count >= 1_000 ? `${Math.round(count / 1_000)}K downloads` : `${count} downloads`;
};

/**
 * The browse results of the main panel (interaction model §2): what the search slice found for the text the user
 * submitted, with icons, descriptions and badges. A click or Enter makes a row current and selects it for the details
 * pane; after a navigation to a package (an exact search) the package found is current at once. A
 * source that could not be searched is a banner over the list, never "no results".
 */
export function BrowseList({ text, announce }: BrowseView): React.JSX.Element {
    const search = useSearch();
    const installed = useInstalled();
    const [currentId, setCurrentId] = useState<string | null>(null);
    const { select } = useDetailsActions();
    // The details pane follows the row made current by the user or by a navigation.
    const makeCurrent = (result: PackageSearchResult): void => {
        setCurrentId(result.id);
        select({ packageId: result.id, version: result.version, sourceUrl: result.sourceUrl, origin: 'browse', projectPath: null });
    };

    const items = useMemo<Item[]>(() => search.results.map(result => ({ id: result.id, result })), [search.results]);
    const installedVersions = useMemo(
        () => new Map((installed.result?.packages ?? []).map(entry => [entry.id.toLowerCase(), entry.resolvedVersion ?? entry.version])),
        [installed.result],
    );

    // A new text starts without a current row, except the package a navigation asked for; the same text asked again
    // (another source or prerelease flag, Retry) keeps the current row while the package is still found.
    const { status, query, exactMatch, results, sourcesUnavailable } = search;
    const answeredQuery = useRef<string | null>(null);
    useEffect(() => {
        if (status !== 'ready') {
            return;
        }
        const sameText = answeredQuery.current === query;
        answeredQuery.current = query;
        const wanted = exactMatch ? results.find(result => result.id.toLowerCase() === query.toLowerCase()) : undefined;
        if (wanted !== undefined) {
            makeCurrent(wanted);
        } else {
            setCurrentId(previous => (sameText && results.some(result => result.id === previous) ? previous : null));
        }
        announce(results.length === 0 ? `No results for "${query}"` : `${results.length} ${results.length === 1 ? 'package' : 'packages'} found for "${query}"`);
        // One announcement per answer: `results` changes with each, the rest belongs to it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results, status]);

    if (status === 'idle') {
        return <EmptyState message={`Press Enter to search for "${text.trim()}".`} />;
    }
    if (status === 'loading') {
        return <Skeleton density="comfortable" />;
    }
    if (status === 'error') {
        return <Banner severity="error" action={{ label: 'Retry', onClick: search.retry }}>{`The search failed: ${search.error?.message ?? 'unknown error'}`}</Banner>;
    }
    return (
        <div className="nuiget-browse">
            {search.revalidating ? <ProgressBar label="Searching again" /> : null}
            {sourcesUnavailable
                ? <Banner severity="warning" data-testid="browse-unavailable-banner" action={{ label: 'Retry', onClick: search.retry }}>Some package sources could not be searched; the results may be incomplete.</Banner>
                : null}
            {search.error ? <Banner severity="error" action={{ label: 'Retry', onClick: search.retry }}>{`The search failed: ${search.error.message}`}</Banner> : null}
            <Listbox
                items={items}
                label={`Search results for ${query}`}
                hint={HINT}
                testId="browse-list"
                density="comfortable"
                busy={search.revalidating}
                selectedId={currentId}
                onSelect={item => makeCurrent(item.result)}
                onActivate={item => makeCurrent(item.result)}
                empty={<EmptyState message={sourcesUnavailable ? `No package source could be searched for "${query}".` : `No results for "${query}".`} />}
                renderRow={(item, placement) => {
                    const { result } = item;
                    const installedVersion = installedVersions.get(result.id.toLowerCase());
                    const downloads = formatDownloads(result.totalDownloads);
                    return (
                        <Row
                            {...placement}
                            itemId={result.id}
                            name={result.id}
                            version={result.version}
                            description={[result.authors ? `by ${result.authors}` : '', downloads ?? '', result.description].filter(Boolean).join(' · ')}
                            density="comfortable"
                            icon={result.iconUrl?.startsWith('data:') ? <img className="nuiget-browse-icon" src={result.iconUrl} alt="" /> : undefined}
                            badges={(
                                <>
                                    {result.verified ? <Badge label="Verified" title="Prefix reserved by the owner" tone="info" /> : null}
                                    {installedVersion !== undefined ? <Badge label="Installed" title={`Installed: ${installedVersion}`} /> : null}
                                </>
                            )}
                        />
                    );
                }}
            />
        </div>
    );
}
