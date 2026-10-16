import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useMessageBus } from '../shared/bus/useMessageBus';
import { Banner, LiveStatus, ProgressBar, Sash } from '../shared/primitives';
import { parseSearchQuery } from '../shared/search/parseSearchQuery';
import { SearchBox } from '../shared/search/SearchBox';
import { useInstalled } from '../shared/store/installed';
import { useOps } from '../shared/store/ops';
import { useSearch } from '../shared/store/search';
import { BrowseResults } from './BrowseResults';
import { InstalledSection } from './InstalledSection';
import { UpdatesSection } from './UpdatesSection';
import { describeOutcome } from './outcomes';
import type { ViewStateStore } from '../shared/viewState';

/** What the view keeps across reloads in the webview's own state (`getState`/`setState`). */
export interface SidebarLayout {
    /** The Installed section's share of the height in percent while both sections are open. */
    split: number;
    installedExpanded: boolean;
    updatesExpanded: boolean;
}

export type { ViewStateStore };

const SPLIT = { min: 20, max: 80, initial: 50 };
const DEFAULT_LAYOUT: SidebarLayout = { split: SPLIT.initial, installedExpanded: true, updatesExpanded: true };

/** The layout kept in the view's state, or the default when there is none or it is not one. */
export function readLayout(store: ViewStateStore | undefined): SidebarLayout {
    let kept: unknown;
    try {
        kept = store?.getState();
    } catch {
        kept = undefined;
    }
    const layout = (kept as { layout?: Partial<SidebarLayout> } | undefined)?.layout;
    if (layout === undefined || typeof layout !== 'object') {
        return DEFAULT_LAYOUT;
    }
    const split = typeof layout.split === 'number' ? Math.min(SPLIT.max, Math.max(SPLIT.min, layout.split)) : SPLIT.initial;
    return { split, installedExpanded: layout.installedExpanded !== false, updatesExpanded: layout.updatesExpanded !== false };
}

/** The filter prefixes of the sidebar: `@vulnerable` is the main panel's alone (interaction model §2). */
const PREFIXES = ['@installed', '@updates'] as const;

/** How long the sidebar waits after the last key before it searches, and the least text it searches for unasked. */
export const BROWSE_DEBOUNCE_MS = 300;
const BROWSE_MIN_LENGTH = 2;

/**
 * The 2.0 sidebar: the search box, the Installed section and the Updates section (the draggable split between the
 * sections is P5.10's). `@installed <text>` and `@updates <text>` show that section alone, filtered; any other text
 * is a browse search, run 300 ms after the last key from two characters on, or at once on Enter, whose flat results
 * take the place of the sections. What is said to a screen reader goes through the one live region here: that a list
 * is loading, what a search found, and how every operation ended, on whichever surface it started.
 */
