import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, type InstalledPackage, type InstalledResult, type ProjectInstalledChunk, type SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { axeRuleOutcome, expectFocusAfterClose, expectFocusOnListTabStop, installFakeLayout } from '../../../shared/primitives/testSupport';
import { consolidationUpdates, versionDrift } from '../../../shared/store/allProjects';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';
import { InstalledTab } from '../installed/InstalledTab';
import { ConsolidateTab } from '../updates/ConsolidateTab';
import { defaultTarget } from './ConsolidateDetails';
import { DetailsPane } from './DetailsPane';

const A = '/w/App/App.csproj';
const B = '/w/Lib/Lib.csproj';
const C = '/w/Tool/Tool.csproj';
const PROJECTS = [{ name: 'App', path: A }, { name: 'Lib', path: B }, { name: 'Tool', path: C }];
const ID = 'Newtonsoft.Json';
const snapshot = (rev: number): SessionSnapshot => ({ rev, selectedProject: ALL_PROJECTS, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const pkg = (version: string, more: Partial<InstalledPackage> = {}): InstalledPackage => ({ id: ID, version, versionType: 'standard', declaration: 'project', ...more });
const listed = (project: { name: string; path: string }, packages: InstalledPackage[], more: Partial<InstalledResult> = {}): ProjectInstalledChunk => ({
    projectPath: project.path, projectName: project.name, result: { projectPath: project.path, fidelity: 'authoritative', isCpm: false, packages, ...more },
});
// App 12.0.1 and Lib 13.0.2 can change; Tool's 13.0.3 is set centrally (held) and is in use.
const DRIFT: ProjectInstalledChunk[] = [
    listed(PROJECTS[0], [pkg('12.0.1')]),
    listed(PROJECTS[1], [pkg('13.0.2')]),
    listed(PROJECTS[2], [pkg('13.0.3', { declaration: 'central', definedIn: '/w/Directory.Packages.props' })], { isCpm: true }),
];
const LIST = { packageId: ID, versions: ['13.0.4', '13.0.3', '13.0.2', '12.0.1'], vulnerableVersions: ['12.0.1'] };

document.body.setAttribute('data-package-icon', 'https://file+.vscode-resource.vscode-cdn.net/ext/resources/package-icon.png');

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

async function mount(): Promise<FakeHost> {
    const host = createFakeHost();
    render(
        <StoreProvider bus={host.bus}>
            <MainShell installed={view => <InstalledTab {...view} />} consolidate={view => <ConsolidateTab {...view} />} details={view => <DetailsPane {...view} />} />
        </StoreProvider>,
    );
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: PROJECTS }, 1));
    return host;
}

async function stream(host: FakeHost, chunks: ProjectInstalledChunk[], answer = true, index = 0): Promise<void> {
    const request = host.requests('allProjects/installed')[index];
    await hostSays(() => host.chunk(request, { kind: 'start', projects: PROJECTS }));
    for (const chunk of chunks) {
        await hostSays(() => host.chunk(request, { kind: 'project', chunk }));
    }
    if (answer) {
        await hostSays(() => host.respond(request, { projectPaths: PROJECTS.map(project => project.path), errored: [] }));
    }
}

const row = (): HTMLElement => within(screen.getByTestId(`package-row-${ID.toLowerCase()}`)).getByRole('option');
const select = (): HTMLSelectElement => screen.getByTestId('version-selector') as HTMLSelectElement;
const optionTexts = (): string[] => [...select().options].map(option => option.textContent ?? '');

/** All Projects read, the Consolidate tab shown and the Newtonsoft.Json row pressed; the versions answered unless `list` is null. */
async function shown(list: typeof LIST | null = LIST): Promise<{ host: FakeHost; user: ReturnType<typeof userEvent.setup> }> {
    const user = userEvent.setup();
    const host = await mount();
    await stream(host, DRIFT);
    await user.click(screen.getByTestId('consolidate-tab'));
    await user.click(row());
    if (list !== null) {
        await hostSays(() => host.respond(host.requests('package/versions')[0], list));
    }
    return { host, user };
}

