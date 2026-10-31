import type React from 'react';
import { ALL_PROJECTS, type PackageMetadataLite } from '../../protocol';
import { type TabItem, Tabs } from '../shared/primitives';
import { useAllProjects } from '../shared/store/allProjects';
import { useInstalled } from '../shared/store/installed';
import { useSession } from '../shared/store/session';
import { useUpdates } from '../shared/store/updates';
import type { MainTab } from './MainShell';

const TABS: ReadonlyArray<TabItem<MainTab>> = [
    { id: 'installed', label: 'Installed', 'data-testid': 'installed-tab' },
    { id: 'updates', label: 'Updates', 'data-testid': 'updates-tab' },
];

const isVulnerable = (metadata: ReadonlyMap<string, PackageMetadataLite> | undefined, id: string): boolean =>
    (metadata?.get(id.toLowerCase())?.vulnerabilities?.length ?? 0) > 0;

/** The Installed and Updates tabs with their counts: the list slices leave the shell with them (X38). */
export function MainTabs({ selected, onSelect, children }: { selected: MainTab; onSelect: (next: MainTab) => void; children: React.ReactNode }): React.JSX.Element {
    const { session } = useSession();
    const updatesSlice = useUpdates();
    const installedSlice = useInstalled();
    // The badge counts the updates the host answered; while it checks or cannot say, there is no number.
    const allProjects = useAllProjects();
    const all = allProjects.updates;
    // All Projects: the sum of the rows once every listed project has answered and every source was checked.
    const allCount = all.status === 'ready' && !all.sourcesUnavailable && (all.projects ?? []).every(project => all.chunks.get(project.path)?.error === undefined && all.chunks.has(project.path)) ? [...all.chunks.values()].reduce((count, chunk) => count + chunk.updates.length, 0) || undefined : undefined;
    // No `0` (MU6): an empty answer leaves the tab without a number.
    const updateCount = session?.selectedProject === ALL_PROJECTS ? allCount : updatesSlice.status === 'ready' && !updatesSlice.sourcesUnavailable ? updatesSlice.rows.length || undefined : undefined;
    // The Installed badge counts the packages the host listed: no number while loading, for an unsupported project
    // without packages, or for none at all (the Updates rule, MU6). All Projects counts once every project answered.
    const allListed = allProjects.status === 'ready' && (allProjects.projects ?? []).every(project => allProjects.chunks.get(project.path)?.result !== undefined);
    const allInstalled = allListed ? [...allProjects.chunks.values()].reduce((count, chunk) => count + (chunk.result?.packages.length ?? 0), 0) : 0;
    const singleInstalled = installedSlice.status === 'ready' ? installedSlice.result?.packages.length ?? 0 : 0;
    const installedCount = (session?.selectedProject === ALL_PROJECTS ? allInstalled : singleInstalled) || undefined;
    const counts: Partial<Record<string, number>> = { installed: installedCount, updates: updateCount };
    // The vulnerable packages, once the lite metadata is known: no number while it is not (empty is not unknown).
    const singleVulnerable = installedSlice.metadata.size === 0 ? undefined : (installedSlice.result?.packages.filter(entry => isVulnerable(installedSlice.metadata, entry.id)).length || undefined);
    const allVulnerable = allProjects.metadata.size === 0 ? undefined : [...allProjects.chunks.values()].reduce((count, chunk) => count + (chunk.result?.packages.filter(entry => isVulnerable(allProjects.metadata.get(chunk.projectPath), entry.id)).length ?? 0), 0) || undefined;
    const vulnerableCount = session?.selectedProject === ALL_PROJECTS ? allVulnerable : singleVulnerable;
    const tabs = TABS.map(item => {
        const counted = counts[item.id] !== undefined ? { ...item, count: counts[item.id] } : item;
        return item.id === 'installed' && vulnerableCount !== undefined
            ? { ...counted, badge: { label: String(vulnerableCount), title: `${vulnerableCount} package${vulnerableCount === 1 ? '' : 's'} with known vulnerabilities`, tone: 'error' as const } }
            : counted;
    });
    return <Tabs tabs={tabs} selected={selected} onSelect={onSelect} label="Package lists" data-testid="tab-bar">{children}</Tabs>;
}
