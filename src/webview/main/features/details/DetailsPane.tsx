import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { ALL_PROJECTS } from '../../../../protocol';
import { useMessageBus } from '../../../shared/bus/useMessageBus';
import { isCentral, whyNotRemovable, whyNotUpdatable } from '../../../shared/installed/rules';
import { Banner, EmptyState, Tabs, type TabItem } from '../../../shared/primitives';
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
    const [centralPreview, setCentralPreview] = useState<CentralUpdateRequest | null>(null);
    const bus = useMessageBus();
    // The preview asked before an install into a CPM project (N77); while it is asked, the primary button waits.
    const [asking, setAsking] = useState(false);
    const askController = useRef<AbortController | null>(null);

    // Another package or version starts on the Details tab; the same one made current again, or confirmed for another
    // project, keeps the tab.
    const shownKey = details.selection === null ? null : `${details.selection.packageId.toLowerCase()}@${details.selection.version}`;
    const [shownFor, setShownFor] = useState(shownKey);
    if (shownFor !== shownKey) {
        setShownFor(shownKey);
        setTab('details');
    }
    // Another package, or the pane going away, cancels a preview that is still being asked.
    useEffect(() => () => {
        askController.current?.abort();
        askController.current = null;
        setAsking(false);
    }, [shownKey]);
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

    let primaryWhy: string | undefined;
    if (pickProjects) {
        primaryWhy = undefined;
    } else if (!canChange) {
        primaryWhy = stale ? 'Checking the selected project' : 'Select a single project to install or change this package';
    } else if (fixedVersion) {
        primaryWhy = 'A floating or ranged version is changed in the project file';
    } else if (entry?.declaration === 'unresolved') {
        primaryWhy = 'Its reference could not be resolved';
    } else if (entry?.declaration === 'central-override' && ownResult !== undefined) {
        primaryWhy = whyNotUpdatable(entry, ownResult);
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
        const install = (): void => {
            run('ops/install', { projectPath: target, packageId: selection.packageId, version: chosen, sourceUrl: selection.sourceUrl }).catch(fail('Install'));
        };
        if (entry === undefined && ownResult?.isCpm !== true) {
            install();
        } else if (entry === undefined) {
            // An install into a CPM project sets the central version when the package has a central entry already:
            // the projects it reaches are shown first (ADR-004 tier 3). Without an entry it changes this project only.
            const controller = new AbortController();
            askController.current = controller;
            setAsking(true);
            const request: CentralUpdateRequest = { kind: 'install', projectPath: target, packageId: selection.packageId, toVersion: chosen, sourceUrl: selection.sourceUrl };
            bus.request('cpm/preview', { projectPath: target, packageId: selection.packageId, version: chosen }, { signal: controller.signal }).then(
                ({ result }) => {
                    if (result.preview === null) {
                        install();
                    } else {
                        setCentralPreview(result.preview.fromVersion === undefined ? request : { ...request, fromVersion: result.preview.fromVersion });
                    }
                },
                // Never install on an error: the dialog asks again and shows its own error with Retry.
                () => {
                    if (!controller.signal.aborted) {
                        setCentralPreview(request);
                    }
                },
            ).finally(() => {
                if (askController.current === controller) {
                    askController.current = null;
                    setAsking(false);
                }
            });
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
                {entry !== undefined ? (
                    <div className="nuiget-details-row">
                        <span className="nuiget-details-label">Installed:</span>
                        <span>{fixedVersion ? `${entry.version} → ${installedVersion}` : installedVersion}</span>
                        <button
                            type="button"
                            className="nuiget-button nuiget-button--secondary"
                            data-testid="uninstall-button"
                            disabled={busy || removalBlocked !== undefined}
                            title={removalBlocked}
                            onClick={uninstall}
                        >
                            Uninstall
                        </button>
                    </div>
                ) : null}
                <div className="nuiget-details-row">
                    <label className="nuiget-details-label" htmlFor="nuiget-details-version">Version:</label>
                    <select
                        id="nuiget-details-version"
                        className="nuiget-main-select"
                        data-testid="version-selector"
                        value={chosen}
                        disabled={versions.status === 'loading' && list.length === 0}
                        onChange={event => chooseVersion(event.target.value)}
                    >
                        {list.includes(chosen) ? null : <option value={chosen}>{versions.status === 'loading' ? `${chosen} (loading versions…)` : chosen}</option>}
                        {list.map(candidate => <option key={candidate} value={candidate}>{candidate === installedVersion ? `${candidate} (installed)` : candidate}</option>)}
                    </select>
                    <button
                        type="button"
                        className="nuiget-button"
                        data-testid="install-update-button"
                        disabled={busy || asking || primaryWhy !== undefined}
                        title={primaryWhy}
                        onClick={changeVersion}
                    >
                        {busy ? 'Working…' : pickProjects ? 'Install…' : action}
                    </button>
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
                {tab === 'details' ? <DetailsInfo /> : <ReadmeView />}
            </Tabs>
            <CentralUpdateDialog
                request={centralPreview}
                onClose={() => setCentralPreview(null)}
                onConfirm={() => {
                    const change = centralPreview;
                    setCentralPreview(null);
                    if (change !== null) {
                        const verb = change.kind === 'install' ? 'ops/install' : 'ops/update';
                        run(verb, { projectPath: change.projectPath, packageId: change.packageId, version: change.toVersion, sourceUrl: change.sourceUrl }).catch(fail(change.kind === 'install' ? 'Install' : 'Update'));
                    }
                }}
            />
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
