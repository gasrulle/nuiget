import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, resourceKeys, type InstalledPackage, type InstalledResult, type PackageUpdate, type SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { axeRuleOutcome, expectFocusAfterClose, installFakeLayout } from '../../../shared/primitives/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';
import { InstalledTab } from '../installed/InstalledTab';
import { UpdatesTab } from './UpdatesTab';

const A = '/w/App/App.csproj';
const FEED = 'https://feed.example/v3/index.json';
const snapshot = (rev: number, selectedProject = A): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const pkg = (id: string, changes: Partial<InstalledPackage> = {}): InstalledPackage => ({ id, version: '1.0.0', versionType: 'standard', declaration: 'project', ...changes });
const installed = (packages: InstalledPackage[]): InstalledResult => ({ projectPath: A, fidelity: 'authoritative', isCpm: false, packages });
const update = (id: string, installedVersion: string, latestVersion: string): PackageUpdate => ({ id, installedVersion, latestVersion, sourceUrl: FEED });
const UPDATES = [update('Serilog', '3.0.0', '3.1.0'), update('Moq', '4.20.0', '4.20.72'), update('Newtonsoft.Json', '13.0.1', '13.0.3')];

// The bundled default icon the host puts on the root; `defaultPackageIcon()` keeps the first value it finds.
const DEFAULT_ICON = 'https://file+.vscode-resource.vscode-cdn.net/ext/resources/package-icon.png';
const DATA = 'data:image/png;base64,AAAA';
document.body.setAttribute('data-package-icon', DEFAULT_ICON);

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

/** The panel on project A, its packages listed, the Updates tab shown. */
async function mountWith(answer: { updates: PackageUpdate[]; sourcesUnavailable?: boolean } | null = { updates: UPDATES }, selectedProject = A, packages: InstalledPackage[] = [pkg('Serilog', { version: '3.0.0' }), pkg('Moq', { version: '4.20.0' }), pkg('Newtonsoft.Json', { version: '13.0.1', declaration: 'central' })]): Promise<FakeHost> {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><MainShell installed={view => <InstalledTab {...view} />} updates={view => <UpdatesTab {...view} />} /></StoreProvider>);
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, selectedProject)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
    if (selectedProject === A) {
        await hostSays(() => host.respond(host.requests('installed/get')[0], installed(packages), 1));
        if (answer !== null) {
            await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, ...answer }, 1));
        }
    }
    await userEvent.setup().click(screen.getByTestId('updates-tab'));
    return host;
}

/** A package row's focusable item: a treeitem of the single project's grouped list (UX-P3.1a), and of the All Projects tree (UX-P3.1b). */
const ROW_ITEM = '[role="treeitem"], [role="option"]';
const optionOf = (id: string): HTMLElement => {
    const item = screen.getByTestId(`package-row-${id.toLowerCase()}`).querySelector<HTMLElement>(ROW_ITEM);
    if (item === null) {
        throw new Error(`no row item for ${id}`);
    }
    return item;
};
const iconOf = (row: HTMLElement): string | null | undefined => row.querySelector('.nuiget-row-icon img')?.getAttribute('src');
const names = (): string[] => {
    const list = screen.queryByTestId('updates-list');
    return list === null ? [] : [...list.querySelectorAll('.nuiget-row-name')].map(element => element.textContent ?? '');
};

