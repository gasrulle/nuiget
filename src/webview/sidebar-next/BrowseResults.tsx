import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import type { PackageSearchResult } from '../../protocol';
import { Badge, Banner, EmptyState, IconButton, Listbox, PlusIcon, ProgressBar, Row, Skeleton } from '../shared/primitives';
import { useInstalled } from '../shared/store/installed';
import { useOps, useOpsActions } from '../shared/store/ops';
import { useSearch } from '../shared/store/search';

interface Item {
    id: string;
    result: PackageSearchResult;
}

export interface BrowseResultsProps {
    /** Something to say to a screen reader that no outcome of an operation says. */
    announce: (message: string) => void;
}

/**
 * The flat browse results of the sidebar (interaction model §2): compact rows, Enter or the row's button installs the
 * version found into the selected project. A package that is installed already says so and offers nothing; without a
 * single selected project nothing is installed from here (the project picker of All Projects is not in this view).
 */
export function BrowseResults({ announce }: BrowseResultsProps): React.JSX.Element {
    const search = useSearch();
    const installed = useInstalled();
    const { isPackageBusy } = useOps();
    const { run } = useOpsActions();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const projectPath = installed.projectPath;
    const items = useMemo<Item[]>(() => search.results.map(result => ({ id: result.id, result })), [search.results]);
    const installedVersions = useMemo(
        () => new Map((installed.result?.packages ?? []).map(entry => [entry.id.toLowerCase(), entry.resolvedVersion ?? entry.version])),
        [installed.result],
    );

    const { status, query, results } = search;
    useEffect(() => {
        if (status === 'ready') {
            announce(results.length === 0 ? `No results for "${query}"` : `${results.length} ${results.length === 1 ? 'package' : 'packages'} found for "${query}"`);
        }
        // One announcement per answer: `results` changes with each, the rest belongs to it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results, status]);

    const install = ({ result }: Item): void => {
        if (projectPath === null) {
            announce('Select a single project to install packages from this view.');
            return;
        }
        const installedVersion = installedVersions.get(result.id.toLowerCase());
        if (installedVersion !== undefined) {
            announce(`${result.id} is already installed (${installedVersion}).`);
            return;
        }
        if (isPackageBusy(projectPath, result.id)) {
            return;
        }
        // The row keeps the source it was found on; which source restore takes the package from is restore's business.
        run('ops/install', { projectPath, packageId: result.id, version: result.version, sourceUrl: result.sourceUrl }).catch((error: unknown) => {
            announce(`Install of ${result.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    if (status === 'idle') {
        return <EmptyState message="Press Enter to search." />;
    }
    if (status === 'loading') {
        return <Skeleton density="compact" />;
    }
    if (status === 'error') {
        return <Banner severity="error" action={{ label: 'Retry', onClick: search.retry }}>{`The search failed: ${search.error?.message ?? 'unknown error'}`}</Banner>;
    }
    return (
        <div className="nuiget-sidebar-browse">
            {search.revalidating ? <ProgressBar label="Searching again" /> : null}
            {search.sourcesUnavailable
                ? <Banner severity="warning" data-testid="sidebar-browse-unavailable" action={{ label: 'Retry', onClick: search.retry }}>Some package sources could not be searched.</Banner>
                : null}
            {search.error ? <Banner severity="error" action={{ label: 'Retry', onClick: search.retry }}>{`The search failed: ${search.error.message}`}</Banner> : null}
            <Listbox
                items={items}
                label={`Search results for ${query}`}
                hint="Enter installs the package into the selected project."
                testId="sidebar-browse-list"
                density="compact"
                busy={search.revalidating}
                selectedId={selectedId}
                onSelect={item => setSelectedId(item.id)}
                onActivate={install}
                empty={<EmptyState message={search.sourcesUnavailable ? `No package source could be searched for "${query}".` : `No results for "${query}".`} />}
                renderRow={(item, placement) => {
                    const { result } = item;
                    const installedVersion = installedVersions.get(result.id.toLowerCase());
                    const busy = projectPath !== null && isPackageBusy(projectPath, result.id);
                    return (
                        <Row
                            {...placement}
                            itemId={result.id}
                            name={result.id}
                            version={result.version}
                            density="compact"
                            busy={busy}
                            status={busy ? 'Installing' : undefined}
                            badges={installedVersion !== undefined ? <Badge label="Installed" title={`Installed: ${installedVersion}`} /> : undefined}
                            actions={installedVersion !== undefined || projectPath === null ? undefined : (
                                <IconButton label={`Install ${result.id} ${result.version}`} tabIndex={-1} data-testid="row-action-install" onClick={() => install(item)}><PlusIcon /></IconButton>
                            )}
                        />
                    );
                }}
            />
        </div>
    );
}