describe('the Consolidate pane (UX-P5.3c, F3)', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 600, row: 72 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('the default target is the first listed version in use, else the list\'s first', () => {
        const [entry] = versionDrift({ status: 'ready', projects: PROJECTS, chunks: new Map(DRIFT.map(chunk => [chunk.projectPath, chunk])) }).entries;
        expect(defaultTarget(['13.0.4', '13.0.3', '13.0.2'], entry)).toBe('13.0.3');
        expect(defaultTarget(['14.0.0', '13.0.4'], entry)).toBe('14.0.0');
        expect(defaultTarget([], entry)).toBeUndefined();
    });

    it('applies the default once the projects are read and the versions listed: a version only a held reference uses is in use, and the details are asked once, for it', async () => {
        const { host } = await shown();
        expect(select().value).toBe('13.0.3');
        expect(optionTexts()).toEqual(['13.0.4', '13.0.3 (in use)', '13.0.2 (in use)', '12.0.1 (in use, vulnerable)']);
        expect(host.requests('package/metadata').map(request => request.payload.version)).toEqual(['13.0.3']);
        expect(screen.queryByTestId('install-update-button')).toBeNull();
        expect(screen.queryByTestId('uninstall-button')).toBeNull();
        expect(screen.getByTestId('consolidate-button')).toBeEnabled();
    });

    it('leads the Details tab panel with the Projects section in the loading, error and empty metadata states', async () => {
        const { host } = await shown();
        const section = (): HTMLElement => screen.getByTestId('consolidate-projects');
        expect(screen.getByTestId('details-progress')).toBeInTheDocument();
        expect(section().closest('.nuiget-details-lead')).not.toBeNull();
        expect(within(section()).getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
        expect(within(section()).getAllByRole('term').map(term => term.textContent)).toEqual(['App', 'Lib', 'Tool']);
        expect(within(section()).getByRole('heading', { name: 'Not Changed' })).toBeInTheDocument();
        expect(section()).toHaveTextContent(`13.0.3 ${ID} is set in the central package file of Tool.`);
        await hostSays(() => host.fail(host.requests('package/metadata')[0], 'failed', 'The feed did not answer'));
        expect(screen.getByTestId('details-error')).toBeInTheDocument();
        expect(section()).toBeInTheDocument();
    });

    it('a list answer during the projects\' first load applies no default until they are read, then once', async () => {
        const user = userEvent.setup();
        const host = await mount();
        await stream(host, DRIFT, false);
        await user.click(screen.getByTestId('consolidate-tab'));
        await user.click(row());
        await hostSays(() => host.respond(host.requests('package/versions')[0], LIST));
        expect(select()).toBeDisabled();
        expect(optionTexts()).toEqual(['12.0.1 (loading versions...)']);
        expect(screen.getByTestId('consolidate-button')).toHaveAttribute('title', 'The projects are being read.');
        expect(host.requests('package/metadata')).toHaveLength(0);
        await hostSays(() => host.respond(host.requests('allProjects/installed')[0], { projectPaths: PROJECTS.map(project => project.path), errored: [] }));
        expect(select().value).toBe('13.0.3');
        expect(host.requests('package/metadata').map(request => request.payload.version)).toEqual(['13.0.3']);
    });

    it('a later answer moves neither the default nor a chosen version', async () => {
        const { host, user } = await shown();
        // The projects are read again and Lib now uses 13.0.4: the default stays.
        await hostSays(() => host.invalidate([['projects', 2]]));
        await stream(host, [DRIFT[0], listed(PROJECTS[1], [pkg('13.0.4')]), DRIFT[2]], true, 1);
        expect(select().value).toBe('13.0.3');
        await user.selectOptions(select(), '13.0.2');
        await hostSays(() => host.invalidate([['projects', 3]]));
        await stream(host, DRIFT, true, 2);
        expect(select().value).toBe('13.0.2');
    });

    it('a view round trip shows the default again; a press on the row already shown keeps the choice', async () => {
        const { user } = await shown();
        await user.selectOptions(select(), '13.0.2');
        await user.click(row());
        expect(select().value).toBe('13.0.2');
        await user.click(screen.getByTestId('installed-tab'));
        await user.click(screen.getByTestId('consolidate-tab'));
        expect(select().value).toBe('13.0.3');
    });

    it('versions failed: Consolidate... is disabled with its reason and the details of the start version are asked; Retry applies the default', async () => {
        const { host, user } = await shown(null);
        await hostSays(() => host.fail(host.requests('package/versions')[0], 'failed', 'The feed did not answer'));
        expect(screen.getByTestId('consolidate-button')).toBeDisabled();
        expect(screen.getByTestId('consolidate-button')).toHaveAttribute('title', 'The versions could not be listed.');
        expect(host.requests('package/metadata').map(request => request.payload.version)).toEqual(['12.0.1']);
        await user.click(within(screen.getByTestId('details-header')).getByRole('button', { name: 'Retry' }));
        await hostSays(() => host.respond(host.requests('package/versions')[1], LIST));
        expect(select().value).toBe('13.0.3');
    });

    it('says why Consolidate... is disabled: nothing to change at the chosen version, an operation running, the package no longer drifting', async () => {
        const user = userEvent.setup();
        const host = await mount();
        // App and Lib at 12.0.1, Tool's central 13.0.3: at 12.0.1 nothing that can change would.
        await stream(host, [listed(PROJECTS[0], [pkg('12.0.1')]), listed(PROJECTS[1], [pkg('12.0.1')]), DRIFT[2]]);
        await user.click(screen.getByTestId('consolidate-tab'));
        await user.click(row());
        await hostSays(() => host.respond(host.requests('package/versions')[0], LIST));
        await user.selectOptions(select(), '12.0.1');
        expect(screen.getByTestId('consolidate-button')).toBeDisabled();
        expect(screen.getByText('Every project that can change already uses this version.')).toBeInTheDocument();
        await user.selectOptions(select(), '13.0.3');
        await hostSays(() => host.event('ops/progress', { opId: 'op-1', status: 'running', kind: 'update', projectPaths: [A], packageIds: [ID] }));
        expect(screen.getByTestId('consolidate-button')).toBeDisabled();
        expect(screen.getByTestId('consolidate-button')).toHaveTextContent('Updating');
        expect(screen.getByTestId('consolidate-button')).toHaveAttribute('title', 'An operation on this package is running.');
        await hostSays(() => host.event('ops/progress', { opId: 'op-1', status: 'cancelled', kind: 'update', projectPaths: [A], packageIds: [ID] }));
        // Every project now uses 13.0.3: the selection stays, the section goes, the sentence says why.
        await hostSays(() => host.invalidate([['projects', 2]]));
        await stream(host, [listed(PROJECTS[0], [pkg('13.0.3')]), listed(PROJECTS[1], [pkg('13.0.3')]), DRIFT[2]], true, 1);
        expect(screen.getByTestId('consolidate-details-empty')).toHaveTextContent('No longer referenced at different versions.');
        expect(screen.queryByTestId('consolidate-projects')).toBeNull();
        expect(screen.getByRole('heading', { name: ID })).toBeInTheDocument();
        expect(screen.getByTestId('consolidate-button')).toBeDisabled();
    });

    /** UX-P5.fix-15: the Newtonsoft.Json row pressed while the projects stream, the versions listed, then the final lists no longer drift. */
    async function ended(): Promise<{ host: FakeHost; user: ReturnType<typeof userEvent.setup> }> {
        const user = userEvent.setup();
        const host = await mount();
        await stream(host, DRIFT, false);
        await user.click(screen.getByTestId('consolidate-tab'));
        await user.click(row());
        await hostSays(() => host.respond(host.requests('package/versions')[0], LIST));
        const request = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: listed(PROJECTS[0], [pkg('13.0.3')]) }));
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: listed(PROJECTS[1], [pkg('13.0.3')]) }));
        await hostSays(() => host.respond(request, { projectPaths: PROJECTS.map(project => project.path), errored: [] }));
        return { host, user };
    }

    it('an entry that stops drifting before the first offer ends the loading: the start version\'s details are asked once and the sentence says why (UX-P5.fix-15)', async () => {
        const { host } = await ended();
        expect(host.requests('package/metadata').map(request => request.payload.version)).toEqual(['12.0.1']);
        expect(screen.getByTestId('consolidate-details-empty')).toHaveTextContent('No longer referenced at different versions.');
        expect(screen.getByTestId('consolidate-button')).toBeDisabled();
        expect(screen.getByTestId('consolidate-button')).toHaveAccessibleDescription('No longer referenced at different versions.');
        expect(screen.queryByTestId('consolidate-projects')).toBeNull();
        expect(screen.getByRole('heading', { name: ID })).toBeInTheDocument();
        expect(select()).toBeEnabled();
        expect(select().value).toBe('12.0.1');
        expect(optionTexts().filter(text => /\((in use|installed)\)/.test(text))).toEqual([]);
        await hostSays(() => host.respond(host.requests('package/metadata')[0], { metadata: null }));
        expect(screen.queryByTestId('details-progress')).toBeNull();
        expect(document.querySelector('.nuiget-skeleton')).toBeNull();
        // A revalidation with the same lists keeps what is shown: no bar, no second request (DS-STATE-2).
        await hostSays(() => host.invalidate([['projects', 2]]));
        await stream(host, [listed(PROJECTS[0], [pkg('13.0.3')]), listed(PROJECTS[1], [pkg('13.0.3')]), DRIFT[2]], true, 1);
        expect(screen.queryByTestId('details-progress')).toBeNull();
        expect(host.requests('package/metadata')).toHaveLength(1);
    });

    it('an entry that drifts again after it ended gets the default once (UX-P5.fix-15)', async () => {
        const { host } = await ended();
        await hostSays(() => host.invalidate([['projects', 2]]));
        await stream(host, DRIFT, true, 1);
        expect(select().value).toBe('13.0.3');
    });

    it('a first load that fails ends the loading: the start version\'s details, the selector enabled, and Consolidate... says the projects could not be read (UX-P5.fix-15)', async () => {
        const user = userEvent.setup();
        const host = await mount();
        await stream(host, DRIFT, false);
        await user.click(screen.getByTestId('consolidate-tab'));
        await user.click(row());
        await hostSays(() => host.respond(host.requests('package/versions')[0], LIST));
        await hostSays(() => host.fail(host.requests('allProjects/installed')[0], 'failed', 'The projects could not be evaluated'));
        expect(host.requests('package/metadata').map(request => request.payload.version)).toEqual(['12.0.1']);
        expect(select()).toBeEnabled();
        expect(screen.getByTestId('consolidate-button')).toBeDisabled();
        expect(screen.getByTestId('consolidate-button')).toHaveAttribute('title', 'The projects could not be read.');
        expect(screen.getByTestId('consolidate-projects')).toBeInTheDocument();
        await hostSays(() => host.respond(host.requests('package/metadata')[0], { metadata: null }));
        expect(screen.queryByTestId('details-progress')).toBeNull();
        await user.click(within(screen.getByTestId('consolidate-error')).getByRole('button', { name: 'Retry' }));
        await stream(host, DRIFT, true, 1);
        expect(select().value).toBe('13.0.3');
    });

    it('an entry whose every reference is held lists no empty Projects list: Not Changed says why and the note explains the disabled button (UX-P5.fix-15)', async () => {
        const user = userEvent.setup();
        const host = await mount();
        const sdk = { isImplicit: true, declaration: 'props' as const, definedIn: '/sdk/Microsoft.NET.Sdk.props' };
        await stream(host, [listed(PROJECTS[0], [pkg('12.0.1', sdk)]), listed(PROJECTS[1], [pkg('13.0.2', sdk)]), listed(PROJECTS[2], [])]);
        await user.click(screen.getByTestId('consolidate-tab'));
        await user.click(row());
        await hostSays(() => host.respond(host.requests('package/versions')[0], LIST));
        const projects = screen.getByTestId('consolidate-projects');
        expect([...projects.querySelectorAll('dl')].filter(list => list.querySelector('dt') === null)).toHaveLength(0);
        expect(within(projects).getByRole('heading', { name: 'Not Changed' })).toBeInTheDocument();
        expect(within(projects).getAllByText(`${ID} is added by the .NET SDK.`)).toHaveLength(2);
        expect(screen.getByTestId('consolidate-button')).toBeDisabled();
        expect(screen.getByTestId('consolidate-button')).toHaveAccessibleDescription('No reference of this package can be changed from here.');
        expect(await axe(screen.getByTestId('package-details-panel'))).toHaveNoViolations();
    });

    it('confirms with the changeable projects only and sends their payload; Cancel and Confirm leave the focus on the button and the list', async () => {
        const { host, user } = await shown();
        await user.click(screen.getByTestId('consolidate-button'));
        const dialog = screen.getByRole('alertdialog', { name: `Consolidate ${ID} to 13.0.3?` });
        expect(within(dialog).getAllByRole('listitem').map(item => item.textContent)).toEqual([`${ID} 12.0.1 → 13.0.3`, `${ID} 13.0.2 → 13.0.3`]);
        expect(dialog).toHaveTextContent('In App:');
        expect(within(dialog).queryByText(/Tool/)).toBeNull();
        expect(axeRuleOutcome(await axe(document.body), 'aria-dialog-name')).toBe('passes');
        await user.click(screen.getByTestId('confirm-dialog-cancel'));
        expect(screen.getByTestId('consolidate-button')).toHaveFocus();
        expectFocusAfterClose('consolidate-cancel');
        await user.click(screen.getByTestId('consolidate-button'));
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        const [entry] = versionDrift({ status: 'ready', projects: PROJECTS, chunks: new Map(DRIFT.map(chunk => [chunk.projectPath, chunk])) }).entries;
        expect(host.requests('ops/bulkUpdateAllProjects').map(request => request.payload)).toEqual([{ projectUpdates: consolidationUpdates(entry, '13.0.3') }]);
        expect(host.requests('cpm/preview')).toHaveLength(0);
        expectFocusOnListTabStop('consolidate-list');
        expectFocusAfterClose('consolidate-confirm');
    });

    it('a refused consolidation is announced', async () => {
        const { host, user } = await shown();
        await user.click(screen.getByTestId('consolidate-button'));
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        await hostSays(() => host.fail(host.requests('ops/bulkUpdateAllProjects')[0], 'failed', 'The queue is closed'));
        await waitFor(() => expect(screen.getByTestId('status-live')).toHaveTextContent('Consolidate failed: The queue is closed'));
    });

    it('has no axe violations with the pane and the dialog open', async () => {
        const { user } = await shown();
        expect(await axe(document.body)).toHaveNoViolations();
        await user.click(screen.getByTestId('consolidate-button'));
        expect(await axe(document.body)).toHaveNoViolations();
    });
});
