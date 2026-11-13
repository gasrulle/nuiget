import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { InstalledPackage, PackageSearchResult } from '../../protocol';
import { useMessageBus } from '../shared/bus/useMessageBus';
import { allProjectsBrowseContext, browseRowContext, installedProjectsOf, whyNotRemovable } from '../shared/installed/rules';
import { Badge, Banner, EmptyState, IconButton, Listbox, openRowMenu, PlusIcon, ProgressBar, Row, TrashIcon } from '../shared/primitives';
import { useAllProjects } from '../shared/store/allProjects';
import { useInstalled } from '../shared/store/installed';
import { useOps, useOpsActions } from '../shared/store/ops';
import { useSearch } from '../shared/store/search';
import { sentence } from '../shared/updates/sentence';
import { usePackageRows } from './packageRows';
import { useRowRequests } from './rowRequests';

interface Item {
    id: string;
    result: PackageSearchResult;
}

export interface BrowseResultsProps {
    /** Something to say to a screen reader that no outcome of an operation says. */
    announce: (message: string) => void;
}

/** The 2 px bar at the top of the results while a search runs or runs again; the list does not move under it (DS-STATE-2). */
const bar = (label: string): React.JSX.Element => <div className="nuiget-sidebar-progress"><ProgressBar label={label} data-testid="sidebar-browse-progress" /></div>;

