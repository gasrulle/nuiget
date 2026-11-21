import { useEffect, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS } from '../../protocol';
import { directVulnerability, transitiveVulnerability } from '../shared/installed/rules';
import { type TabItem, Tabs } from '../shared/primitives';
import { useAllProjects } from '../shared/store/allProjects';
import { useInstalled } from '../shared/store/installed';
import { useSession } from '../shared/store/session';
import { useTransitive } from '../shared/store/transitive';
import { useUpdates } from '../shared/store/updates';
import { allProjectsKnowledge, singleKnowledge } from '../shared/updates/updateAll';
import { aggregateVulnerability } from './features/installed/AllProjectsTransitiveSection';
import type { MainTab } from './MainShell';

const TABS: ReadonlyArray<TabItem<MainTab>> = [
    { id: 'installed', label: 'Installed', 'data-testid': 'installed-tab' },
    { id: 'updates', label: 'Updates', 'data-testid': 'updates-tab' },
];

/** The Installed and Updates tabs with their counts: the list slices leave the shell with them (X38). */
export function MainTabs({ selected, onSelect, children }: { selected: MainTab; onSelect: (next: MainTab) => void; children: React.ReactNode }): React.JSX.Element {
    const { session } = useSession();
    const updatesSlice = useUpdates();
    const installedSlice = useInstalled();
    const transitiveSlice = useTransitive();
    // The badge counts the updates the host answered; while it checks or cannot say, there is no number.
    const allProjects = useAllProjects();
    const all = allProjects.updates;
    // All Projects: the sum of the rows once every listed project has answered and every source was checked.
    // The one rule of a known list the toolbars share (UX-P3.11).
    const allCount = allProjectsKnowledge(all) === 'known' ? [...all.chunks.values()].reduce((count, chunk) => count + chunk.updates.length, 0) || undefined : undefined;
    // No `0` (MU6): an empty answer leaves the tab without a number.
    const updateCount = session?.selectedProject === ALL_PROJECTS ? allCount : singleKnowledge(updatesSlice) === 'known' ? updatesSlice.rows.length || undefined : undefined;
    // The Installed badge counts the packages the host listed: no number while loading, for an unsupported project
    // without packages, or for none at all (the Updates rule, MU6). All Projects counts once every project answered.
    const allListed = allProjects.status === 'ready' && (allProjects.projects ?? []).every(project => allProjects.chunks.get(project.path)?.result !== undefined);
    const allInstalled = allListed ? [...allProjects.chunks.values()].reduce((count, chunk) => count + (chunk.result?.packages.length ?? 0), 0) : 0;
    const singleInstalled = installedSlice.status === 'ready' ? installedSlice.result?.packages.length ?? 0 : 0;
    const installedCount = (session?.selectedProject === ALL_PROJECTS ? allInstalled : singleInstalled) || undefined;
    const counts: Partial<Record<string, number>> = { installed: installedCount, updates: updateCount };
    // The rows `@vulnerable` would show that are known vulnerable, direct plus transitive (UX-P5.1a): no number at 0 or while
    // nothing is known (empty is not unknown); an unknown part adds nothing and removes nothing.
    const singleDirect = installedSlice.result?.packages.filter(entry => directVulnerability(installedSlice.metadata, entry.id) === 'vulnerable').length ?? 0;
    const singleTransitive = transitiveSlice.projectPath === installedSlice.projectPath ? transitiveVulnerability(transitiveSlice.result, transitiveSlice.metadata).vulnerable : 0;
    const singleVulnerable = singleDirect + singleTransitive || undefined;
    // All Projects: each project's direct rows plus the aggregate's transitive rows (a package in three projects is one row there).
    const allDirect = [...allProjects.chunks.values()].reduce((count, chunk) => count + (chunk.result?.packages.filter(entry => directVulnerability(allProjects.metadata.get(chunk.projectPath) ?? new Map(), entry.id) === 'vulnerable').length ?? 0), 0);
    const allVulnerable = allDirect + (allProjects.transitive.enabled ? aggregateVulnerability(allProjects.transitive).vulnerable : 0) || undefined;
    const vulnerableCount = session?.selectedProject === ALL_PROJECTS ? allVulnerable : singleVulnerable;
    // The settle truth of the capture harness (UX-P5.1a, `data-pending`): the Installed tab is pending from the list's (or All
    // Projects' fan-out's) answer until both metadata parts first settled for that view, latched per view; never on a re-ask.
    const allMode = session?.selectedProject === ALL_PROJECTS;
    const singlePath = allMode ? (allProjects.active ? ALL_PROJECTS : null) : installedSlice.projectPath;
    const bothSettled = allMode
        ? allProjects.metadataSettled && allProjects.transitive.settled
        : installedSlice.metadataSettled && transitiveSlice.settled && transitiveSlice.projectPath === singlePath;
    const listAnswered = allMode ? allProjects.status === 'ready' : installedSlice.status === 'ready';
    const [settledFor, setSettledFor] = useState<string | null>(null);
    useEffect(() => {
        if (singlePath !== null && bothSettled) {
            setSettledFor(singlePath);
        }
    }, [singlePath, bothSettled]);
    const installedPending = singlePath !== null && listAnswered && settledFor !== singlePath && !bothSettled;
    const tabs = TABS.map(item => {
        const counted = counts[item.id] !== undefined ? { ...item, count: counts[item.id] } : item;
        const pending = item.id === 'installed' && installedPending ? { ...counted, pending: true } : counted;
        return item.id === 'installed' && vulnerableCount !== undefined
            ? { ...pending, badge: { label: String(vulnerableCount), title: `${vulnerableCount} package${vulnerableCount === 1 ? '' : 's'} with known vulnerabilities`, tone: 'error' as const } }
            : pending;
    });
    return <Tabs tabs={tabs} selected={selected} onSelect={onSelect} label="Package lists" data-testid="tab-bar">{children}</Tabs>;
}