export function SidebarView({ viewState }: { viewState?: ViewStateStore } = {}): React.JSX.Element {
    const bus = useMessageBus();
    const installed = useInstalled();
    const { last } = useOps();
    const { search: runSearch, clear: clearSearch } = useSearch();
    const [query, setQuery] = useState('');
    const [said, setSaid] = useState<{ message: string | null; count: number }>({ message: null, count: 0 });
    const searchRef = useRef<HTMLInputElement>(null);
    const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [layout, setLayout] = useState<SidebarLayout>(() => readLayout(viewState));

    // The two marks the host logs when `nuiget.enablePerformanceLogging` is on (N81): once each, under StrictMode too.
    const markedReady = useRef(false);
    useEffect(() => {
        if (!markedReady.current) {
            markedReady.current = true;
            bus.request('perf/mark', { name: 'webviewReady', detail: `${Math.round(performance.now())} ms after load` }).catch(() => undefined);
        }
    }, [bus]);
    const markedRender = useRef(false);
    const firstListShown = installed.status === 'ready' && installed.result !== undefined;
    useEffect(() => {
        if (firstListShown && !markedRender.current) {
            markedRender.current = true;
            bus.request('perf/mark', { name: 'firstUsefulRender', detail: `${Math.round(performance.now())} ms after load` }).catch(() => undefined);
        }
    }, [bus, firstListShown]);
    // Kept when a change ends (a toggle, a key on the sash, the end of a drag): `setState` posts to VS Code, and a drag
    // would otherwise post once per pointer step.
    const keepLayout = (next: SidebarLayout): void => {
        try {
            const kept = viewState?.getState();
            viewState?.setState({ ...(typeof kept === 'object' && kept !== null ? kept : {}), layout: next });
        } catch {
            // A view without its state store keeps the layout for this page only.
        }
    };
    const changeLayout = (next: SidebarLayout): void => {
        setLayout(next);
        keepLayout(next);
    };

    const announce = useCallback((message: string): void => setSaid(previous => ({ message, count: previous.count + 1 })), []);

    // The host asks for the search box when the view is shown again.
    useEffect(() => bus.onEvent('ui/focusSearch', () => searchRef.current?.focus()), [bus]);

    const sequence = last?.sequence;
    useEffect(() => {
        if (last !== undefined) {
            announce(describeOutcome(last.outcome));
        }
        // One announcement per outcome: `sequence` goes up with each, `last` is what it belongs to.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sequence, announce]);

    const parsed = parseSearchQuery(query);
    // `@vulnerable` is no mode here: the text is searched for like any other.
    const mode = parsed.mode === 'vulnerable' ? 'browse' : parsed.mode;
    const browseText = mode === 'browse' ? query.trim() : '';
    useEffect(() => {
        if (browseText.length === 0) {
            clearSearch();
            return undefined;
        }
        if (browseText.length < BROWSE_MIN_LENGTH) {
            return undefined;
        }
        debounce.current = setTimeout(() => runSearch(browseText), BROWSE_DEBOUNCE_MS);
        return () => clearTimeout(debounce.current);
    }, [browseText, runSearch, clearSearch]);

    const loading = installed.status === 'loading';
    useEffect(() => {
        if (loading) {
            announce('Loading installed packages');
        }
    }, [loading, installed.projectPath, announce]);

    const unsupported = installed.result?.unsupported;
    // The sash stands between the two sections while both are shown and open.
    const bothOpen = mode === 'default' && layout.installedExpanded && layout.updatesExpanded;
    return (
        <main className="nuiget-sidebar" data-testid="nuiget-sidebar">
            <div className="nuiget-sidebar-header" role="search">
                <SearchBox
                    inputRef={searchRef}
                    className="nuiget-sidebar-search"
                    testId="sidebar-search-input"
                    label="Search packages, or filter with @installed or @updates"
                    placeholder="Search, or filter: @installed, @updates"
                    prefixes={PREFIXES}
                    value={query}
                    onChange={setQuery}
                    onSubmit={() => {
                        // Enter does not wait: the pending search for the same text is not sent as well.
                        clearTimeout(debounce.current);
                        if (browseText.length > 0) {
                            runSearch(browseText);
                        }
                    }}
                />
                {installed.revalidating && mode !== 'browse' ? <ProgressBar label="Refreshing installed packages" /> : null}
            </div>
            {mode === 'browse' ? <BrowseResults announce={announce} /> : (
                <>
                    {unsupported ? <Banner severity="warning" data-testid="sidebar-unsupported">{`Unsupported project: ${unsupported.message}`}</Banner> : null}
                    {installed.error && mode !== 'updates'
                        ? <Banner severity="error" data-testid="sidebar-installed-error" action={{ label: 'Retry', onClick: installed.refresh }}>{`Installed packages could not be loaded: ${installed.error.message}`}</Banner>
                        : null}
                    {mode !== 'updates' ? (
                        <InstalledSection
                            filter={mode === 'installed' ? parsed.filterText : ''}
                            announce={announce}
                            expanded={layout.installedExpanded}
                            onToggle={() => changeLayout({ ...layout, installedExpanded: !layout.installedExpanded })}
                            share={bothOpen ? String(layout.split) : undefined}
                        />
                    ) : null}
                    {bothOpen ? (
                        <Sash
                            orientation="horizontal"
                            label="Resize the Installed and Updates sections"
                            value={layout.split}
                            min={SPLIT.min}
                            max={SPLIT.max}
                            defaultValue={SPLIT.initial}
                            onChange={split => setLayout(previous => ({ ...previous, split }))}
                            onChangeEnd={split => keepLayout({ ...layout, split })}
                        />
                    ) : null}
                    {mode !== 'installed' ? (
                        <UpdatesSection
                            filter={mode === 'updates' ? parsed.filterText : ''}
                            announce={announce}
                            expanded={layout.updatesExpanded}
                            onToggle={() => changeLayout({ ...layout, updatesExpanded: !layout.updatesExpanded })}
                            share={bothOpen ? String(100 - layout.split) : undefined}
                        />
                    ) : null}
                </>
            )}
            <LiveStatus message={said.message} repeat={said.count} />
        </main>
    );
}
