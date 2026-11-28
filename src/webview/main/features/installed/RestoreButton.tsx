import type React from 'react';
import { ALL_PROJECTS } from '../../../../protocol';
import { CloudDownloadIcon, IconButton, LoadingIcon } from '../../../shared/primitives';
import { useProjects } from '../../../shared/store/projects';
import { useSession } from '../../../shared/store/session';
import { useRestore } from './useRestore';

/**
 * The header's Restore Packages (UX-P5.8, G10): restores the committed project, or every listed project under All Projects
 * (the palette command's rule). Never disabled: while a restore of its projects is queued or running it shows the spinner
 * and a press says so; before the session or the project list is known a press does nothing.
 */
export function RestoreButton({ announce }: { announce: (message: string) => void }): React.JSX.Element {
    const { restoringPaths, restore } = useRestore(announce);
    const { committed } = useSession();
    const { projects } = useProjects();
    const selected = committed?.selectedProject;
    const targets = selected === undefined ? undefined : selected === '' || selected === ALL_PROJECTS ? projects?.map(project => project.path) : [selected];
    const press = targets === undefined ? undefined : (): void => {
        if (targets.length === 0) {
            announce('No .NET projects found in this workspace.');
            return;
        }
        restore(targets);
    };
    return (
        <IconButton label="Restore Packages" data-testid="restore-button" onClick={press}>
            {targets?.some(path => restoringPaths.has(path)) ? <LoadingIcon /> : <CloudDownloadIcon />}
        </IconButton>
    );
}
