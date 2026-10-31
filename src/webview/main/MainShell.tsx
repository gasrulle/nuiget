import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS, type PackageMetadataLite } from '../../protocol';
import { useMessageBus } from '../shared/bus/useMessageBus';
import { Banner, Checkbox, cssVars, EmptyState, IconButton, LiveStatus, LoadingIcon, ProgressBar, Sash, Select, SyncIcon, Tabs, type TabItem } from '../shared/primitives';
import { FILTER_PREFIXES, parseSearchQuery, type SearchMode } from '../shared/search/parseSearchQuery';
import { SearchBox } from '../shared/search/SearchBox';
import { useAllProjects } from '../shared/store/allProjects';
import { useDetailsActions } from '../shared/store/details';
import { useInstalled } from '../shared/store/installed';
import { useOps } from '../shared/store/ops';
import { describeOutcome } from '../shared/store/outcomes';
import { useProjects } from '../shared/store/projects';
import { useSearch } from '../shared/store/search';
import { useSession, useSessionActions } from '../shared/store/session';
import { useUpdates } from '../shared/store/updates';
import type { ViewStateStore } from '../shared/viewState';
import { useSearchTyping } from './features/search/useSearchTyping';
import { CentralUpdateDialog } from './features/updates/CentralUpdateDialog';
import { SourcesControl } from './features/sources/SourcesControl';

export type MainTab = 'installed' | 'updates';

/** What a list in a tab is given by the shell. */
export interface ListView {
    /** The text after `@installed`, `@updates` or `@vulnerable`; empty for none. */
    filter: string;
    /** `@vulnerable`: the Installed list shows vulnerable packages only. */
    vulnerableOnly: boolean;
    /** Says a sentence through the one live region of the panel. */
    announce: (message: string) => void;
}

/** What the browse results are given by the shell. */
export interface BrowseView {
    /** The text in the box, which Enter searches for. */
    text: string;
    announce: (message: string) => void;
}

export interface MainShellProps {
    /** The list of the Installed tab. */
    installed?: (view: ListView) => React.ReactNode;
    /** The list of the Updates tab. */
    updates?: (view: ListView) => React.ReactNode;
    /** The browse results; they take the place of the tabs while the box holds a browse search. */
    browse?: (view: BrowseView) => React.ReactNode;
    /** The details of the selected package; without it, the details pane says how to get one. */
    details?: (view: { announce: (message: string) => void }) => React.ReactNode;
    /** The webview's state store: the chosen tab is kept there across a reload of the panel. */
    viewState?: ViewStateStore;
}

const TABS: ReadonlyArray<TabItem<MainTab>> = [
    { id: 'installed', label: 'Installed', 'data-testid': 'installed-tab' },
    { id: 'updates', label: 'Updates', 'data-testid': 'updates-tab' },
];

/** The tab a filter mode belongs to; the other modes leave the choice to the user. */
const TAB_OF_MODE: Partial<Record<SearchMode, MainTab>> = { installed: 'installed', vulnerable: 'installed', updates: 'updates' };

const SPLIT = { min: 25, max: 75, initial: 35 };

/** The tab kept in the webview state; anything else, or a store that cannot be read, is Installed. */
function readMainTab(store: ViewStateStore | undefined): MainTab {
    try {
        const tab = (store?.getState() as { tab?: unknown } | undefined)?.tab;
        return tab === 'updates' ? 'updates' : 'installed';
    } catch {
        return 'installed';
    }
}

const isVulnerable = (metadata: ReadonlyMap<string, PackageMetadataLite> | undefined, id: string): boolean =>
    (metadata?.get(id.toLowerCase())?.vulnerabilities?.length ?? 0) > 0;

/**
 * The 2.0 main panel around its features (interaction model §1 and §2): the header with the shared context
 * (project, source, prerelease) and refresh, the unified search box, the Installed and Updates tabs and the split
 * between the list and the details. The search box selects the tab of a filter mode (`@installed`, `@updates`,
 * `@vulnerable`) and hands its text to the list; plain text is a browse search: Enter runs it in the search slice and
 * the browse results take the place of the tabs; typing, suggestions and `ui/navigateToPackage` are the search feature's.
 */
