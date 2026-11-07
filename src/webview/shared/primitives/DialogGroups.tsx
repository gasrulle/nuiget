import React from 'react';
import './primitives.css';

/** One list of a dialog: an optional lead such as "From Gateway:", then its items. */
export interface DialogGroup {
    label?: string;
    items: readonly string[];
}

export interface DialogGroupsProps {
    groups: ReadonlyArray<DialogGroup>;
}

/**
 * The lists of a dialog (UX-P3.5): one group per project or change, its lead above its list. Every rhythm is a gap, never a
 * margin: 8 between groups, 4 between a lead and its list (DS-GRID-2a). An empty `groups` renders nothing.
 */
export function DialogGroups({ groups }: DialogGroupsProps): React.JSX.Element | null {
    if (groups.length === 0) {
        return null;
    }
    return (
        <div className="nuiget-dialog-groups">
            {groups.map((group, index) => (
                <div key={index} className="nuiget-dialog-group">
                    {group.label === undefined ? null : <p className="nuiget-dialog-lead">{group.label}</p>}
                    <ul className="nuiget-dialog-list">
                        {group.items.map((item, position) => <li key={`${position}-${item}`}>{item}</li>)}
                    </ul>
                </div>
            ))}
        </div>
    );
}