/**
 * The flat browse results of the sidebar (interaction model §2): compact rows, Enter or the row's button installs the
 * version found into the selected project; a package installed already says so on Enter, and its row's button or Delete
 * uninstalls it from that project, as an Installed row does (SB9, UX-P3.8). Under All Projects, Enter, the button and
 * the menu open the row's actions (VS Code's `webview/context` menu), whose host command picks the projects, with where
 * the package is installed already (interaction model §3): the button is Uninstall... on a package installed in every
 * project, Install... otherwise, and Delete names the menu. Into a Central Package Management project the row first asks
 * `cpm/preview`: a package that has a central entry already goes through the actions menu, whose host modal lists the
 * projects the central version reaches (ADR-004 tier 3, N77). A first search shows the bar alone (rows first under it
 * are D56's).
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
    const { viewDetails } = useRowRequests(announce);
    const { uninstall, busyStatus } = usePackageRows(announce);
    const items = useMemo<Item[]>(() => search.results.map(result => ({ id: result.id, result })), [search.results]);
    const installedEntries = useMemo(
        () => new Map<string, InstalledPackage>((installed.result?.packages ?? []).map(entry => [entry.id.toLowerCase(), entry])),
        [installed.result],
    );
    const installedVersions = useMemo(
        () => new Map([...installedEntries].map(([id, entry]) => [id, entry.resolvedVersion ?? entry.version])),
        [installedEntries],
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
    const listedCount = all.chunks.size;
    const whereInstalled = useMemo(() => installedProjectsOf(all.chunks.values()), [all.chunks]);
    // The row that asked, whatever has the focus when the answer arrives; gone from the list, the Enter says so.
    const openMenuOf = (result: PackageSearchResult): void => {
        const row = document.querySelector(`[data-testid="sidebar-browse-list"] [data-testid="package-row-${result.id.toLowerCase()}"]`);
        if (row === null) {
            announce(`The actions of ${result.id} are on its row, which is no longer shown.`);
            return;
        }
        openRowMenu(row);
    };

    const install = ({ result }: Item): void => {
        if (all.active) {
            openMenuOf(result);
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
        const openMenu = (): void => openMenuOf(result);
        bus.request('cpm/preview', { projectPath, packageId: result.id, version: result.version }).then(
            ({ result: answer }) => (answer.preview === null ? submit() : openMenu()),
            // Never install on an error: the actions menu asks the host, whose gate and modal decide.
            () => openMenu(),
        ).finally(() => asking.current.delete(key));
    };

    /** Delete: an installed package of the selected project is uninstalled from it; under All Projects the menu does it. */
    const remove = ({ result }: Item): void => {
        if (all.active) {
            if ((whereInstalled.get(result.id.toLowerCase()) ?? []).length > 0) {
                announce(`Uninstall ${result.id} from the actions menu (Shift+F10), which asks for the projects.`);
            }
            return;
        }
        const entry = installedEntries.get(result.id.toLowerCase());
        if (entry === undefined || projectPath === null || installed.result === undefined) {
            return;
        }
        uninstall(projectPath, installed.result, entry);
    };

    if (status === 'idle') {
        return <EmptyState message="Press Enter to search." />;
    }
    if (status === 'loading') {
        return <div className="nuiget-sidebar-browse">{bar('Searching')}</div>;
    }
    if (status === 'error') {
        return (
            <div className="nuiget-sidebar-browse">
                <Banner severity="error" data-testid="sidebar-browse-error" action={{ label: 'Retry', onClick: search.retry }}>{`The search failed: ${sentence(search.error?.message ?? 'unknown error')}`}</Banner>
            </div>
        );
    }
    return (
        <div className="nuiget-sidebar-browse">
            {search.revalidating ? bar('Searching again') : null}
            {search.sourcesUnavailable
                ? <Banner severity="warning" data-testid="sidebar-browse-unavailable" action={{ label: 'Retry', onClick: search.retry }}>Some package sources could not be searched.</Banner>
                : null}
            {search.error ? <Banner severity="error" data-testid="sidebar-browse-error" action={{ label: 'Retry', onClick: search.retry }}>{`The search failed: ${sentence(search.error.message)}`}</Banner> : null}
            <Listbox
                items={items}
                label={`Search results for ${query}`}
                hint={all.active
                    ? 'Enter chooses what to do and the projects to install into or uninstall from; Delete names the actions menu (Shift+F10), which uninstalls.'
                    : 'Enter installs into the selected project (a package with a central entry in a CPM project: opens the actions menu); Delete uninstalls an installed package from it; Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu.'}
                testId="sidebar-browse-list"
                density="compact"
                busy={search.revalidating}
                selectedId={selectedId}
                onSelect={item => setSelectedId(item.id)}
                onActivate={install}
                onSecondaryActivate={({ result }) => viewDetails(result.id, result.version)}
                onDelete={remove}
                empty={<EmptyState message={search.sourcesUnavailable ? `No package source could be searched for "${query}".` : `No results for "${query}".`} data-testid={search.sourcesUnavailable ? undefined : 'sidebar-browse-empty'} />}
                renderRow={(item, placement) => {
                    const { result } = item;
                    const installedVersion = all.active ? undefined : installedVersions.get(result.id.toLowerCase());
                    const entry = all.active ? undefined : installedEntries.get(result.id.toLowerCase());
                    const removable = entry !== undefined && installed.result !== undefined && whyNotRemovable(entry, installed.result) === undefined;
                    const busy = projectPath !== null && isPackageBusy(projectPath, result.id);
                    const where = all.active ? whereInstalled.get(result.id.toLowerCase()) ?? [] : [];
                    const everywhere = where.length > 0 && where.length === listedCount;
                    let action: React.ReactNode;
                    if (all.active) {
                        action = everywhere
                            ? <IconButton label={`Uninstall ${result.id}...`} tabIndex={-1} data-testid="row-action-uninstall" onClick={() => openMenuOf(result)}><TrashIcon /></IconButton>
                            : <IconButton label={`Install ${result.id} ${result.version}...`} tabIndex={-1} data-testid="row-action-install" onClick={() => install(item)}><PlusIcon /></IconButton>;
                    } else if (entry !== undefined) {
                        action = removable && projectPath !== null && installed.result !== undefined
                            ? <IconButton label={`Uninstall ${result.id}`} tabIndex={-1} data-testid="row-action-uninstall" onClick={() => remove(item)}><TrashIcon /></IconButton>
                            : undefined;
                    } else if (projectPath !== null) {
                        action = <IconButton label={`Install ${result.id} ${result.version}`} tabIndex={-1} data-testid="row-action-install" onClick={() => install(item)}><PlusIcon /></IconButton>;
                    }
                    let badge: React.ReactNode;
                    if (installedVersion !== undefined) {
                        badge = <Badge label="Installed" title={`Installed: ${installedVersion}`} />;
                    } else if (everywhere) {
                        badge = <Badge label="Installed" title={`Installed in every project: ${where.map(entry => `${entry.projectName} ${entry.version}`).join(', ')}`} />;
                    } else if (where.length > 0) {
                        badge = <Badge label={`Installed in ${where.length} of ${listedCount}`} title={`Installed in ${where.length} of ${listedCount} projects: ${where.map(entry => `${entry.projectName} ${entry.version}`).join(', ')}`} />;
                    }
                    return (
                        <Row
                            {...placement}
                            vscodeContext={all.active ? allProjectsBrowseContext(result, whereInstalled.get(result.id.toLowerCase()) ?? [], listedCount) : projectPath === null ? undefined : browseRowContext(result, projectPath, installedVersions.get(result.id.toLowerCase()))}
                            itemId={result.id}
                            name={result.id}
                            version={result.version}
                            busy={busy}
                            status={busy && projectPath !== null ? busyStatus(projectPath, result.id) : undefined}
                            badges={badge}
                            actions={action}
                        />
                    );
                }}
            />
        </div>
    );
}
