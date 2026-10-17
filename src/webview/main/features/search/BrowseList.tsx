import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, type PackageSearchResult } from '../../../../protocol';
import { packageIconSrc } from '../../../shared/packageIcon';
import { Badge, Banner, EmptyState, Listbox, ProgressBar, Row, Skeleton } from '../../../shared/primitives';
import { useDetailsActions } from '../../../shared/store/details';
import { useInstalled } from '../../../shared/store/installed';
import { useOps } from '../../../shared/store/ops';
import { useSearch } from '../../../shared/store/search';
import { useSession } from '../../../shared/store/session';
import type { BrowseView } from '../../MainShell';
import { useInstallAction } from '../details/useInstallAction';
import { CentralUpdateDialog } from '../updates/CentralUpdateDialog';

interface Item {
    id: string;
    result: PackageSearchResult;
}

const HINT = 'Enter shows the package\'s details; Ctrl+Enter (Cmd+Enter) installs it into the selected project.';

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
 * submitted: the 1.x card with icon, downloads, authors and Verified mark, and the description. A click or Enter makes a
 * row current and selects it for the details pane; after a navigation to a package (an exact search) the package found is
 * current at once, and a new text whose results lack the current row clears the pane (a browse selection is never
 * stale). Ctrl+Enter installs the row's version into the selected project through the details pane's install path
 * (`useInstallAction`). A source that could not be searched is a banner over the list, never "no results".
 */
export function BrowseList({ text, announce }: BrowseView): React.JSX.Element {
    const search = useSearch();
    const installed = useInstalled();
    const [currentId, setCurrentId] = useState<string | null>(null);
    const { select } = useDetailsActions();
    const { isPackageBusy } = useOps();
    const allMode = useSession().committed?.selectedProject === ALL_PROJECTS;
    const installAction = useInstallAction(announce);
    // The details pane follows the row made current by the user or by a navigation.
    const makeCurrent = (result: PackageSearchResult, version = result.version): void => {
        setCurrentId(result.id);
        select({ packageId: result.id, version, sourceUrl: result.sourceUrl, origin: 'browse', projectPath: null, known: { verified: result.verified, totalDownloads: result.totalDownloads } });
    };

    const items = useMemo<Item[]>(() => search.results.map(result => ({ id: result.id, result })), [search.results]);
    const installedVersions = useMemo(
        () => new Map((installed.result?.packages ?? []).map(entry => [entry.id.toLowerCase(), entry.resolvedVersion ?? entry.version])),
        [installed.result],
    );

    // A new text starts without a current row, except the package a navigation asked for; the same text asked again
    // (another source or prerelease flag, Retry) keeps the current row while the package is still found.
    const { status, query, exactMatch, version, results, sourcesUnavailable } = search;
    const answeredQuery = useRef<string | null>(null);
    useEffect(() => {
        if (status !== 'ready') {
            return;
        }
        const sameText = answeredQuery.current === query;
        answeredQuery.current = query;
        const wanted = exactMatch ? results.find(result => result.id.toLowerCase() === query.toLowerCase()) : undefined;
        if (wanted !== undefined) {
            // A navigation that names a version (View details of a sidebar row) shows that version.
            makeCurrent(wanted, version ?? wanted.version);
        } else {
            const kept = sameText && currentId !== null && results.some(result => result.id === currentId);
            if (!kept) {
                if (currentId !== null) {
                    // The row the pane shows is gone with the new text: the pane goes back to its empty state.
                    select(null);
                }
                setCurrentId(null);
            }
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
                onSecondaryActivate={item => {
                    makeCurrent(item.result);
                    if (allMode) {
                        announce('Under All Projects, Install… in the details picks the projects.');
                        return;
                    }
                    installAction.install({ packageId: item.result.id, version: item.result.version, sourceUrl: item.result.sourceUrl });
                }}
                empty={<EmptyState message={sourcesUnavailable ? `No package source could be searched for "${query}".` : `No results for "${query}".`} />}
                renderRow={(item, placement) => {
                    const { result } = item;
                    const installedVersion = installedVersions.get(result.id.toLowerCase());
                    const src = packageIconSrc(result.iconUrl);
                    return (
                        <Row
                            {...placement}
                            itemId={result.id}
                            name={result.id}
                            version={result.version}
                            meta={formatDownloads(result.totalDownloads)}
                            authors={result.authors || undefined}
                            verified={result.verified}
                            description={result.description || undefined}
                            density="comfortable"
                            icon={src === undefined ? undefined : <img src={src} alt="" />}
                            busy={installed.projectPath !== null && isPackageBusy(installed.projectPath, result.id)}
                            badges={installedVersion !== undefined ? <Badge label="Installed" title={`Installed: ${installedVersion}`} /> : undefined}
                        />
                    );
                }}
            />
            <CentralUpdateDialog request={installAction.preview} onClose={installAction.closePreview} onConfirm={installAction.confirmPreview} />
        </div>
    );
}
