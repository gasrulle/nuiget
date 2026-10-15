import type React from 'react';

/** Items by workspace folder, in the order the folders first appear; an item without one is under "Other". */
export function groupByFolder<T extends { workspaceFolder?: string }>(items: readonly T[]): Array<[string, T[]]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
        const folder = item.workspaceFolder ?? 'Other';
        groups.set(folder, [...(groups.get(folder) ?? []), item]);
    }
    return [...groups];
}

export interface FolderGroupsProps<T extends { workspaceFolder?: string }> {
    items: readonly T[];
    /** One project's section; `level` is 3 under a folder heading, 2 without one. */
    render: (item: T, level: 2 | 3) => React.ReactNode;
}

/**
 * The projects of All Projects grouped by workspace folder (interaction model §3, D2): with two or more folders a
 * heading per folder over its projects, whose sections go one heading level down; with one folder the sections alone.
 */
export function FolderGroups<T extends { workspaceFolder?: string }>({ items, render }: FolderGroupsProps<T>): React.JSX.Element {
    const folders = groupByFolder(items);
    if (folders.length < 2) {
        return <>{items.map(item => render(item, 2))}</>;
    }
    return (
        <>
            {folders.map(([folder, members]) => (
                <section key={folder} className="nuiget-installed-folder" aria-label={`Workspace folder ${folder}`}>
                    <h2 className="nuiget-installed-folder-title">{folder}</h2>
                    {members.map(item => render(item, 3))}
                </section>
            ))}
        </>
    );
}
