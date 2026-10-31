import { useEffect, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS } from '../../../../protocol';
import { isCentral, whyNotRemovable } from '../../../shared/installed/rules';
import { Banner, Button, EmptyState, Select, Tabs, type TabItem } from '../../../shared/primitives';
import { useAllProjects } from '../../../shared/store/allProjects';
import { useDetails, useDetailsActions } from '../../../shared/store/details';
import { useInstalled } from '../../../shared/store/installed';
import { useOps, useOpsActions } from '../../../shared/store/ops';
import { useProjects } from '../../../shared/store/projects';
import { useSession } from '../../../shared/store/session';
import { useSources } from '../../../shared/store/sources';
import { CentralUpdateDialog, type CentralUpdateRequest } from '../updates/CentralUpdateDialog';
import { DetailsInfo } from './DetailsInfo';
import { MultiInstallDialog } from './MultiInstallDialog';
import { ReadmeView } from './ReadmeView';
import { TransitiveDetails } from './TransitiveDetails';
import { useInstallAction } from './useInstallAction';

type DetailsTab = 'details' | 'readme';

const TABS: ReadonlyArray<TabItem<DetailsTab>> = [
    { id: 'details', label: 'Details', 'data-testid': 'details-tab-details' },
    { id: 'readme', label: 'README', 'data-testid': 'details-tab-readme' },
];

export interface DetailsPaneProps {
    /** Says a sentence through the one live region of the panel. */
    announce: (message: string) => void;
}

/**
 * What the primary button does with the chosen version: Install when the package is not installed, Update for a
 * newer version, Downgrade for an older one. The host lists versions newest first, so their order decides; a version
 * missing from the list (a prerelease installed while prereleases are hidden) cannot be compared and says Update.
 */
export function primaryAction(installedVersion: string | undefined, chosen: string, versions: readonly string[]): 'Install' | 'Update' | 'Downgrade' {
    if (installedVersion === undefined) {
        return 'Install';
    }
    const chosenIndex = versions.indexOf(chosen);
    const installedIndex = versions.indexOf(installedVersion);
    return chosenIndex >= 0 && installedIndex >= 0 && chosenIndex > installedIndex ? 'Downgrade' : 'Update';
}

/**
 * The details pane of the main panel (interaction model §7): the selected package with its installed version and
 * Uninstall, the version selector with Install, Update or Downgrade, and the Details and README tabs. Without a single
 * project nothing is changed from here; a stale selection is shown read-only with the project it belongs to.
 */
