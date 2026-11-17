import { useMemo } from 'react';
import type React from 'react';
import type { InstalledResult, PackageUpdate } from '../../protocol';
import { EmptyState, Listbox } from '../shared/primitives';
import { projectFileName, type AskUninstall } from './packageRows';
import { useUpdateRows, visibleUpdates } from './updateRows';

interface Item {
    id: string;
    update: PackageUpdate;
}

export interface ProjectUpdatesProps {
    projectPath: string;
    rows: readonly PackageUpdate[];
    /** The project's installed list: which packages are centrally managed, whether the project is unsupported. */
    installed: InstalledResult | undefined;
    /** The text after `@updates`: only updates whose id contains it are listed. */
    filter: string;
    announce: (message: string) => void;
    /** The view's Delete confirmation (UX-P4.2b). */
    ask: AskUninstall;
    labelledBy: string;
    testId: string;
    busy: boolean;
    /** The empty state's sentence. */
    empty: string;
    selectedId: string | null;
    onSelectedChange: (id: string) => void;
}

/**
 * The updates of one project as compact rows: Enter or the row's button updates the package in this project to its
 * latest version with the row's source; Ctrl+Enter opens the main panel, Shift+F10 VS Code's actions menu. A centrally
 * managed package opens the actions menu instead, where the host confirms the central change in a modal listing the
 * projects it reaches; a row with a `VersionOverride` updates in this project alone, without a preview (N74); an
 * unsupported project is read-only.
 */
export function ProjectUpdates(props: ProjectUpdatesProps): React.JSX.Element {
    const { projectPath, rows, installed, filter, announce, ask, labelledBy, testId, busy: revalidating, empty, selectedId, onSelectedChange } = props;
    const { updateOne, askUninstall, viewDetails, renderUpdateRow } = useUpdateRows(announce, ask);
    const items = useMemo<Item[]>(() => visibleUpdates(rows, filter).map(update => ({ id: update.id, update })), [rows, filter]);

    return (
        <Listbox
            items={items}
            labelledBy={labelledBy}
            hint="Enter opens the package in the main panel. Ctrl+Enter (Cmd+Enter) updates it to the latest version; on a centrally managed package it opens the actions menu. Delete (Cmd+Backspace) uninstalls it. Shift+F10 opens the actions menu."
            testId={testId}
            density="compact"
            selectedId={selectedId}
            busy={revalidating}
            onSelect={item => onSelectedChange(item.id)}
            onActivate={({ update }) => viewDetails(update.id, update.latestVersion, { projectPath, tab: 'updates' })}
            onSecondaryActivate={({ update }) => updateOne(projectPath, installed, update)}
            onDelete={({ update }) => askUninstall(projectPath, projectFileName(projectPath), installed, update)}
            empty={<EmptyState data-testid="sidebar-updates-empty" message={empty} />}
            renderRow={({ update }, placement) => renderUpdateRow(projectPath, installed, update, placement)}
        />
    );
}
