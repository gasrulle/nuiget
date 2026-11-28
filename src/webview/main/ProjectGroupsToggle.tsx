import type React from 'react';
import { CollapseAllIcon, ExpandAllIcon, IconButton } from '../shared/primitives';

interface ProjectGroupsToggleProps {
    /** The project group rows of the All Projects tree, by id; the toggle acts on these and nothing else. */
    groupIds: readonly string[];
    collapsed: ReadonlySet<string>;
    setCollapsed: (next: (previous: ReadonlySet<string>) => ReadonlySet<string>) => void;
    announce: (text: string) => void;
}

/**
 * Collapse All or Expand All on a bulk toolbar under All Projects (UX-P5.8, MI10, MU8): one button whose name and glyph swap,
 * as the workbench's view title action does. It collapses every project group while any is expanded, else expands them all;
 * the Transitive group and the folder groups keep their state. Absent while the tree has no project group row.
 */
export function ProjectGroupsToggle({ groupIds, collapsed, setCollapsed, announce }: ProjectGroupsToggleProps): React.JSX.Element | null {
    if (groupIds.length === 0) {
        return null;
    }
    const collapsing = groupIds.some(id => !collapsed.has(id));
    const toggle = (): void => {
        setCollapsed(previous => {
            const next = new Set(previous);
            for (const id of groupIds) {
                if (collapsing) {
                    next.add(id);
                } else {
                    next.delete(id);
                }
            }
            return next;
        });
        announce(collapsing ? 'Collapsed all projects.' : 'Expanded all projects.');
    };
    return (
        <IconButton label={collapsing ? 'Collapse All' : 'Expand All'} data-testid="expand-collapse-button" onClick={toggle}>
            {collapsing ? <CollapseAllIcon /> : <ExpandAllIcon />}
        </IconButton>
    );
}