describe('main panel: Updates tab', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 400, row: 44 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('lists the updates under the Direct packages group row of one grouped list, with their versions, counts them on the tab and passes axe', async () => {
        await mountWith();
        const list = screen.getByTestId('updates-list');
        // One grouped list per view (D48, UX-P3.1a): a tree whose first item is the Direct packages group row.
        expect(list).toHaveAttribute('role', 'tree');
        expect(list).toHaveAttribute('aria-multiselectable', 'true');
        expect(list).toHaveAccessibleName('Updates');
        const group = within(screen.getByTestId('group-row-direct')).getByRole('treeitem');
        expect(group).toHaveAttribute('aria-level', '1');
        expect(group).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByTestId('section-box-direct')).toHaveTextContent('Direct packages');
        expect(optionOf('Serilog')).toHaveAttribute('aria-level', '2');
        expect(names()).toEqual(['Moq', 'Newtonsoft.Json', 'Serilog']);
        expect(screen.getByTestId('package-row-serilog')).toHaveTextContent('3.0.0 → 3.1.0');
        expect(optionOf('Newtonsoft.Json')).toHaveAccessibleDescription(/Centrally managed/);
        expect(screen.getByTestId('updates-tab')).toHaveAccessibleName(/Updates\s+3/);
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-required-children')).toBe('passes');
    });

    it('the group row Direct packages counts the shown updates, reads k of N under a filter and collapses its rows', async () => {
        const user = userEvent.setup();
        await mountWith();
        const count = (): string | null | undefined => screen.getByTestId('section-box-direct').querySelector('.nuiget-badge--count')?.textContent;
        expect(count()).toBe('3');
        await user.type(screen.getByTestId('search-input'), '@updates Se');
        await waitFor(() => expect(names()).toEqual(['Serilog']));
        // Under a filter the count is the text `k of N`, not a badge (DS-COPY-5).
        expect(screen.getByTestId('section-box-direct')).toHaveTextContent('1 of 3');
        expect(count()).toBeUndefined();
        await user.clear(screen.getByTestId('search-input'));
        await waitFor(() => expect(names()).toHaveLength(3));
        const group = within(screen.getByTestId('group-row-direct')).getByRole('treeitem');
        await user.click(group);
        expect(group).toHaveAttribute('aria-expanded', 'false');
        expect(names()).toEqual([]);
        await user.keyboard('{ArrowRight}');
        expect(group).toHaveAttribute('aria-expanded', 'true');
        expect(names()).toEqual(['Moq', 'Newtonsoft.Json', 'Serilog']);
    });

    it('streams the found rows before the answer and asks again under the prerelease flag the host commits', async () => {
        const host = await mountWith(null);
        const [request] = host.requests('updates/get');
        expect(request.payload).toEqual({ projectPath: A, includePrerelease: false });
        await hostSays(() => host.chunk(request, { kind: 'found', update: UPDATES[0] }));
        expect(names()).toEqual(['Serilog']);
        await hostSays(() => host.event('session/changed', { ...snapshot(2), includePrerelease: true }));
        expect(host.requests('updates/get').map(sent => sent.payload)).toEqual([{ projectPath: A, includePrerelease: false }, { projectPath: A, includePrerelease: true }]);
    });

    it('Space on a busy row says an operation runs and leaves the bulk selection as it was (UX-P3.1a)', async () => {
        const user = userEvent.setup();
        await mountWith();
        await user.click(optionOf('Serilog'));
        await user.keyboard('{Enter}');
        expect(optionOf('Serilog')).toHaveAttribute('aria-busy', 'true');
        await user.keyboard(' ');
        await waitFor(() => expect(screen.getByTestId('status-live')).toHaveTextContent('An operation on this package is running.'));
        expect(screen.getByTestId('update-all-button')).toHaveTextContent('Update all (1)');
    });

    it('Enter or the row button updates one package to its latest version, and the row is busy until the outcome', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(optionOf('Serilog'));
        await user.keyboard('{Enter}');
        expect(host.requests('ops/update').map(sent => sent.payload)).toEqual([{ projectPath: A, packageId: 'Serilog', version: '3.1.0', sourceUrl: FEED }]);
        expect(optionOf('Serilog')).toHaveAttribute('aria-busy', 'true');

        await user.click(within(screen.getByTestId('package-row-moq')).getByTestId('row-action-update'));
        expect(host.requests('ops/update').map(sent => sent.payload.packageId)).toEqual(['Serilog', 'Moq']);
    });

    it('Update all confirms the packages and their versions, and leaves the centrally managed ones out', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        // The toolbar box of the measurements (UX-P0.10).
        expect(screen.getByTestId('updates-toolbar')).toContainElement(screen.getByTestId('update-all-button'));
        expect(screen.getByTestId('update-all-button')).toHaveTextContent('Update all (2)');
        expect(screen.getByTestId('update-all-button')).not.toHaveAttribute('title');
        await user.click(screen.getByTestId('update-all-button'));
        const dialog = screen.getByRole('alertdialog', { name: 'Update 2 packages?' });
        expect(within(dialog).getByText('Serilog: 3.0.0 → 3.1.0')).toBeInTheDocument();
        expect(within(dialog).queryByText(/Newtonsoft/)).toBeNull();
        expect(axeRuleOutcome(await axe(document.body), 'aria-dialog-name')).toBe('passes');
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expectFocusAfterClose('updates-update-all-confirm');
        expect(host.requests('ops/bulkUpdate').map(sent => sent.payload)).toEqual([{ projectPath: A, packages: [
            { id: 'Moq', version: '4.20.72', sourceUrl: FEED },
            { id: 'Serilog', version: '3.1.0', sourceUrl: FEED },
        ] }]);
    });

    it('Space selects for the bulk update; a centrally managed package cannot be selected', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(optionOf('Moq'));
        await user.keyboard(' ');
        expect(screen.getByTestId('update-all-button')).toHaveTextContent('Update selected (1)');
        await user.click(optionOf('Newtonsoft.Json'));
        await user.keyboard(' ');
        await waitFor(() => expect(screen.getByTestId('status-live')).toHaveTextContent('Newtonsoft.Json is centrally managed'));
        await user.click(screen.getByTestId('update-all-button'));
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expectFocusAfterClose('updates-update-selected-confirm');
        expect(host.requests('ops/bulkUpdate')[0].payload.packages.map(entry => entry.id)).toEqual(['Moq']);
    });

    it('a selected update that the filter hides leaves the bulk selection and is not selected when it shows again', async () => {
        const user = userEvent.setup();
        await mountWith();
        await user.click(optionOf('Moq'));
        await user.keyboard(' ');
        expect(screen.getByTestId('update-all-button')).toHaveTextContent('Update selected (1)');
        await user.type(screen.getByTestId('search-input'), '@updates Se');
        await waitFor(() => expect(names()).toEqual(['Serilog']));
        expect(screen.getByTestId('update-all-button')).toHaveTextContent('Update all (1)');
        await user.clear(screen.getByTestId('search-input'));
        await waitFor(() => expect(names()).toHaveLength(3));
        // The bulk set keeps only candidates (UX-P2.1c): Moq came back unselected.
        expect(optionOf('Moq')).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByTestId('update-all-button')).toHaveTextContent('Update all (2)');
    });

    it('a centrally managed package asks for the preview, lists the projects it changes and updates only when confirmed', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(optionOf('Newtonsoft.Json'));
        await user.keyboard('{Enter}');
        const dialog = screen.getByTestId('cpm-preview-dialog');
        expect(dialog).toHaveAccessibleName('Newtonsoft.Json is centrally managed');
        expect(host.requests('cpm/preview').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Newtonsoft.Json', version: '13.0.3' }]);
        await hostSays(() => host.respond(host.requests('cpm/preview')[0], { preview: { centralPropsPath: '/w/Directory.Packages.props', packageId: 'Newtonsoft.Json', fromVersion: '13.0.1', toVersion: '13.0.3', affectedProjects: [A, '/w/Lib/Lib.csproj'] } }));
        expect(within(dialog).getAllByRole('listitem').map(item => item.textContent)).toEqual(['App', 'Lib.csproj']);
        expect(axeRuleOutcome(await axe(document.body), 'aria-dialog-name')).toBe('passes');
        // Cancel sends nothing.
        await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByTestId('cpm-preview-dialog')).toBeNull();
        expectFocusAfterClose('updates-cpm-preview-cancel');
        expect(host.requests('ops/update')).toHaveLength(0);
        // Confirm sends the one update.
        await user.click(optionOf('Newtonsoft.Json'));
        await user.keyboard('{Enter}');
        await hostSays(() => host.respond(host.requests('cpm/preview')[1], { preview: { centralPropsPath: '/w/Directory.Packages.props', packageId: 'Newtonsoft.Json', fromVersion: '13.0.1', toVersion: '13.0.3', affectedProjects: [A] } }));
        await user.click(screen.getByTestId('cpm-preview-confirm'));
        expectFocusAfterClose('updates-cpm-preview-confirm');
        expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Newtonsoft.Json', version: '13.0.3', sourceUrl: FEED }]);
    });

    it('an override row updates in its project alone: Space selects it for the bulk update, Enter sends one ops/update without a preview', async () => {
        const user = userEvent.setup();
        const host = await mountWith({ updates: [update('Moq', '4.18.0', '4.20.72')] }, A, [pkg('Moq', { version: '4.18.0', declaration: 'central-override' })]);
        await user.click(optionOf('Moq'));
        await user.keyboard(' ');
        expect(screen.getByTestId('update-all-button')).toHaveTextContent('Update selected (1)');
        expect(screen.getByTestId('status-live')).not.toHaveTextContent('centrally managed');
        await user.keyboard('{Enter}');
        expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Moq', version: '4.20.72', sourceUrl: FEED }]);
        expect(host.requests('cpm/preview')).toHaveLength(0);
        expect(screen.queryByTestId('cpm-preview-dialog')).toBeNull();
    });

    it('an unreachable source is a banner with Retry over the list, never "No updates available", and the tab shows no count', async () => {
        const user = userEvent.setup();
        const host = await mountWith({ updates: [], sourcesUnavailable: true });
        expect(screen.getByTestId('updates-unavailable-banner')).toHaveTextContent('could not be checked');
        expect(screen.getByText('Updates could not be checked: no package source answered.')).toBeInTheDocument();
        expect(screen.queryByText('No updates available.')).toBeNull();
        expect(screen.getByTestId('updates-tab')).toHaveAccessibleName('Updates');
        await user.click(within(screen.getByTestId('updates-unavailable-banner')).getByRole('button', { name: 'Retry' }));
        expect(host.requests('updates/get')).toHaveLength(2);
    });

    it('an update row carries its menu context: section, versions, source and the row facts', async () => {
        await mountWith();
        const context = JSON.parse(screen.getByTestId('package-row-serilog').dataset.vscodeContext ?? '{}') as Record<string, unknown>;
        expect(context).toMatchObject({ preventDefaultContextMenuItems: true, webviewSection: 'updateRow', packageId: 'Serilog', projectPath: A, 'nuiget.floating': false, 'nuiget.central': false, 'nuiget.readOnly': false });
        expect(context.latestVersion).toBeTypeOf('string');
    });

    it('says "No updates available" for a complete empty answer, and asks the user to pick a project in All Projects', async () => {
        await mountWith({ updates: [] });
        expect(screen.getByText('No updates available.')).toBeInTheDocument();
        expect(screen.getByTestId('updates-tab')).toHaveAccessibleName('Updates');
    });

    it('rows of an unsupported project have no action and cannot join a bulk update', async () => {
        const user = userEvent.setup();
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><MainShell installed={view => <InstalledTab {...view} />} updates={view => <UpdatesTab {...view} />} /></StoreProvider>);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
        await hostSays(() => host.respond(host.requests('installed/get')[0], { ...installed([pkg('Serilog', { version: '3.0.0' })]), unsupported: { reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' } }, 1));
        await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, updates: [update('Serilog', '3.0.0', '3.1.0')] }, 1));
        await user.click(screen.getByTestId('updates-tab'));

        expect(within(screen.getByTestId('updates-list')).queryAllByTestId('row-action-update')).toHaveLength(0);
        await user.click(optionOf('Serilog'));
        await user.keyboard('{Enter}');
        await user.keyboard(' ');
        expect(host.requests('ops/update')).toHaveLength(0);
        await waitFor(() => expect(screen.getByTestId('status-live')).toHaveTextContent('Serilog cannot be updated: requires .NET SDK 10 or newer'));
        expect(screen.getByTestId('update-all-button')).toBeDisabled();
        // DS-STATE-7: a disabled bulk button says why (UX-P3.1a).
        expect(screen.getByTestId('update-all-button')).toHaveAttribute('title', 'No update in this list can join a bulk update.');
        expect(screen.getByTestId('select-all-button')).toHaveAttribute('title', 'No update in this list can join a bulk update.');
    });

    it('All Projects: the updates come from allProjects/updates, never updates/get', async () => {
        const host = await mountWith(null, ALL_PROJECTS);
        const stream = host.requests('allProjects/updates');
        expect(stream).toHaveLength(1);
        expect(stream[0].payload).toEqual({ includePrerelease: false });
        const panel = document.getElementById(screen.getByTestId('updates-tab').getAttribute('aria-controls')!)!;
        expect(panel.querySelectorAll('.nuiget-skeleton-row')).toHaveLength(3);
        expect(host.requests('updates/get')).toHaveLength(0);
    });

    describe('the state cells of one project (UX-P3.1b)', () => {
        it('loading: the bar over the list area and three skeleton rows, no row and no group row', async () => {
            await mountWith(null);
            expect(screen.getByTestId('updates-progress')).toHaveAccessibleName('Loading updates');
            expect(document.querySelectorAll('.nuiget-skeleton-row')).toHaveLength(3);
            expect(screen.queryByTestId('group-row-direct')).toBeNull();
            expect(names()).toEqual([]);
        });

        it('error: the inline error says why in a sentence and offers Retry, which asks again', async () => {
            const user = userEvent.setup();
            const host = createFakeHost();
            render(<StoreProvider bus={host.bus}><MainShell installed={view => <InstalledTab {...view} />} updates={view => <UpdatesTab {...view} />} /></StoreProvider>);
            await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
            await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
            await hostSays(() => host.respond(host.requests('installed/get')[0], installed([pkg('Serilog', { version: '3.0.0' })]), 1));
            await hostSays(() => host.fail(host.requests('updates/get')[0], 'failed', 'The feed did not answer'));
            await user.click(screen.getByTestId('updates-tab'));
            const banner = screen.getByTestId('updates-error');
            expect(banner).toHaveTextContent('Updates could not be checked: The feed did not answer.');
            expect(screen.queryByTestId('updates-progress')).toBeNull();
            expect(screen.queryByTestId('updates-list')).toBeNull();
            await user.click(within(banner).getByRole('button', { name: 'Retry' }));
            expect(host.requests('updates/get')).toHaveLength(2);
        });

        it('all up to date: the empty state says so under its hook, with no group row', async () => {
            await mountWith({ updates: [] });
            expect(screen.getByTestId('updates-empty')).toHaveTextContent('No updates available.');
            expect(screen.queryByTestId('group-row-direct')).toBeNull();
            expect(screen.queryByTestId('updates-progress')).toBeNull();
        });

        it('sources unavailable: the banner and a sentence that the updates are unknown, never the empty hook', async () => {
            await mountWith({ updates: [], sourcesUnavailable: true });
            expect(screen.getByTestId('updates-unavailable-banner')).toBeInTheDocument();
            expect(screen.getByText('Updates could not be checked: no package source answered.')).toBeInTheDocument();
            expect(screen.queryByTestId('updates-empty')).toBeNull();
        });

        it('revalidating: the rows stay under the bar and the list is busy', async () => {
            const host = await mountWith();
            await hostSays(() => host.event('resources/invalidated', { scope: { kind: 'project', projectPaths: [A] }, reason: 'file-watcher', generation: 2, keys: [{ key: resourceKeys.updates(A, false), generation: 2 }] }));
            await waitFor(() => expect(screen.getByTestId('updates-progress')).toHaveAccessibleName('Refreshing updates'));
            expect(screen.getByTestId('updates-list')).toHaveAttribute('aria-busy', 'true');
            expect(names()).toEqual(['Moq', 'Newtonsoft.Json', 'Serilog']);
        });
    });

    describe('All Projects', () => {
        const B = '/w/Lib/Lib.csproj';

        async function mountAll(answer: { sourcesUnavailable?: boolean } = {}, lib: InstalledResult = { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Moq', { version: '4.20.0' })] }, icons?: Record<string, string>, libChunk?: { updates: PackageUpdate[]; error?: string }): Promise<FakeHost> {
            const host = createFakeHost();
            render(<StoreProvider bus={host.bus}><MainShell installed={view => <InstalledTab {...view} />} updates={view => <UpdatesTab {...view} />} /></StoreProvider>);
            await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, ALL_PROJECTS)));
            await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }, 1));
            const installedStream = host.requests('allProjects/installed')[0];
            await hostSays(() => host.chunk(installedStream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: installed([pkg('Serilog', { version: '3.0.0' }), pkg('Newtonsoft.Json', { version: '13.0.1', declaration: 'central' })]) } }));
            await hostSays(() => host.chunk(installedStream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', result: lib } }));
            await hostSays(() => host.respond(installedStream, { projectPaths: [A, B], errored: [] }));
            const stream = host.requests('allProjects/updates')[0];
            await hostSays(() => host.chunk(stream, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }));
            await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', updates: [update('Serilog', '3.0.0', '3.1.0'), update('Newtonsoft.Json', '13.0.1', '13.0.3')] } }));
            await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', ...(libChunk ?? { updates: answer.sourcesUnavailable ? [] : [update('Moq', '4.20.0', '4.20.72')] }) } }));
            if (icons !== undefined) {
                // The icons follow the project chunks and count only before the answer of the request.
                await hostSays(() => host.chunk(stream, { kind: 'icons', icons }));
            }
            await hostSays(() => host.respond(stream, { projectPaths: [A, B], ...answer }));
            await userEvent.setup().click(screen.getByTestId('updates-tab'));
            return host;
        }

        /** A project's group row, the treeitem inside its `group-row-project-<name>` wrapper (UX-P3.1b). */
        const groupOf = (name: string): HTMLElement => within(screen.getByTestId(`group-row-project-${name}`)).getByRole('treeitem');

        it('All Projects: one tree with a group row per project, selections across them become ops/bulkUpdateAllProjects with the project names (UX-P3.1b)', async () => {
            const user = userEvent.setup();
            const host = await mountAll();
            // One grouped list per view (D48): the projects are level-1 group rows of the tab's one tree, their updates under them.
            const list = screen.getByTestId('updates-list');
            expect(list).toHaveAttribute('role', 'tree');
            expect(list).toHaveAccessibleName('Updates');
            expect(groupOf('app')).toHaveAttribute('aria-level', '1');
            expect(groupOf('lib')).toHaveAttribute('aria-level', '1');
            expect(screen.getByTestId('section-header-project-app')).toHaveTextContent('App');
            expect(within(screen.getByTestId('group-row-project-app')).getByText('2')).toBeInTheDocument();
            expect(optionOf('Serilog')).toHaveAttribute('aria-level', '2');
            expect(names()).toEqual(['Newtonsoft.Json', 'Serilog', 'Moq']);
            // All Projects has its own toolbar, the same box of the measurements (UX-P0.10).
            expect(screen.getByTestId('updates-toolbar')).toContainElement(screen.getByTestId('update-all-button'));
            expect(screen.queryByTestId('updates-list-app')).toBeNull();
            expect(screen.getByTestId('updates-tab')).toHaveAccessibleName(/Updates\s+3/);
            expect(host.requests('updates/get')).toHaveLength(0);

            await user.click(optionOf('Serilog').querySelector('.nuiget-row-check') as Element);
            await user.click(optionOf('Moq').querySelector('.nuiget-row-check') as Element);
            expect(screen.getByTestId('update-all-button')).toHaveTextContent('Update selected (2)');
            await user.click(screen.getByTestId('update-all-button'));
            expect(screen.getByRole('alertdialog')).toHaveTextContent('In App:Serilog: 3.0.0 → 3.1.0In Lib:Moq: 4.20.0 → 4.20.72');
            await user.click(screen.getByTestId('confirm-dialog-confirm'));
            expectFocusAfterClose('updates-all-projects-update-confirm');
            expect(host.requests('ops/bulkUpdateAllProjects').map(request => request.payload)).toEqual([{
                projectUpdates: [
                    { projectPath: A, projectName: 'App', packages: [{ id: 'Serilog', version: '3.1.0', sourceUrl: FEED }] },
                    { projectPath: B, projectName: 'Lib', packages: [{ id: 'Moq', version: '4.20.72', sourceUrl: FEED }] },
                ],
            }]);

            // A centrally managed row opens the read-only preview; Enter on another updates its own project.
            await user.click(optionOf('Newtonsoft.Json'));
            await user.keyboard('{Enter}');
            expect(screen.getByTestId('cpm-preview-dialog')).toBeInTheDocument();
        });

        it('All Projects: rows take the icon of the icons chunk when they carry none, and are sorted by id', async () => {
            await mountAll({}, undefined, { serilog: DATA });
            expect(iconOf(screen.getByTestId('package-row-serilog'))).toBe(DATA);
            expect(iconOf(screen.getByTestId('package-row-moq'))).toBe(DEFAULT_ICON);
            expect(names()).toEqual(['Newtonsoft.Json', 'Serilog', 'Moq']);
        });

        it('All Projects: an override row updates in its own project alone and is a bulk candidate', async () => {
            const user = userEvent.setup();
            const host = await mountAll({}, { projectPath: B, fidelity: 'authoritative', isCpm: true, packages: [pkg('Moq', { version: '4.20.0', declaration: 'central-override' })] });
            await user.click(optionOf('Moq'));
            await user.keyboard(' ');
            expect(screen.getByTestId('update-all-button')).toHaveTextContent('Update selected (1)');
            await user.keyboard('{Enter}');
            expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: B, packageId: 'Moq', version: '4.20.72', sourceUrl: FEED }]);
            expect(host.requests('cpm/preview')).toHaveLength(0);
            expect(screen.queryByTestId('cpm-preview-dialog')).toBeNull();
        });

        it('All Projects: a source that could not be checked is one banner over the tree, and the project\'s leaf says the updates are unknown', async () => {
            await mountAll({ sourcesUnavailable: true });
            expect(screen.getAllByTestId('updates-unavailable-banner')).toHaveLength(1);
            // Lib's group: its message leaf says the updates are unknown.
            expect(screen.getByTestId('updates-empty-lib')).toHaveTextContent('Updates could not be checked.');
            expect(screen.queryByText('No updates available.')).toBeNull();
            expect(screen.getByTestId('updates-tab')).not.toHaveAccessibleName(/\d/);
        });

        it('All Projects: nothing installed is a message leaf of its project\'s group, never "up to date"', async () => {
            await mountAll({}, { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [] }, undefined, { updates: [] });
            const leaf = within(screen.getByTestId('updates-list')).getByTestId('updates-empty-lib');
            expect(leaf).toHaveTextContent('No packages installed.');
            expect(leaf.closest('[data-row-kind="message"]')).not.toBeNull();
            expect(leaf.querySelector('button')).toBeNull();
        });

        it('All Projects: a project whose check failed has its banner with Retry above the tree, and its group row no count', async () => {
            const user = userEvent.setup();
            const host = await mountAll({}, undefined, undefined, { updates: [], error: 'The feed did not answer' });
            const banner = screen.getByTestId('updates-error-lib');
            expect(banner).toHaveTextContent('Updates of Lib could not be checked: The feed did not answer.');
            expect(screen.getByTestId('updates-list')).not.toContainElement(banner);
            expect(screen.getByTestId('group-row-project-lib').querySelector('.nuiget-badge--count')).toBeNull();
            await user.click(within(banner).getByRole('button', { name: 'Retry' }));
            expect(host.requests('allProjects/updates')).toHaveLength(2);
        });

        it('All Projects: two workspace folders are level-1 group rows over their projects at level 2, and a folder collapses its projects (UX-P3.1b)', async () => {
            const user = userEvent.setup();
            const host = createFakeHost();
            render(<StoreProvider bus={host.bus}><MainShell installed={view => <InstalledTab {...view} />} updates={view => <UpdatesTab {...view} />} /></StoreProvider>);
            const projects = [{ name: 'App', path: A, workspaceFolder: 'app' }, { name: 'Lib', path: B, workspaceFolder: 'tools' }];
            await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, ALL_PROJECTS)));
            await hostSays(() => host.respond(host.requests('projects/list')[0], { projects }, 1));
            const stream = host.requests('allProjects/updates')[0];
            await hostSays(() => host.chunk(stream, { kind: 'start', projects }));
            await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', workspaceFolder: 'app', updates: [update('Serilog', '3.0.0', '3.1.0')] } }));
            await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', workspaceFolder: 'tools', updates: [update('Moq', '4.20.0', '4.20.72')] } }));
            await hostSays(() => host.respond(stream, { projectPaths: [A, B] }));
            await user.click(screen.getByTestId('updates-tab'));
            const folder = within(screen.getByTestId('group-row-folder-app')).getByRole('treeitem');
            expect(folder).toHaveAttribute('aria-level', '1');
            expect(within(screen.getByTestId('group-row-folder-tools')).getByRole('treeitem')).toHaveAttribute('aria-level', '1');
            expect(groupOf('app')).toHaveAttribute('aria-level', '2');
            expect(optionOf('Serilog')).toHaveAttribute('aria-level', '3');
            expect(names()).toEqual(['Serilog', 'Moq']);
            await user.click(folder);
            await user.keyboard('{ArrowLeft}');
            expect(folder).toHaveAttribute('aria-expanded', 'false');
            expect(screen.queryByTestId('group-row-project-app')).toBeNull();
            expect(names()).toEqual(['Moq']);
        });

        it('All Projects: an unsupported project says why in a message leaf before its read-only rows', async () => {
            await mountAll({}, { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Moq', { version: '4.20.0' })], unsupported: { reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' } });
            const leaf = screen.getByTestId('updates-unsupported-lib');
            expect(leaf).toHaveTextContent('Unsupported project: requires .NET SDK 10 or newer.');
            expect(leaf.closest('[data-row-kind="message"]')).not.toBeNull();
            expect(screen.getByTestId('package-row-moq').querySelector('[data-testid="row-action-update"]')).toBeNull();
        });

        it('All Projects: the tab draws its own bar while the stream runs, and a project with no chunk after it is unknown, never "no updates"', async () => {
            const user = userEvent.setup();
            const host = createFakeHost();
            render(<StoreProvider bus={host.bus}><MainShell installed={view => <InstalledTab {...view} />} updates={view => <UpdatesTab {...view} />} /></StoreProvider>);
            await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, ALL_PROJECTS)));
            await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }, 1));
            const stream = host.requests('allProjects/updates')[0];
            await hostSays(() => host.chunk(stream, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }));
            await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', updates: [update('Serilog', '3.0.0', '3.1.0')] } }));
            await user.click(screen.getByTestId('updates-tab'));
            expect(screen.getByTestId('updates-progress')).toHaveAccessibleName('Loading updates');
            expect(screen.getByTestId('section-header-project-lib').closest('[data-testid="group-row-project-lib"]')?.querySelector('.nuiget-spinner')).not.toBeNull();
            expect(screen.queryByTestId('updates-empty-lib')).toBeNull();
            await hostSays(() => host.respond(stream, { projectPaths: [A, B] }));
            expect(screen.queryByTestId('updates-progress')).toBeNull();
            expect(screen.getByTestId('updates-empty-lib')).toHaveTextContent('Updates could not be checked.');
        });

        it('has no axe violations with the All Projects tree and the Update all dialog open', async () => {
            const user = userEvent.setup();
            await mountAll();
            await user.click(screen.getByTestId('update-all-button'));
            const results = await axe(document.body);
            expect(results).toHaveNoViolations();
            expect(axeRuleOutcome(results, 'aria-dialog-name')).toBe('passes');
        });
    });

    it('updates row shows icon and authors', async () => {
        await mountWith({ updates: [
            { ...update('Serilog', '3.0.0', '3.1.0'), iconUrl: DATA, authors: 'Serilog Contributors', verified: true },
            update('Moq', '4.20.0', '4.20.72'),
        ] });
        expect(iconOf(screen.getByTestId('package-row-serilog'))).toBe(DATA);
        expect(iconOf(screen.getByTestId('package-row-moq'))).toBe(DEFAULT_ICON);
        expect(optionOf('Serilog')).toHaveTextContent('Serilog Contributors');
        expect(optionOf('Serilog')).toHaveAccessibleDescription(/Verified: the package id prefix is reserved by its owner/);
        expect(optionOf('Moq')).not.toHaveAccessibleDescription(/Verified/);
        // The mark beside the authors says it: no Verified badge as well.
        expect(screen.getByTestId('package-row-serilog').querySelector('.nuiget-row-badges')?.textContent ?? '').not.toContain('Verified');
        expect(optionOf('Serilog')).toHaveTextContent('3.0.0 → 3.1.0');
        expect(optionOf('Serilog').querySelector('.nuiget-row-version-new')).toHaveTextContent('3.1.0');
    });

    it('updates sorted by id', async () => {
        await mountWith({ updates: [update('Serilog', '3.0.0', '3.1.0'), update('autofac', '6.0.0', '8.0.0'), update('Moq', '4.20.0', '4.20.72')] });
        expect(names()).toEqual(['autofac', 'Moq', 'Serilog']);
    });

    it('all rows busy during update all', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(screen.getByTestId('update-all-button'));
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expectFocusAfterClose('updates-busy-update-all-confirm');
        const request = host.requests('ops/bulkUpdate')[0];
        // The host names the operation with every package, then reports one package per step.
        await hostSays(() => host.chunk(request, { opId: 'op1', status: 'queued', kind: 'update', projectPaths: [A], packageIds: ['Moq', 'Serilog'] }));
        await hostSays(() => host.chunk(request, { opId: 'op1', status: 'running', kind: 'update', projectPaths: [A], packageIds: ['Moq'], current: 1, total: 2 }));
        expect(optionOf('Serilog')).toHaveAttribute('aria-busy', 'true');
        expect(optionOf('Moq')).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByTestId('update-all-button')).toBeDisabled();
        expect(screen.getByTestId('update-all-button')).toHaveTextContent('Update all (0)');
        await hostSays(() => host.respond(request, { opId: 'op1', status: 'completed', results: [], restores: [] }));
        expect(optionOf('Serilog')).not.toHaveAttribute('aria-busy');
        expect(optionOf('Moq')).not.toHaveAttribute('aria-busy');
    });

    it('says "No packages installed." when the project has none, not that it is up to date', async () => {
        await mountWith({ updates: [] }, A, []);
        expect(screen.getByText('No packages installed.')).toBeInTheDocument();
        expect(screen.queryByText('No updates available.')).toBeNull();
    });
});
