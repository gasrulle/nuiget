import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useMessageBus } from '../shared/bus/useMessageBus';
import { Banner, LiveStatus, ProgressBar } from '../shared/primitives';
import { useInstalled } from '../shared/store/installed';
import { useOps } from '../shared/store/ops';
import { InstalledSection } from './InstalledSection';
import { describeOutcome } from './outcomes';

/**
 * The 2.0 sidebar, first slice: a box that filters the installed packages, and the Installed section. What is
 * said to a screen reader goes through the one live region here: that a list is loading, and how every
 * operation ended, on whichever surface it started.
 */
export function SidebarView(): React.JSX.Element {
    const bus = useMessageBus();
    const installed = useInstalled();
    const { last } = useOps();
    const [filter, setFilter] = useState('');
    const [said, setSaid] = useState<{ message: string | null; count: number }>({ message: null, count: 0 });
    const searchRef = useRef<HTMLInputElement>(null);

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
                <input
                    ref={searchRef}
                    className="nuiget-sidebar-search"
                    type="search"
                    data-testid="sidebar-search-input"
                    aria-label="Filter installed packages"
                    placeholder="Filter installed packages"
                    value={filter}
                    onChange={event => setFilter(event.target.value)}
                />
                {installed.revalidating ? <ProgressBar label="Refreshing installed packages" /> : null}
            </div>
            {unsupported ? <Banner severity="warning" data-testid="sidebar-unsupported">{`Unsupported project: ${unsupported.message}`}</Banner> : null}
            {installed.error
                ? <Banner severity="error" data-testid="sidebar-installed-error" action={{ label: 'Retry', onClick: installed.refresh }}>{`Installed packages could not be loaded: ${installed.error.message}`}</Banner>
                : null}
            <InstalledSection filter={filter} announce={announce} />
            <LiveStatus message={said.message} repeat={said.count} />
        </main>
    );
}
