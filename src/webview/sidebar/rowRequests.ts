import { useCallback } from 'react';
import { useMessageBus } from '../shared/bus/useMessageBus';

export interface RowRequests {
    /** Ctrl+Enter (Cmd+Enter on macOS): the package in the full view, at this version. */
    viewDetails: (packageId: string, version: string | undefined) => void;
}

/**
 * The row request the sidebar's lists share: "View package details" (`ui/viewPackage`, which opens the main panel on the
 * package); a failed request is said through the view's live region. The actions menu is VS Code's (ADR-013 Decision 4).
 */
export function useRowRequests(announce: (message: string) => void): RowRequests {
    const bus = useMessageBus();
    const fail = useCallback((what: string) => (error: unknown): void => {
        announce(`${what} failed: ${error instanceof Error ? error.message : String(error)}`);
    }, [announce]);
    const viewDetails = useCallback((packageId: string, version: string | undefined): void => {
        bus.request('ui/viewPackage', version === undefined ? { packageId } : { packageId, version }).catch(fail(`Opening ${packageId}`));
    }, [bus, fail]);
    return { viewDetails };
}
