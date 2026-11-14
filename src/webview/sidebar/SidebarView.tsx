import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Banner, cssVars, LiveStatus, Sash } from '../shared/primitives';
import { sentence } from '../shared/updates/sentence';
import { parseSearchQuery } from '../shared/search/parseSearchQuery';
import { SearchBox } from '../shared/search/SearchBox';
import { useConfig } from '../shared/store/config';
import { useInstalled } from '../shared/store/installed';
import { useSearch } from '../shared/store/search';
import { useSession } from '../shared/store/session';
import { useSources } from '../shared/store/sources';
import { BrowseResults } from './BrowseResults';
import { InstalledSection } from './InstalledSection';
import { UpdatesSection } from './UpdatesSection';
import { useFirstUsefulRenderMark, useShellChrome } from '../shared/shellChrome';
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
    const installed = useInstalled();
    // `workbench.tree.indent` indents the All Projects levels; the settings come once asked (the config slice is lazy).
    const { config, enable: enableConfig } = useConfig();
    useEffect(() => enableConfig(), [enableConfig]);
    // The header line names the active source (X15, UX-P3.7b): the sources slice is lazy, enabled here.
    const { session } = useSession();
    const { sources, enable: enableSources } = useSources();
    useEffect(() => enableSources(), [enableSources]);
    const { search: runSearch, clear: clearSearch } = useSearch();
    const [query, setQuery] = useState('');
    const { announce, live, searchRef } = useShellChrome();
    // SB14 (UX-P3.8): the search box claims the focus once, when the side bar's own document has the focus and nothing in it
    // holds it: at mount, else at the document's first focus gain. The Extensions view focuses its box when the view takes
    // the focus; a mount while the user types in an editor leaves the editor focused. The ref keeps the claim to one under
    // StrictMode's second effect run.
    const claimed = useRef(false);
    useEffect(() => {
        const claim = (): boolean => {
            const active = document.activeElement;
            if (!document.hasFocus() || (active !== null && active !== document.body)) {
                return false;
            }
            claimed.current = true;
            searchRef.current?.focus();
            return true;
        };
        if (claimed.current || claim()) {
            return undefined;
        }
        const onFocus = (): void => {
            if (claim()) {
                window.removeEventListener('focus', onFocus);
            }
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [searchRef]);
    const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [layout, setLayout] = useState<SidebarLayout>(() => readLayout(viewState));

    useFirstUsefulRenderMark(installed.status === 'ready' && installed.result !== undefined);
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

    const parsed = parseSearchQuery(query);
    // `@vulnerable` is no mode here: the text is searched for like any other.
    const mode = parsed.mode === 'vulnerable' ? 'browse' : parsed.mode;
    const browseText = mode === 'browse' ? query.trim() : '';
    // A filter mode opens its section whatever the kept layout says, and never writes the layout (SB2, UX-P3.7b).
    // Keyed by the mode, so entering a filter mode opens its section in the same render.
    const [filterState, setFilterState] = useState<{ mode: string; open: boolean }>({ mode: 'default', open: true });
    const filterOpen = filterState.mode === mode ? filterState.open : true;
    const setFilterOpen = (toggle: (open: boolean) => boolean): void => setFilterState({ mode, open: toggle(filterOpen) });
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
    const selectedSource = session?.selectedSource ?? 'all';
    const sourceName = selectedSource === 'all' ? undefined : (sources?.find(source => source.url === selectedSource)?.name ?? selectedSource);
    return (
        <main className="nuiget-sidebar" data-testid="nuiget-sidebar" style={cssVars({ '--nuiget-tree-indent': `${config?.treeIndent ?? 8}px` })}>
            <div className="nuiget-sidebar-header">
                {sourceName === undefined
                    ? <p className="nuiget-sidebar-context" data-testid="sidebar-source">All sources</p>
                    : (
                        <p className="nuiget-sidebar-context" data-testid="sidebar-source" title={selectedSource}>
                            <span className="nuiget-visually-hidden">Package source </span>
                            {sourceName}
                        </p>
                    )}
                <div className="nuiget-sidebar-search" role="search">
                    <SearchBox
                        inputRef={searchRef}
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
                </div>
            </div>
            {mode === 'browse' ? <BrowseResults announce={announce} /> : (
                <>
                    {/* The Updates pane alone says it with its own banner (UX-P3.10): one message per fact. */}
                    {unsupported && mode !== 'updates' ? <Banner severity="warning" data-testid="sidebar-unsupported">{`Unsupported project: ${sentence(unsupported.message)}`}</Banner> : null}
                    {installed.error && mode !== 'updates'
                        ? <Banner severity="error" data-testid="sidebar-installed-error" action={{ label: 'Retry', onClick: installed.refresh }}>{`Installed packages could not be loaded: ${installed.error.message}`}</Banner>
                        : null}
                    {mode !== 'updates' ? (
                        <InstalledSection
                            filter={mode === 'installed' ? parsed.filterText : ''}
                            announce={announce}
                            expanded={mode === 'installed' ? filterOpen : layout.installedExpanded}
                            onToggle={mode === 'installed' ? () => setFilterOpen(open => !open) : () => changeLayout({ ...layout, installedExpanded: !layout.installedExpanded })}
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
                            expanded={mode === 'updates' ? filterOpen : layout.updatesExpanded}
                            onToggle={mode === 'updates' ? () => setFilterOpen(open => !open) : () => changeLayout({ ...layout, updatesExpanded: !layout.updatesExpanded })}
                            share={bothOpen ? String(100 - layout.split) : undefined}
                        />
                    ) : null}
                </>
            )}
            <LiveStatus message={live.message} repeat={live.repeat} />
        </main>
    );
}
