import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS } from '../../protocol';
import { useMessageBus } from '../shared/bus/useMessageBus';
import { Banner, Checkbox, cssVars, EmptyState, IconButton, LiveStatus, LoadingIcon, Sash, Select, SyncIcon } from '../shared/primitives';
import { FILTER_PREFIXES, parseSearchQuery, type SearchMode } from '../shared/search/parseSearchQuery';
import { SearchBox } from '../shared/search/SearchBox';
import { useDetailsActions } from '../shared/store/details';
import { useProjects } from '../shared/store/projects';
import { useSearch } from '../shared/store/search';
import { useSession, useSessionActions } from '../shared/store/session';
import { useShellChrome } from '../shared/shellChrome';
import type { ViewStateStore } from '../shared/viewState';
import { useInstallAction, type InstallAction } from './features/details/useInstallAction';
import { useSearchTyping } from './features/search/useSearchTyping';
import { CentralUpdateDialog } from './features/updates/CentralUpdateDialog';
import { useCentralChange, type CentralChange } from './features/updates/useCentralChange';
import { SourcesControl } from './features/sources/SourcesControl';
import { MainTabs } from './MainTabs';
import { RefreshBar } from './RefreshBar';
import { clampTo, useSplitBounds } from './useSplitBounds';

export type MainTab = 'installed' | 'updates';

/** What a list in a tab is given by the shell. */
export interface ListView {
    /** The text after `@installed`, `@updates` or `@vulnerable`; empty for none. */
    filter: string;
    /** `@vulnerable`: the Installed list shows vulnerable packages only. */
    vulnerableOnly: boolean;
    /** Says a sentence through the one live region of the panel. */
    announce: (message: string) => void;
    /** Asks the panel's one central-change dialog for a centrally managed row's update. */
    central: Pick<CentralChange, 'ask'>;
}

/** What the browse results are given by the shell. */
export interface BrowseView {
    /** The text in the box, which Enter searches for. */
    text: string;
    announce: (message: string) => void;
    /** The panel's one install action (Ctrl+Enter on a row). */
    install: InstallAction;
}

/** What the details of the selected package are given by the shell. */
export interface DetailsView {
    announce: (message: string) => void;
    /** The panel's one install action (Install). */
    install: InstallAction;
    /** Asks the panel's one central-change dialog for a centrally managed package's update. */
    central: Pick<CentralChange, 'ask'>;
}

export interface MainShellProps {
    /** The list of the Installed tab. */
    installed?: (view: ListView) => React.ReactNode;
    /** The list of the Updates tab. */
    updates?: (view: ListView) => React.ReactNode;
    /** The browse results; they take the place of the tabs while the box holds a browse search. */
    browse?: (view: BrowseView) => React.ReactNode;
    /** The details of the selected package; without it, the details pane says how to get one. */
    details?: (view: DetailsView) => React.ReactNode;
    /** The webview's state store: the chosen tab is kept there across a reload of the panel. */
    viewState?: ViewStateStore;
}

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
    const [query, setQuery] = useState('');
    const [chosenTab, setChosenTab] = useState<MainTab>(() => readMainTab(viewState));
    const [split, setSplit] = useState(SPLIT.initial);
    const splitRef = useRef<HTMLDivElement>(null);
    const bounds = useSplitBounds(splitRef, SPLIT);
    // The user moved the sash before the kept position arrived: the kept one no longer applies.
    const moved = useRef(false);
    const { announce, live, searchRef } = useShellChrome();
    // One central change and one install action for the whole panel, handed to the features (X53, N77).
    const central = useCentralChange(announce);
    const installAction = useInstallAction(announce, central.ask);
    const listPaneId = `${useId()}-list`;

    // The split is a layout preference the host keeps (ADR-001); once per page, under StrictMode too.
    const askedLayout = useRef(false);
    useEffect(() => {
        if (!askedLayout.current) {
            askedLayout.current = true;
            bus.request('layout/get', {}).then(({ result }) => {
                const kept = result.splitPosition;
                if (typeof kept === 'number' && Number.isFinite(kept) && !moved.current) {
                    // A share the measured px bounds clamp when shown (`shownSplit`); only a share outside the split is refused.
                    setSplit(Math.min(100, Math.max(0, kept)));
                }
            }, () => undefined);
        }
    }, [bus]);

    const shownSplit = clampTo(split, bounds);

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
    const typing = useSearchTyping({ text: query, setText: setQuery, browsing, focused, announce, install: installAction });
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
    const view: ListView = { filter: modeTab ? parsed.filterText : '', vulnerableOnly: parsed.mode === 'vulnerable', announce, central };

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

    const supported = projects ?? [];
    const hasSession = session !== undefined;
    return (
        <main className="nuiget-main" data-testid="nuiget-app">
            <header className="nuiget-main-header" data-testid="main-header">
                <div className="nuiget-main-header-row">
                    <h1 className="nuiget-main-title">Manage NuGet packages</h1>
                    <div className="nuiget-main-controls">
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
                        <SourcesControl announce={announce} end={<IconButton label="Refresh" data-testid="refresh-button" disabled={refreshing} onClick={refresh}>{refreshing ? <LoadingIcon /> : <SyncIcon />}</IconButton>} />
                    </div>
                </div>
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
                        suggestError={typing.suggestError}
                        onRetrySuggestions={typing.retrySuggestions}
                        versions={typing.expanded}
                        onExpandSuggestion={typing.expand}
                        onCollapseVersions={typing.collapse}
                        onPickVersion={typing.pickVersion}
                        onQuickInstall={typing.quickInstall}
                        onFocusChange={setFocused}
                    />
                </div>
                <RefreshBar refreshing={refreshing} browsing={browsing} />
            </header>
            {projectsError ? <Banner severity="error">{`Projects could not be listed: ${projectsError.message}`}</Banner> : null}
            <div className="nuiget-main-split" ref={splitRef} style={cssVars({ '--nuiget-split': `${shownSplit}%` })}>
                <div className="nuiget-main-list" id={listPaneId}>
                    {browsing ? browse?.({ text: query, announce, install: installAction }) : (
                        <MainTabs selected={tab} onSelect={selectTab}>
                            {tab === 'installed' ? installed?.(view) : updates?.(view)}
                        </MainTabs>
                    )}
                </div>
                <Sash orientation="vertical" label="Resize the package list" value={shownSplit} min={bounds.min} max={bounds.max} defaultValue={clampTo(SPLIT.initial, bounds)}
                    controls={listPaneId}
                    onChange={value => {
                        moved.current = true;
                        setSplit(value);
                    }}
                    onChangeEnd={value => {
                        bus.request('layout/set', { splitPosition: clampTo(value, bounds) }).catch(() => undefined);
                    }}
                />
                <section className="nuiget-main-details" data-testid="package-details-panel" aria-label="Package details">
                    {details?.({ announce, install: installAction, central }) ?? <EmptyState data-testid="details-empty" message="Select a package to see its details." />}
                </section>
            </div>
            <CentralUpdateDialog request={central.request} onClose={central.close} onConfirm={central.confirm} />
            <LiveStatus message={live.message} repeat={live.repeat} />
        </main>
    );
}
