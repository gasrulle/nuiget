import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useMessageBus } from './bus/useMessageBus';
import { useAllProjects, type AllProjectsState } from './store/allProjects';
import { useInstalled, type InstalledState } from './store/installed';
import { useOps } from './store/ops';
import { describeOutcome } from './store/outcomes';

/**
 * What both shells duplicate (CA-R3): the live region, the `webviewReady` mark, the host's `ui/focusSearch` and the
 * announcement of how an operation ended, by the surface that asked for it only (UX-P4.6, A10), its row menu included (the
 * outcome's `origin`, UX-P4.fix-11): the other surface says nothing here, and the host says a single success it started
 * with no surface to name in the status bar (UX-P4.7).
 */
export function useShellChrome(): { announce: (message: string) => void; live: { message: string | null; repeat: number }; searchRef: React.RefObject<HTMLInputElement | null> } {
    const bus = useMessageBus();
    const [said, setSaid] = useState<{ message: string | null; repeat: number }>({ message: null, repeat: 0 });
    const searchRef = useRef<HTMLInputElement>(null);
    const announce = useCallback((message: string): void => setSaid(previous => ({ message, repeat: previous.repeat + 1 })), []);

    // Logged when `nuiget.enablePerformanceLogging` is on (N81): once, under StrictMode too.
    const markedReady = useRef(false);
    useEffect(() => {
        if (!markedReady.current) {
            markedReady.current = true;
            bus.request('perf/mark', { name: 'webviewReady', detail: `${Math.round(performance.now())} ms after load` }).catch(() => undefined);
        }
    }, [bus]);

    // The host asks for the search box when the view is shown again.
    useEffect(() => bus.onEvent('ui/focusSearch', () => searchRef.current?.focus()), [bus]);

    const { own } = useOps();
    const sequence = own?.sequence;
    useEffect(() => {
        if (own !== undefined) {
            announce(describeOutcome(own.outcome));
        }
        // One announcement per outcome: `sequence` goes up with each, `own` is what it belongs to.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sequence, announce]);

    return { announce, live: said, searchRef };
}

/** The `firstUsefulRender` mark (N81), once, when the first list is shown. */
export function useFirstUsefulRenderMark(shown: boolean): void {
    const bus = useMessageBus();
    const marked = useRef(false);
    useEffect(() => {
        if (shown && !marked.current) {
            marked.current = true;
            bus.request('perf/mark', { name: 'firstUsefulRender', detail: `${Math.round(performance.now())} ms after load` }).catch(() => undefined);
        }
    }, [bus, shown]);
}

/**
 * Whether a first useful list is on screen: one project at its answer; under All Projects the first project chunk with a
 * list, or the fan-out's answer when no project has one (N81(a), UX-P4.8b). A fan-out error is no answer, as a project's is none.
 */
export function firstListShown(installed: Pick<InstalledState, 'status' | 'result'>, all: Pick<AllProjectsState, 'active' | 'status' | 'chunks'>): boolean {
    if (all.active) {
        return all.status === 'ready' || [...all.chunks.values()].some(chunk => chunk.result !== undefined);
    }
    return installed.status === 'ready' && installed.result !== undefined;
}

/**
 * Each shell's `firstUsefulRender` mark (N81), once per page, when the first list is shown. A leaf of its own, always mounted and
 * rendered once by each shell: Browse unmounts the tabs, and the list subscriptions stay out of `MainShell` and out of
 * `SidebarView`'s body (UX-P2.7; UX-P3.10 push D, architecture ruling of 2026-11-14; UX-P4.8b, architecture ruling of 2026-11-20).
 */
export function FirstUsefulRenderMark(): null {
    useFirstUsefulRenderMark(firstListShown(useInstalled(), useAllProjects()));
    return null;
}
