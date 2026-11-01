import type React from 'react';
import { ProgressBar } from '../shared/primitives';
import { useFirstUsefulRenderMark } from '../shared/shellChrome';
import { useAllProjects } from '../shared/store/allProjects';
import { useInstalled } from '../shared/store/installed';
import { useUpdates } from '../shared/store/updates';
import type { MainTab } from './MainShell';

/** The bar over the header's bottom edge while the shown list asks again; Browse draws its own. Always mounted. */
export function RefreshBar({ refreshing, browsing, tab }: { refreshing: boolean; browsing: boolean; tab: MainTab }): React.JSX.Element | null {
    const installed = useInstalled();
    const updates = useUpdates();
    const allProjects = useAllProjects();
    // Here, not with the tabs: Browse unmounts them, and the mark is once per page (N81).
    useFirstUsefulRenderMark(installed.status === 'ready' && installed.result !== undefined);
    const revalidating = tab === 'installed' ? installed.revalidating || allProjects.revalidating : updates.revalidating || allProjects.updates.revalidating;
    // The Installed list draws DS-STATE-2's bar (UX-P2.8b); Updates until P3.1b; Browse draws its own.
    const ownBar = tab === 'installed' && !browsing;
    return !ownBar && (refreshing || (!browsing && revalidating)) ? <div className="nuiget-main-progress"><ProgressBar label="Refreshing" /></div> : null;
}