export function DetailsPane({ announce }: DetailsPaneProps): React.JSX.Element {
    const details = useDetails();
    const { chooseVersion, showReadme, retryVersions } = useDetailsActions();
    const installed = useInstalled();
    const all = useAllProjects();
    const allMode = useSession().committed?.selectedProject === ALL_PROJECTS;
    const [picking, setPicking] = useState(false);
    const { projects } = useProjects();
    const { sources } = useSources();
    const { isPackageBusy } = useOps();
    const { run } = useOpsActions();
    const [tab, setTab] = useState<DetailsTab>('details');
    // The preview of an update that changes a central version; an install's preview is the install action's (N77).
    const [centralPreview, setCentralPreview] = useState<CentralUpdateRequest | null>(null);
    const installAction = useInstallAction(announce);
    const { asking, cancel: cancelInstall } = installAction;

    // Another package or version starts on the Details tab; the same one made current again, or confirmed for another
    // project, keeps the tab.
    const shownKey = details.selection === null ? null : `${details.selection.packageId.toLowerCase()}@${details.selection.version}`;
    const [shownFor, setShownFor] = useState(shownKey);
    if (shownFor !== shownKey) {
        setShownFor(shownKey);
        setTab('details');
    }
    // Another package, or the pane going away, cancels a preview that is still being asked.
    useEffect(() => () => cancelInstall(), [shownKey, cancelInstall]);
    // A new selection asks no README until it is shown: on the README tab it is shown already.
    const readmeIdle = details.readme.status === 'idle';
    useEffect(() => {
        if (tab === 'readme' && readmeIdle) {
            showReadme();
        }
    }, [tab, readmeIdle, showReadme]);

    const { selection, version, versions, stale } = details;
    if (selection === null) {
        return <EmptyState message="Select a package to see its details." />;
    }
    if (selection.origin === 'transitive') {
        return <TransitiveDetails selection={selection} />;
    }

    const committedProject = installed.projectPath;
    // A row found by a search goes to the committed project (in All Projects, to the projects picked for it); an
    // installed or update row to its own project, also in All Projects (interaction model §3).
    const target = selection.origin === 'browse' ? committedProject : selection.projectPath;
    const pickProjects = allMode && selection.origin === 'browse' && !stale;
    const canChange = !stale && target !== null && (target === committedProject || allMode);
    const ownResult = target !== null && target !== committedProject ? all.chunks.get(target)?.result : installed.result;
    const entry = canChange ? ownResult?.packages.find(candidate => candidate.id.toLowerCase() === selection.packageId.toLowerCase()) : undefined;
    const installedVersion = entry === undefined ? undefined : (entry.resolvedVersion ?? entry.version);
    const list = versions.value ?? [];
    const chosen = version ?? selection.version;
    const action = primaryAction(installedVersion, chosen, list);
    const busy = target !== null && isPackageBusy(target, selection.packageId);
    const fixedVersion = entry !== undefined && (entry.versionType === 'floating' || entry.versionType === 'range');
    const removalBlocked = entry !== undefined && ownResult !== undefined ? whyNotRemovable(entry, ownResult) : undefined;
    const ownerName = projects?.find(project => project.path === selection.projectPath)?.name ?? selection.projectPath ?? '';
    // A search result not installed in the single project can also go to several projects of the workspace (MB4).
    const offerPicker = !allMode && selection.origin === 'browse' && !stale && entry === undefined && (projects?.length ?? 0) > 1;

    let primaryWhy: string | undefined;
    if (pickProjects) {
        primaryWhy = undefined;
    } else if (!canChange) {
        primaryWhy = stale ? 'Checking the selected project' : 'Select a single project to install or change this package';
    } else if (fixedVersion) {
        primaryWhy = 'A floating or ranged version is changed in the project file';
    } else if (entry?.declaration === 'unresolved') {
        primaryWhy = 'Its reference could not be resolved';
    } else if (installedVersion === chosen) {
        primaryWhy = 'This version is installed';
    }

    const fail = (what: string) => (error: unknown): void => announce(`${what} of ${selection.packageId} failed: ${error instanceof Error ? error.message : String(error)}`);
    const changeVersion = (): void => {
        if (pickProjects) {
            setPicking(true);
            return;
        }
        if (target === null || busy || asking || primaryWhy !== undefined) {
            return;
        }
        if (entry === undefined) {
            // The one install path of the main panel: the CPM preview, the listed-list and busy rules (N77).
            installAction.install({ packageId: selection.packageId, version: chosen, sourceUrl: selection.sourceUrl });
        } else if (isCentral(entry)) {
            setCentralPreview({ kind: 'update', projectPath: target, packageId: selection.packageId, fromVersion: installedVersion ?? entry.version, toVersion: chosen, sourceUrl: selection.sourceUrl });
        } else {
            run('ops/update', { projectPath: target, packageId: selection.packageId, version: chosen, sourceUrl: selection.sourceUrl }).catch(fail(action === 'Downgrade' ? 'Downgrade' : 'Update'));
        }
    };
    const uninstall = (): void => {
        if (target === null || busy || entry === undefined || removalBlocked !== undefined) {
            return;
        }
        run('ops/remove', { projectPath: target, packageId: selection.packageId }).catch(fail('Uninstall'));
    };

    const selectTab = (next: DetailsTab): void => {
        setTab(next);
        if (next === 'readme') {
            showReadme();
        }
    };

    return (
        <div className="nuiget-details">
            <div className="nuiget-details-header">
                <h2 className="nuiget-details-title">{selection.packageId}</h2>
                {stale ? <Banner severity="info">{`Showing ${selection.packageId} of ${ownerName} until the packages of the selected project are listed.`}</Banner> : null}
                {/* One grid for the installed and the version rows: label, value, action (P9.fix-5). */}
                <div className="nuiget-details-actions">
                    {entry !== undefined ? (
                        <>
                            <span className="nuiget-details-label">Installed:</span>
                            <span>{fixedVersion ? `${entry.version} → ${installedVersion}` : installedVersion}</span>
                            <Button
                                variant="secondary"
                                data-testid="uninstall-button"
                                disabled={busy || removalBlocked !== undefined}
                                title={removalBlocked}
                                onClick={uninstall}
                            >
                                Uninstall
                            </Button>
                        </>
                    ) : null}
                    <label className="nuiget-details-label" htmlFor="nuiget-details-version">Version:</label>
                    <Select
                        id="nuiget-details-version"
                        data-testid="version-selector"
                        value={chosen}
                        disabled={versions.status === 'loading' && list.length === 0}
                        onChange={chooseVersion}
                    >
                        {list.includes(chosen) ? null : <option value={chosen}>{versions.status === 'loading' ? `${chosen} (loading versions…)` : chosen}</option>}
                        {list.map(candidate => <option key={candidate} value={candidate}>{candidate === installedVersion ? `${candidate} (installed)` : candidate}</option>)}
                    </Select>
                    <Button
                        data-testid="install-update-button"
                        disabled={busy || asking || primaryWhy !== undefined}
                        title={primaryWhy}
                        onClick={changeVersion}
                    >
                        {busy ? 'Working…' : pickProjects ? 'Install…' : action}
                    </Button>
                    {offerPicker ? (
                        <Button
                            variant="secondary"
                            data-testid="multi-install-button"
                            disabled={busy || asking}
                            title="Install this version into several projects"
                            onClick={() => setPicking(true)}
                        >
                            Install in projects…
                        </Button>
                    ) : null}
                </div>
                {primaryWhy !== undefined && primaryWhy !== 'This version is installed' ? <p className="nuiget-details-note">{`${primaryWhy}.`}</p> : null}
                {entry !== undefined && isCentral(entry) ? (
                    <p className="nuiget-details-note">Its version is set centrally in Directory.Packages.props: updating changes it for every project that uses it; uninstalling removes it from this project only.</p>
                ) : null}
                {versions.status === 'ready' && list.length === 0 ? (
                    <p className="nuiget-details-note">
                        {sources?.find(source => source.url === selection.sourceUrl)?.isLocal === true
                            ? 'Versions of a local source cannot be listed.'
                            : 'No versions were found on the package sources.'}
                    </p>
                ) : null}
                {versions.error ? <Banner severity="error" action={{ label: 'Retry', onClick: retryVersions }}>{`Versions could not be listed: ${versions.error.message}`}</Banner> : null}
            </div>
            <Tabs tabs={TABS} selected={tab} onSelect={selectTab} label="Details sections">
                {tab === 'details' ? <DetailsInfo key={shownKey} /> : <ReadmeView announce={announce} />}
            </Tabs>
            <CentralUpdateDialog
                request={centralPreview}
                onClose={() => setCentralPreview(null)}
                onConfirm={() => {
                    const change = centralPreview;
                    setCentralPreview(null);
                    if (change !== null) {
                        run('ops/update', { projectPath: change.projectPath, packageId: change.packageId, version: change.toVersion, sourceUrl: change.sourceUrl }).catch(fail('Update'));
                    }
                }}
            />
            <CentralUpdateDialog request={installAction.preview} onClose={installAction.closePreview} onConfirm={installAction.confirmPreview} />
            <MultiInstallDialog
                open={picking}
                packageId={selection.packageId}
                version={chosen}
                onClose={() => setPicking(false)}
                onInstall={projectPaths => {
                    setPicking(false);
                    run('ops/bulkInstall', { projectPaths, packageId: selection.packageId, version: chosen }).catch(fail('Install'));
                }}
            />
        </div>
    );
}
