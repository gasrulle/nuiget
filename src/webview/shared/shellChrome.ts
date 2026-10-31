import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useMessageBus } from './bus/useMessageBus';
import { useOps } from './store/ops';
import { describeOutcome } from './store/outcomes';

/**
 * What both shells duplicate (CA-R3): the live region, the `webviewReady` mark, the host's `ui/focusSearch` and the
 * announcement of how every operation ended, on whichever surface it started.
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

    const { last } = useOps();
    const sequence = last?.sequence;
    useEffect(() => {
        if (last !== undefined) {
            announce(describeOutcome(last.outcome));
        }
        // One announcement per outcome: `sequence` goes up with each, `last` is what it belongs to.
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
