import { useCallback, useMemo } from 'react';
import { ALL_PROJECTS } from '../../../../protocol';
import { restoringProjects, useOps, useOpsActions } from '../../../shared/store/ops';
import { useSession } from '../../../shared/store/session';

/**
 * The one restore path of the main panel (UX-P5.8): the transitive banner and the header's Restore Packages both start a
 * restore here. A project whose restore is queued or running (the ops slice, UX-P4.fix-10) is left out; when none is left
 * the press starts nothing and says so.
 */
export function useRestore(announce: (message: string) => void): { restoringPaths: ReadonlySet<string>; restore: (projectPaths: string[]) => void } {
    const ops = useOps();
    const { run } = useOpsActions();
    const { committed } = useSession();
    const allMode = committed?.selectedProject === ALL_PROJECTS;
    const restoringPaths = useMemo(() => restoringProjects(ops), [ops]);
    const restore = useCallback((projectPaths: string[]): void => {
        const fresh = projectPaths.filter(projectPath => !restoringPaths.has(projectPath));
        if (fresh.length === 0) {
            announce(projectPaths.length === 1 && !allMode ? 'A restore of this project is running.' : 'A restore of these projects is running.');
            return;
        }
        // The outcome is announced from the ops slice; here only a request that got no answer.
        run('ops/restore', { projectPaths: fresh }).catch((error: unknown) => announce(`Restore failed: ${error instanceof Error ? error.message : String(error)}`));
    }, [restoringPaths, allMode, run, announce]);
    return { restoringPaths, restore };
}
