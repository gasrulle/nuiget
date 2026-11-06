import type React from 'react';
import { ProgressBar } from '../shared/primitives';
import { useFirstUsefulRenderMark } from '../shared/shellChrome';
import { useInstalled } from '../shared/store/installed';

/**
 * The bar over the header's bottom edge while a Refresh runs under Browse. The Installed and Updates lists draw DS-STATE-2's
 * bar over their own top edge (UX-P2.8b, UX-P3.1b) and Browse draws its own while it asks. Always mounted.
 */
export function RefreshBar({ refreshing, browsing }: { refreshing: boolean; browsing: boolean }): React.JSX.Element | null {
    const installed = useInstalled();
    // Here, not with the tabs: Browse unmounts them, and the mark is once per page (N81).
    useFirstUsefulRenderMark(installed.status === 'ready' && installed.result !== undefined);
    return browsing && refreshing ? <div className="nuiget-main-progress"><ProgressBar label="Refreshing" /></div> : null;
}
