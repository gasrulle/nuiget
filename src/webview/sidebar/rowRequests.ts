import { useCallback } from 'react';
import { useMessageBus } from '../shared/bus/useMessageBus';

export interface RowRequests {
    /**
     * The package in the main panel, at this version; with the row's project and list (an Installed or Updates row) the
     * panel opens on that tab with the row current (UX-P4.2b), else in Browse.
     */
    viewDetails: (packageId: string, version: string | undefined, row?: { projectPath: string; tab: 'installed' | 'updates' }) => void;
}

/**
 * The row request the sidebar's lists share: "View Package Details" (`ui/viewPackage`, which opens the main panel on the
 * package); a failed request is said through the view's live region. The actions menu is VS Code's (ADR-013 Decision 4).
 */
export function useRowRequests(announce: (message: string) => void): RowRequests {
    const bus = useMessageBus();
    const fail = useCallback((what: string) => (error: unknown): void => {
        announce(`${what} failed: ${error instanceof Error ? error.message : String(error)}`);
    }, [announce]);
    const viewDetails = useCallback((packageId: string, version: string | undefined, row?: { projectPath: string; tab: 'installed' | 'updates' }): void => {
        bus.request('ui/viewPackage', { packageId, ...(version === undefined ? {} : { version }), ...(row ?? {}) }).catch(fail(`Opening ${packageId}`));
    }, [bus, fail]);
    return { viewDetails };
}
