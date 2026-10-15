import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useMessageBus } from '../shared/bus/useMessageBus';
import { Banner, LiveStatus, ProgressBar } from '../shared/primitives';
import { parseSearchQuery } from '../shared/search/parseSearchQuery';
import { SearchBox } from '../shared/search/SearchBox';
import { useInstalled } from '../shared/store/installed';
import { useOps } from '../shared/store/ops';
import { useSearch } from '../shared/store/search';
import { BrowseResults } from './BrowseResults';
import { InstalledSection } from './InstalledSection';
import { UpdatesSection } from './UpdatesSection';
import { describeOutcome } from './outcomes';

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
export function SidebarView(): React.JSX.Element {
    const bus = useMessageBus();
    const installed = useInstalled();
    const { last } = useOps();
    const { search: runSearch, clear: clearSearch } = useSearch();
    const [query, setQuery] = useState('');
    const [said, setSaid] = useState<{ message: string | null; count: number }>({ message: null, count: 0 });
    const searchRef = useRef<HTMLInputElement>(null);
    const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

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
                    {mode !== 'updates' ? <InstalledSection filter={mode === 'installed' ? parsed.filterText : ''} announce={announce} /> : null}
                    {mode !== 'installed' ? <UpdatesSection filter={mode === 'updates' ? parsed.filterText : ''} announce={announce} /> : null}
                </>
            )}
            <LiveStatus message={said.message} repeat={said.count} />
        </main>
    );
}
