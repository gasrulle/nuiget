import { useMemo } from 'react';
import type React from 'react';
import type { InstalledPackage, InstalledResult } from '../../protocol';
import { EmptyState, Listbox } from '../shared/primitives';
import { usePackageRows, visiblePackages } from './packageRows';

interface Item {
    id: string;
    entry: InstalledPackage;
}

export interface ProjectPackagesProps {
    projectPath: string;
    result: InstalledResult;
    /** Shows the packages whose id contains this text, whatever the case. */
    filter: string;
    announce: (message: string) => void;
    /** The id of the element that names the list (the section's title). */
    labelledBy: string;
    testId: string;
    busy: boolean;
    /** The selected row, kept by the section so that it outlives a collapse of the list. */
    selectedId: string | null;
    onSelectedChange: (id: string) => void;
}

/** The installed packages of one project as compact rows (the selected project's list; `usePackageRows` acts on them). */
export function ProjectPackages({ projectPath, result, filter, announce, labelledBy, testId, busy: revalidating, selectedId, onSelectedChange }: ProjectPackagesProps): React.JSX.Element {
    const { uninstall, viewDetails, renderPackageRow } = usePackageRows(announce);
    const items = useMemo<Item[]>(() => visiblePackages(result, filter).map(entry => ({ id: entry.id, entry })), [result, filter]);
    const readOnly = result.unsupported !== undefined;
    let nothing = `No installed packages match "${filter.trim()}".`;
    if (result.packages.length === 0) {
        nothing = readOnly ? 'No packages to show.' : 'No packages installed.';
    }
    return (
        <Listbox
            items={items}
            labelledBy={labelledBy}
            hint={readOnly
                ? 'Read-only. Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu.'
                : 'Enter or Delete uninstalls; Ctrl+Enter (Cmd+Enter) opens the full view; Shift+F10 opens the actions menu.'}
            testId={testId}
            density="compact"
            selectedId={selectedId}
            busy={revalidating}
            onSelect={item => onSelectedChange(item.id)}
            onActivate={({ entry }) => uninstall(projectPath, result, entry)}
            onDelete={({ entry }) => uninstall(projectPath, result, entry)}
            onSecondaryActivate={({ entry }) => viewDetails(entry.id, entry.resolvedVersion ?? entry.version)}
            empty={<EmptyState data-testid="sidebar-installed-empty" message={nothing} />}
            isDisabled={({ entry }) => entry.declaration === 'unresolved'}
            renderRow={({ entry }, placement) => renderPackageRow(projectPath, result, entry, placement)}
        />
    );
}