export function MainShell({ installed, updates, browse, details, viewState }: MainShellProps): React.JSX.Element {
    const bus = useMessageBus();
    const { session } = useSession();
    const { set } = useSessionActions();
    const { projects, error: projectsError } = useProjects();
    const updatesSlice = useUpdates();
    const installedSlice = useInstalled();
    const [query, setQuery] = useState('');
    const [chosenTab, setChosenTab] = useState<MainTab>(() => readMainTab(viewState));
    const [split, setSplit] = useState(SPLIT.initial);
    // The user moved the sash before the kept position arrived: the kept one no longer applies.
    const moved = useRef(false);
    const [said, setSaid] = useState<{ message: string | null; count: number }>({ message: null, count: 0 });
    const searchRef = useRef<HTMLInputElement>(null);
    const listPaneId = `${useId()}-list`;

    const announce = useCallback((message: string): void => setSaid(previous => ({ message, count: previous.count + 1 })), []);

    // The two marks the host logs when `nuiget.enablePerformanceLogging` is on (N81): once each, under StrictMode too.
    const markedReady = useRef(false);
    useEffect(() => {
        if (!markedReady.current) {
            markedReady.current = true;
            bus.request('perf/mark', { name: 'webviewReady', detail: `${Math.round(performance.now())} ms after load` }).catch(() => undefined);
            // The split is a layout preference the host keeps (ADR-001); once per page, under StrictMode too.
            bus.request('layout/get', {}).then(({ result }) => {
                const kept = result.splitPosition;
                if (typeof kept === 'number' && Number.isFinite(kept) && !moved.current) {
                    setSplit(Math.min(SPLIT.max, Math.max(SPLIT.min, kept)));
                }
            }, () => undefined);
        }
    }, [bus]);

    const keepTab = useCallback((next: MainTab): void => {
        if (viewState === undefined) {
            return;
        }
        try {
            const kept = viewState.getState();
            viewState.setState({ ...(typeof kept === 'object' && kept !== null ? kept : {}), tab: next });
        } catch {
            // A store that cannot be written keeps nothing; the tab still changes.
        }
    }, [viewState]);
    const markedRender = useRef(false);
    const firstListShown = installedSlice.status === 'ready' && installedSlice.result !== undefined;
    useEffect(() => {
        if (firstListShown && !markedRender.current) {
            markedRender.current = true;
            bus.request('perf/mark', { name: 'firstUsefulRender', detail: `${Math.round(performance.now())} ms after load` }).catch(() => undefined);
        }
    }, [bus, firstListShown]);

    useEffect(() => bus.onEvent('ui/focusSearch', () => searchRef.current?.focus()), [bus]);
    // How every operation ended, on whichever surface it started: once per outcome (`sequence` goes up with each).
    const { last } = useOps();
    const sequence = last?.sequence;
    useEffect(() => {
        if (last !== undefined) {
            announce(describeOutcome(last.outcome));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sequence, announce]);
    // The host has applied the project already; the event says which tab to show it on.
    useEffect(() => bus.onEvent('ui/selectProject', ({ initialTab }) => {
        if (initialTab) {
            setQuery('');
            setChosenTab(initialTab);
            keepTab(initialTab);
        }
    }), [bus, keepTab]);

    const parsed = parseSearchQuery(query);
    const browsing = parsed.mode === 'browse';
    const [focused, setFocused] = useState(false);
    const typing = useSearchTyping({ text: query, setText: setQuery, browsing, focused, announce });
    // Leaving browse (an empty box, a filter) ends the search and cancels what it still asks.
    const { clear: clearSearch } = useSearch();
    useEffect(() => {
        if (!browsing) {
            clearSearch();
        }
    }, [browsing, clearSearch]);
    const modeTab = TAB_OF_MODE[parsed.mode];
    const tab = modeTab ?? chosenTab;
    // The details pane shows the active view's own selection; Browse starts without one.
    const { showView } = useDetailsActions();
    useEffect(() => showView(browsing ? 'browse' : tab), [browsing, tab, showView]);
    // The badge counts the updates the host answered; while it checks or cannot say, there is no number.
    const allProjects = useAllProjects();
    const all = allProjects.updates;
    // All Projects: the sum of the rows once every listed project has answered and every source was checked.
    const allCount = all.status === 'ready' && !all.sourcesUnavailable && (all.projects ?? []).every(project => all.chunks.get(project.path)?.error === undefined && all.chunks.has(project.path)) ? [...all.chunks.values()].reduce((count, chunk) => count + chunk.updates.length, 0) || undefined : undefined;
    // No `0` (MU6): an empty answer leaves the tab without a number.
    const updateCount = session?.selectedProject === ALL_PROJECTS ? allCount : updatesSlice.status === 'ready' && !updatesSlice.sourcesUnavailable ? updatesSlice.rows.length || undefined : undefined;
    // The Installed badge counts the packages the host listed: no number while loading, for an unsupported project
    // without packages, or for none at all (the Updates rule, MU6). All Projects counts once every project answered.
    const allListed = allProjects.status === 'ready' && (allProjects.projects ?? []).every(project => allProjects.chunks.get(project.path)?.result !== undefined);
    const allInstalled = allListed ? [...allProjects.chunks.values()].reduce((count, chunk) => count + (chunk.result?.packages.length ?? 0), 0) : 0;
    const singleInstalled = installedSlice.status === 'ready' ? installedSlice.result?.packages.length ?? 0 : 0;
    const installedCount = (session?.selectedProject === ALL_PROJECTS ? allInstalled : singleInstalled) || undefined;
    const counts: Partial<Record<string, number>> = { installed: installedCount, updates: updateCount };
    // The vulnerable packages, once the lite metadata is known: no number while it is not (empty is not unknown).
    const singleVulnerable = installedSlice.metadata.size === 0 ? undefined : (installedSlice.result?.packages.filter(entry => isVulnerable(installedSlice.metadata, entry.id)).length || undefined);
    const allVulnerable = allProjects.metadata.size === 0 ? undefined : [...allProjects.chunks.values()].reduce((count, chunk) => count + (chunk.result?.packages.filter(entry => isVulnerable(allProjects.metadata.get(chunk.projectPath), entry.id)).length ?? 0), 0) || undefined;
    const vulnerableCount = session?.selectedProject === ALL_PROJECTS ? allVulnerable : singleVulnerable;
    const tabs = TABS.map(item => {
        const counted = counts[item.id] !== undefined ? { ...item, count: counts[item.id] } : item;
        return item.id === 'installed' && vulnerableCount !== undefined
            ? { ...counted, badge: { label: String(vulnerableCount), title: `${vulnerableCount} package${vulnerableCount === 1 ? '' : 's'} with known vulnerabilities`, tone: 'error' as const } }
            : counted;
    });
    const view: ListView = { filter: modeTab ? parsed.filterText : '', vulnerableOnly: parsed.mode === 'vulnerable', announce };

    const selectTab = (next: MainTab): void => {
        setChosenTab(next);
        keepTab(next);
        // A filter belongs to the list it names: another tab starts unfiltered.
        if (modeTab !== undefined && modeTab !== next) {
            setQuery('');
        }
    };

    const submit = (text: string): void => {
        if (parseSearchQuery(text).mode === 'browse') {
            typing.submit(text);
        }
    };

    const [refreshing, setRefreshing] = useState(false);
    const refresh = (): void => {
        setRefreshing(true);
        bus.request('refresh/all', {}).then(() => {
            announce('Refreshed');
            setRefreshing(false);
        }, () => {
            announce('Refresh failed');
            setRefreshing(false);
        });
    };
    // The bar under the search box while the shown list asks again; Browse draws its own.
    const revalidating = tab === 'installed' ? installedSlice.revalidating || allProjects.revalidating : updatesSlice.revalidating || allProjects.updates.revalidating;
    const showBar = refreshing || (!browsing && revalidating);

    const supported = projects ?? [];
    const hasSession = session !== undefined;
    return (
        <main className="nuiget-main" data-testid="nuiget-app">
            <header className="nuiget-main-header" data-testid="main-header">
                <h1 className="nuiget-main-title">Manage NuGet packages</h1>
                <label className="nuiget-main-toggle">
                    <Checkbox checked={session?.restoreEnabled ?? true} disabled={!hasSession} onChange={checked => set({ restoreEnabled: checked })} />
                    Restore after operations
                </label>
                <label className="nuiget-main-toggle">
                    <Checkbox checked={session?.includePrerelease ?? false} disabled={!hasSession} onChange={checked => set({ includePrerelease: checked })} />
                    Include prerelease
                </label>
                <Select
                    data-testid="project-selector"
                    aria-label="Project"
                    value={session?.selectedProject ?? ''}
                    disabled={!hasSession || supported.length === 0}
                    onChange={value => set({ selectedProject: value })}
                >
                    {supported.length === 0 ? <option value={session?.selectedProject ?? ''}>{projects === undefined ? 'Loading projects…' : 'No projects'}</option> : null}
                    {supported.length > 1 ? <option value={ALL_PROJECTS}>{`All Projects (${supported.length})`}</option> : null}
                    {supported.map(project => <option key={project.path} value={project.path} title={project.path}>{project.name}</option>)}
                </Select>
                <SourcesControl announce={announce} />
                <IconButton label="Refresh" data-testid="refresh-button" disabled={refreshing} onClick={refresh}>{refreshing ? <LoadingIcon /> : <SyncIcon />}</IconButton>
            </header>
            <div className="nuiget-main-search" role="search">
                <SearchBox
                    inputRef={searchRef}
                    testId="search-input"
                    label="Search packages, or filter with @installed, @updates or @vulnerable"
                    placeholder="Search packages, or filter: @installed, @updates, @vulnerable"
                    prefixes={FILTER_PREFIXES}
                    value={query}
                    onChange={setQuery}
                    onSubmit={submit}
                    suggestions={typing.suggestions}
                    onPickSuggestion={typing.pick}
                    pending={typing.suggesting}
                    versions={typing.expanded}
                    onExpandSuggestion={typing.expand}
                    onCollapseVersions={typing.collapse}
                    onPickVersion={typing.pickVersion}
                    onQuickInstall={typing.quickInstall}
                    onFocusChange={setFocused}
                />
                {showBar ? <ProgressBar label="Refreshing" /> : null}
            </div>
            {projectsError ? <Banner severity="error">{`Projects could not be listed: ${projectsError.message}`}</Banner> : null}
            <div className="nuiget-main-split" style={cssVars({ '--nuiget-split': `${split}%` })}>
                <div className="nuiget-main-list" id={listPaneId}>
                    {browsing ? browse?.({ text: query, announce }) : (
                        <Tabs tabs={tabs} selected={tab} onSelect={selectTab} label="Package lists" data-testid="tab-bar">
                            {tab === 'installed' ? installed?.(view) : updates?.(view)}
                        </Tabs>
                    )}
                </div>
                <Sash orientation="vertical" label="Resize the package list" value={split} min={SPLIT.min} max={SPLIT.max} defaultValue={SPLIT.initial}
                    controls={listPaneId}
                    onChange={value => {
                        moved.current = true;
                        setSplit(value);
                    }}
                    onChangeEnd={value => {
                        bus.request('layout/set', { splitPosition: value }).catch(() => undefined);
                    }}
                />
                <section className="nuiget-main-details" data-testid="package-details-panel" aria-label="Package details">
                    {details?.({ announce }) ?? <EmptyState message="Select a package to see its details." />}
                </section>
            </div>
            <CentralUpdateDialog request={typing.install.preview} onClose={typing.install.closePreview} onConfirm={typing.install.confirmPreview} />
            <LiveStatus message={said.message} repeat={said.count} />
        </main>
    );
}
