import { useFirstUsefulRenderMark } from '../shared/shellChrome';
import { useInstalled } from '../shared/store/installed';

/**
 * The main panel's `firstUsefulRender` mark (N81), once per page, when the first installed list is shown. A leaf of its own,
 * always mounted: Browse unmounts the tabs, and the installed subscription stays out of `MainShell` (UX-P2.7; UX-P3.10 push D,
 * architecture ruling of 2026-11-14).
 */
export function FirstUsefulRenderMark(): null {
    const installed = useInstalled();
    useFirstUsefulRenderMark(installed.status === 'ready' && installed.result !== undefined);
    return null;
}
