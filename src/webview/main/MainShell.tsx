import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS } from '../../protocol';
import { useMessageBus } from '../shared/bus/useMessageBus';
import { Banner, cssVars, EmptyState, IconButton, LiveStatus, Sash, SyncIcon, Tabs, type TabItem } from '../shared/primitives';
import { parseSearchQuery, type SearchMode } from '../shared/search/parseSearchQuery';
import { useOps } from '../shared/store/ops';
import { describeOutcome } from '../shared/store/outcomes';
import { useProjects } from '../shared/store/projects';
import { useSession, useSessionActions } from '../shared/store/session';
import { useUpdates } from '../shared/store/updates';

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

export interface MainShellProps {
    /** The list of the Installed tab. */
    installed?: (view: ListView) => React.ReactNode;
    /** The list of the Updates tab. */
    updates?: (view: ListView) => React.ReactNode;
    /** The details of the selected package; without one, the details pane says how to get one. */
    details?: React.ReactNode;
}

const TABS: ReadonlyArray<TabItem<MainTab>> = [
    { id: 'installed', label: 'Installed', 'data-testid': 'installed-tab' },
    { id: 'updates', label: 'Updates', 'data-testid': 'updates-tab' },
];

/** The tab a filter mode belongs to; the other modes leave the choice to the user. */
const TAB_OF_MODE: Partial<Record<SearchMode, MainTab>> = { installed: 'installed', vulnerable: 'installed', updates: 'updates' };

const SPLIT = { min: 25, max: 75, initial: 50 };

/**
 * The 2.0 main panel around its features (interaction model §1 and §2): the header with the shared context
 * (project, source, prerelease) and refresh, the unified search box, the Installed and Updates tabs and the split
 * between the list and the details. The search box selects the tab of a filter mode (`@installed`, `@updates`,
 * `@vulnerable`) and hands its text to the list; plain text is a browse search, which the search feature runs.
 */
export function MainShell({ installed, updates, details }: MainShellProps): React.JSX.Element {
    const bus = useMessageBus();
    const { session } = useSession();
    const { set } = useSessionActions();
    const { projects, error: projectsError } = useProjects();
    const updatesSlice = useUpdates();
    const [query, setQuery] = useState('');
    const [chosenTab, setChosenTab] = useState<MainTab>('installed');
    const [split, setSplit] = useState(SPLIT.initial);
    const [said, setSaid] = useState<{ message: string | null; count: number }>({ message: null, count: 0 });
    const searchRef = useRef<HTMLInputElement>(null);
    const listPaneId = `${useId()}-list`;

    const announce = useCallback((message: string): void => setSaid(previous => ({ message, count: previous.count + 1 })), []);

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
        }
    }), [bus]);

    const parsed = parseSearchQuery(query);
    const modeTab = TAB_OF_MODE[parsed.mode];
    const tab = modeTab ?? chosenTab;
    // The badge counts the updates the host answered; while it checks or cannot say, there is no number.
    const updateCount = updatesSlice.status === 'ready' && !updatesSlice.sourcesUnavailable ? updatesSlice.rows.length : undefined;
    const tabs = TABS.map(item => (item.id === 'updates' && updateCount !== undefined ? { ...item, count: updateCount } : item));
    const view: ListView = { filter: modeTab ? parsed.filterText : '', vulnerableOnly: parsed.mode === 'vulnerable', announce };

    const selectTab = (next: MainTab): void => {
        setChosenTab(next);
        // A filter belongs to the list it names: another tab starts unfiltered.
        if (modeTab !== undefined && modeTab !== next) {
            setQuery('');
        }
    };

    const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
        if (event.key !== 'Escape') {
            return;
        }
        event.preventDefault();
        if (query.length > 0) {
            setQuery('');
        } else {
            event.currentTarget.blur();
        }
    };

    const refresh = (): void => {
        bus.request('refresh/all', {}).then(() => announce('Refreshed'), () => announce('Refresh failed'));
    };

    const supported = projects ?? [];
    const hasSession = session !== undefined;
    return (
        <main className="nuiget-main" data-testid="nuiget-app">
            <header className="nuiget-main-header">
                <select
                    className="nuiget-main-select"
                    data-testid="project-selector"
                    aria-label="Project"
                    value={session?.selectedProject ?? ''}
                    disabled={!hasSession || supported.length === 0}
                    onChange={event => set({ selectedProject: event.target.value })}
                >
                    {supported.length === 0 ? <option value={session?.selectedProject ?? ''}>{projects === undefined ? 'Loading projects…' : 'No projects'}</option> : null}
                    {supported.length > 1 ? <option value={ALL_PROJECTS}>{`All Projects (${supported.length})`}</option> : null}
                    {supported.map(project => <option key={project.path} value={project.path} title={project.path}>{project.name}</option>)}
                </select>
                {/* The source the session uses; the list of sources to choose from comes with the sources feature. */}
                <select className="nuiget-main-select" data-testid="source-selector" aria-label="Package source" value={session?.selectedSource ?? 'all'} disabled>
                    <option value={session?.selectedSource ?? 'all'}>{session === undefined || session.selectedSource === 'all' ? 'All sources' : session.selectedSource}</option>
                </select>
                <label className="nuiget-main-toggle">
                    <input type="checkbox" checked={session?.includePrerelease ?? false} disabled={!hasSession} onChange={event => set({ includePrerelease: event.target.checked })} />
                    Include prerelease
                </label>
                <IconButton label="Refresh" onClick={refresh} className="nuiget-main-refresh"><SyncIcon /></IconButton>
            </header>
            <div className="nuiget-main-search" role="search">
                <input
                    ref={searchRef}
                    className="nuiget-main-search-input"
                    type="search"
                    data-testid="search-input"
                    aria-label="Search packages, or filter with @installed, @updates or @vulnerable"
                    placeholder="Search packages, or filter: @installed, @updates, @vulnerable"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    onKeyDown={onSearchKeyDown}
                />
            </div>
            {projectsError ? <Banner severity="error">{`Projects could not be listed: ${projectsError.message}`}</Banner> : null}
            <div className="nuiget-main-split" style={cssVars({ '--nuiget-split': `${split}%` })}>
                <div className="nuiget-main-list" id={listPaneId}>
                    <Tabs tabs={tabs} selected={tab} onSelect={selectTab} label="Package lists" data-testid="tab-bar">
                        {tab === 'installed' ? installed?.(view) : updates?.(view)}
                    </Tabs>
                </div>
                <Sash orientation="vertical" label="Resize the package list" value={split} min={SPLIT.min} max={SPLIT.max} defaultValue={SPLIT.initial} controls={listPaneId} onChange={setSplit} />
                <section className="nuiget-main-details" data-testid="package-details-panel" aria-label="Package details">
                    {details ?? <EmptyState message="Select a package to see its details." />}
                </section>
            </div>
            <LiveStatus message={said.message} repeat={said.count} />
        </main>
    );
}
