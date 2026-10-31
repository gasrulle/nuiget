import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, type PackageSearchResult } from '../../protocol';
import { useMessageBus } from '../shared/bus/useMessageBus';
import { Badge, Banner, EmptyState, IconButton, Listbox, PlusIcon, ProgressBar, Row, Skeleton } from '../shared/primitives';
import { useAllProjects } from '../shared/store/allProjects';
import { useInstalled } from '../shared/store/installed';
import { useOps, useOpsActions } from '../shared/store/ops';
import { useSearch } from '../shared/store/search';
import { useRowRequests } from './rowRequests';

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
 * version found into the selected project; a package installed already says so and offers nothing. Under All Projects,
 * Enter, the button and the menu ask the host for the row's actions (`ui/contextMenu`, browse path), whose QuickPick
 * picks the projects to install into, with where the package is installed already (interaction model §3). Into a
 * Central Package Management project the row first asks `cpm/preview`: a package that has a central entry already goes
 * through the actions menu, whose host modal lists the projects the central version reaches (ADR-004 tier 3, N77).
 */
export function BrowseResults({ announce }: BrowseResultsProps): React.JSX.Element {
    const search = useSearch();
    const installed = useInstalled();
    const { isPackageBusy } = useOps();
    const { run } = useOpsActions();
    const bus = useMessageBus();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Packages whose preview is being asked: a second Enter must not become a second install (it would rewrite the
    // props file and restore every consumer again). This ends when the ask settles; busy from `run()` on is the slice's.
    const asking = useRef(new Set<string>());

    const projectPath = installed.projectPath;
    const all = useAllProjects();
    const { menu, viewDetails } = useRowRequests(announce);
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

    /** Where a package is installed in All Projects: every listed project whose list has it, with its version. */
    const installedIn = (packageId: string): Array<{ projectPath: string; projectName: string; version: string }> => {
        const id = packageId.toLowerCase();
        return [...all.chunks.values()].flatMap(chunk => {
            const entry = chunk.result?.packages.find(candidate => candidate.id.toLowerCase() === id);
            return entry === undefined ? [] : [{ projectPath: chunk.projectPath, projectName: chunk.projectName, version: entry.resolvedVersion ?? entry.version }];
        });
    };
    const listedCount = all.chunks.size;
    const allProjectsMenu = (result: PackageSearchResult): void => {
        const where = installedIn(result.id);
        menu({
            packageId: result.id,
            context: 'browse',
            projectPath: ALL_PROJECTS,
            latestVersion: result.version,
            sourceUrl: result.sourceUrl,
            installedProjects: where,
            installedVersion: where[0]?.version,
            partiallyInstalled: where.length > 0 && where.length < listedCount,
        });
    };

    const install = ({ result }: Item): void => {
        if (all.active) {
            allProjectsMenu(result);
            return;
        }
        if (projectPath === null) {
            announce('There is no project to install into.');
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
        const submit = (): void => {
            run('ops/install', { projectPath, packageId: result.id, version: result.version, sourceUrl: result.sourceUrl }).catch((error: unknown) => {
                announce(`Install of ${result.id} failed: ${error instanceof Error ? error.message : String(error)}`);
            });
        };
        if (installed.result?.isCpm !== true) {
            submit();
            return;
        }
        const key = result.id.toLowerCase();
        if (asking.current.has(key)) {
            return;
        }
        asking.current.add(key);
        const openMenu = (): void => menu({ packageId: result.id, latestVersion: result.version, context: 'browse', projectPath, sourceUrl: result.sourceUrl });
        bus.request('cpm/preview', { projectPath, packageId: result.id, version: result.version }).then(
            ({ result: answer }) => (answer.preview === null ? submit() : openMenu()),
            // Never install on an error: the actions menu asks the host, whose gate and modal decide.
            () => openMenu(),
        ).finally(() => asking.current.delete(key));
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
                hint={all.active
                    ? 'Enter chooses what to do and the projects to install into.'
                    : 'Enter installs into the selected project (a package with a central entry in a CPM project: opens the actions menu); Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu.'}
                testId="sidebar-browse-list"
                density="compact"
                busy={search.revalidating}
                selectedId={selectedId}
                onSelect={item => setSelectedId(item.id)}
                onActivate={install}
                onSecondaryActivate={({ result }) => viewDetails(result.id, result.version)}
                onContextMenu={({ result }) => {
                    if (all.active) {
                        allProjectsMenu(result);
                    } else if (projectPath !== null) {
                        menu({ packageId: result.id, installedVersion: installedVersions.get(result.id.toLowerCase()), latestVersion: result.version, context: 'browse', projectPath, sourceUrl: result.sourceUrl });
                    }
                }}
                empty={<EmptyState message={search.sourcesUnavailable ? `No package source could be searched for "${query}".` : `No results for "${query}".`} />}
                renderRow={(item, placement) => {
                    const { result } = item;
                    const installedVersion = all.active ? undefined : installedVersions.get(result.id.toLowerCase());
                    const busy = projectPath !== null && isPackageBusy(projectPath, result.id);
                    const where = all.active ? installedIn(result.id) : [];
                    let badge: React.ReactNode;
                    if (installedVersion !== undefined) {
                        badge = <Badge label="Installed" title={`Installed: ${installedVersion}`} />;
                    } else if (where.length > 0 && where.length === listedCount) {
                        badge = <Badge label="Installed" title={`Installed in every project: ${where.map(entry => `${entry.projectName} ${entry.version}`).join(', ')}`} />;
                    } else if (where.length > 0) {
                        badge = <Badge label={`Installed in ${where.length} of ${listedCount}`} title={`Installed in ${where.length} of ${listedCount} projects: ${where.map(entry => `${entry.projectName} ${entry.version}`).join(', ')}`} />;
                    }
                    return (
                        <Row
                            {...placement}
                            itemId={result.id}
                            name={result.id}
                            version={result.version}
                            busy={busy}
                            status={busy ? 'Installing' : undefined}
                            badges={badge}
                            actions={installedVersion !== undefined || (projectPath === null && !all.active) ? undefined : (
                                <IconButton label={`Install ${result.id} ${result.version}`} tabIndex={-1} data-testid="row-action-install" onClick={() => install(item)}><PlusIcon /></IconButton>
                            )}
                        />
                    );
                }}
            />
        </div>
    );
}
