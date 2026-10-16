import { useCallback } from 'react';
import type { ContextMenuRequest } from '../../protocol';
import { useMessageBus } from '../shared/bus/useMessageBus';

export interface RowRequests {
    /** Shift+F10, the ContextMenu key or a right-click: the host shows the row's actions as a QuickPick. */
    menu: (request: ContextMenuRequest) => void;
    /** Ctrl+Enter (Cmd+Enter on macOS): the package in the full view, at this version. */
    viewDetails: (packageId: string, version: string | undefined) => void;
}

/**
 * The two row requests the sidebar's lists share: the actions menu (`ui/contextMenu`, whose QuickPick the host owns, as
 * in 1.x) and "View package details" (`ui/viewPackage`, which opens the main panel on the package). A failed request is
 * said through the view's live region.
 */
export function useRowRequests(announce: (message: string) => void): RowRequests {
    const bus = useMessageBus();
    const fail = useCallback((what: string) => (error: unknown): void => {
        announce(`${what} failed: ${error instanceof Error ? error.message : String(error)}`);
    }, [announce]);
    const menu = useCallback((request: ContextMenuRequest): void => {
        bus.request('ui/contextMenu', request).catch(fail(`The actions of ${request.packageId}`));
    }, [bus, fail]);
    const viewDetails = useCallback((packageId: string, version: string | undefined): void => {
        bus.request('ui/viewPackage', version === undefined ? { packageId } : { packageId, version }).catch(fail(`Opening ${packageId}`));
    }, [bus, fail]);
    return { menu, viewDetails };
}
