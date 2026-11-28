import { useEffect, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS } from '../../protocol';
import { useAllProjects } from '../shared/store/allProjects';
import { useInstalled } from '../shared/store/installed';

/**
 * The side bar's settle truth for the capture harness (UX-P5.4, design-advisor opening ruling of 2026-11-28, DO 6), the Installed
 * tab's `data-pending` form (UX-P5.1a): pending from the list's answer (under All Projects the fan-out's) until its lite metadata
 * first settled for that view, latched per view, never on a re-ask. A leaf of its own, always mounted, so the list subscriptions
 * stay out of `SidebarView`'s body; it draws nothing.
 */
export function SettleMark(): React.JSX.Element {
    const installed = useInstalled();
    const all = useAllProjects();
    const view = all.active ? ALL_PROJECTS : installed.projectPath;
    const settled = all.active ? all.metadataSettled : installed.metadataSettled;
    const answered = all.active ? all.status === 'ready' : installed.status === 'ready';
    const [settledFor, setSettledFor] = useState<string | null>(null);
    useEffect(() => {
        if (view !== null && settled) {
            setSettledFor(view);
        }
    }, [view, settled]);
    const pending = view !== null && answered && settledFor !== view && !settled;
    return <span hidden data-testid="sidebar-settle" data-pending={pending ? '' : undefined} />;
}
