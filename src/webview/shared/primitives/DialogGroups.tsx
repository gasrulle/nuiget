import React from 'react';
import './primitives.css';

/** A package in a dialog's list: its id and, for a change, the version it goes from and to (UX-P4.fix-14). */
export interface DialogPackageItem {
    id: string;
    versions?: { from: string; to: string };
}

/** One list of a dialog: an optional lead such as "From Gateway:", then its items: text (a project name) or a package. */
export interface DialogGroup {
    label?: string;
    items: ReadonlyArray<string | DialogPackageItem>;
}

export interface DialogGroupsProps {
    groups: ReadonlyArray<DialogGroup>;
}

/**
 * A package item's text, `<id> <old> → <new>` as a row writes it (DS-COPY-2): a break opportunity after each dot of the id, and the
 * old version and `→ <new>` each one inline box, so a line breaks at the id's dots or the spaces, never inside a part narrower than
 * the line (DS-OVERFLOW-7, UX-P4.fix-14). The text is unchanged: `<wbr>` adds none.
 */
function packageItem(item: DialogPackageItem): React.ReactNode {
    const segments = item.id.split('.');
    const id = segments.map((segment, index) => (index < segments.length - 1
        ? <React.Fragment key={index}>{segment}.<wbr /></React.Fragment>
        : <React.Fragment key={index}>{segment}</React.Fragment>));
    if (item.versions === undefined) {
        return id;
    }
    return <>{id} <span className="nuiget-dialog-item-part">{item.versions.from}</span> <span className="nuiget-dialog-item-part">{`→ ${item.versions.to}`}</span></>;
}

/** The text an item writes, for its key. */
const itemText = (item: string | DialogPackageItem): string => (typeof item === 'string' ? item : `${item.id}${item.versions === undefined ? '' : ` ${item.versions.from} → ${item.versions.to}`}`);

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
                        {group.items.map((item, position) => <li key={`${position}-${itemText(item)}`}>{typeof item === 'string' ? item : packageItem(item)}</li>)}
                    </ul>
                </div>
            ))}
        </div>
    );
}
