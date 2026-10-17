import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, type InstalledPackage, type InstalledResult, type PackageUpdate, type SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { axeRuleOutcome, installFakeLayout } from '../../../shared/primitives/testSupport';
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

const optionOf = (id: string): HTMLElement => within(screen.getByTestId(`package-row-${id.toLowerCase()}`)).getByRole('option');
const iconOf = (row: HTMLElement): string | null | undefined => row.querySelector('.nuiget-row-icon img')?.getAttribute('src');
const names = (): string[] => {
    const list = screen.queryByTestId('updates-list');
    return list === null ? [] : within(list).queryAllByRole('option').map(element => element.querySelector('.nuiget-row-name')?.textContent ?? '');
};

describe('main panel: Updates tab', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 400, row: 44 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('lists the updates with their versions, counts them on the tab and passes axe', async () => {
        await mountWith();
        const list = screen.getByTestId('updates-list');
        expect(list).toHaveAttribute('aria-multiselectable', 'true');
        expect(list).toHaveAccessibleName('Updates');
        expect(names()).toEqual(['Moq', 'Newtonsoft.Json', 'Serilog']);
        expect(screen.getByTestId('package-row-serilog')).toHaveTextContent('3.0.0 → 3.1.0');
        expect(optionOf('Newtonsoft.Json')).toHaveAccessibleDescription(/Centrally managed/);
        expect(screen.getByTestId('updates-tab')).toHaveAccessibleName(/Updates\s+3/);
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-required-children')).toBe('passes');
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
        expect(screen.getByTestId('update-all-button')).toHaveTextContent('Update all (2)');
        await user.click(screen.getByTestId('update-all-button'));
        const dialog = screen.getByRole('alertdialog', { name: 'Update 2 packages?' });
        expect(within(dialog).getByText('Serilog: 3.0.0 → 3.1.0')).toBeInTheDocument();
        expect(within(dialog).queryByText(/Newtonsoft/)).toBeNull();
        expect(axeRuleOutcome(await axe(document.body), 'aria-dialog-name')).toBe('passes');
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
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
        expect(host.requests('ops/bulkUpdate')[0].payload.packages.map(entry => entry.id)).toEqual(['Moq']);
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
        expect(host.requests('ops/update')).toHaveLength(0);
        // Confirm sends the one update.
        await user.click(optionOf('Newtonsoft.Json'));
        await user.keyboard('{Enter}');
        await hostSays(() => host.respond(host.requests('cpm/preview')[1], { preview: { centralPropsPath: '/w/Directory.Packages.props', packageId: 'Newtonsoft.Json', fromVersion: '13.0.1', toVersion: '13.0.3', affectedProjects: [A] } }));
        await user.click(screen.getByTestId('cpm-preview-confirm'));
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

    describe('All Projects', () => {
        const B = '/w/Lib/Lib.csproj';

        async function mountAll(answer: { sourcesUnavailable?: boolean } = {}, lib: InstalledResult = { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Moq', { version: '4.20.0' })] }, icons?: Record<string, string>): Promise<FakeHost> {
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
            await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', updates: answer.sourcesUnavailable ? [] : [update('Moq', '4.20.0', '4.20.72')] } }));
            if (icons !== undefined) {
                // The icons follow the project chunks and count only before the answer of the request.
                await hostSays(() => host.chunk(stream, { kind: 'icons', icons }));
            }
            await hostSays(() => host.respond(stream, { projectPaths: [A, B], ...answer }));
            await userEvent.setup().click(screen.getByTestId('updates-tab'));
            return host;
        }

        const listOf = (name: string): HTMLElement => screen.getByTestId(`updates-list-${name}`);
        const rowIn = (name: string, id: string): HTMLElement => within(within(listOf(name)).getByTestId(`package-row-${id.toLowerCase()}`)).getByRole('option');

        it('All Projects: one section per project, selections across them become ops/bulkUpdateAllProjects with the project names', async () => {
            const user = userEvent.setup();
            const host = await mountAll();
            expect(listOf('app')).toHaveAccessibleName('App');
            expect(listOf('lib')).toHaveAccessibleName('Lib');
            // The single-scroller layout of the Installed tab (P9.fix-2).
            expect(listOf('app').closest('.nuiget-installed')).toHaveClass('nuiget-installed--sections');
            expect(screen.getByTestId('updates-tab')).toHaveAccessibleName(/Updates\s+3/);
            expect(host.requests('updates/get')).toHaveLength(0);

            await user.click(rowIn('app', 'Serilog').querySelector('.nuiget-row-check') as Element);
            await user.click(rowIn('lib', 'Moq').querySelector('.nuiget-row-check') as Element);
            expect(screen.getByTestId('update-all-button')).toHaveTextContent('Update selected (2)');
            await user.click(screen.getByTestId('update-all-button'));
            expect(screen.getByRole('alertdialog')).toHaveTextContent('In App:Serilog: 3.0.0 → 3.1.0In Lib:Moq: 4.20.0 → 4.20.72');
            await user.click(screen.getByTestId('confirm-dialog-confirm'));
            expect(host.requests('ops/bulkUpdateAllProjects').map(request => request.payload)).toEqual([{
                projectUpdates: [
                    { projectPath: A, projectName: 'App', packages: [{ id: 'Serilog', version: '3.1.0', sourceUrl: FEED }] },
                    { projectPath: B, projectName: 'Lib', packages: [{ id: 'Moq', version: '4.20.72', sourceUrl: FEED }] },
                ],
            }]);

            // A centrally managed row opens the read-only preview; Enter on another updates its own project.
            await user.click(rowIn('app', 'Newtonsoft.Json'));
            await user.keyboard('{Enter}');
            expect(screen.getByTestId('cpm-preview-dialog')).toBeInTheDocument();
        });

        it('All Projects: rows take the icon of the icons chunk when they carry none, and are sorted by id', async () => {
            await mountAll({}, undefined, { serilog: DATA });
            const row = (name: string, id: string): HTMLElement => within(listOf(name)).getByTestId(`package-row-${id.toLowerCase()}`);
            expect(iconOf(row('app', 'Serilog'))).toBe(DATA);
            expect(iconOf(row('lib', 'Moq'))).toBe(DEFAULT_ICON);
            expect(within(listOf('app')).getAllByRole('option').map(option => option.querySelector('.nuiget-row-name')?.textContent)).toEqual(['Newtonsoft.Json', 'Serilog']);
        });

        it('All Projects: an override row updates in its own project alone and is a bulk candidate', async () => {
            const user = userEvent.setup();
            const host = await mountAll({}, { projectPath: B, fidelity: 'authoritative', isCpm: true, packages: [pkg('Moq', { version: '4.20.0', declaration: 'central-override' })] });
            await user.click(rowIn('lib', 'Moq'));
            await user.keyboard(' ');
            expect(screen.getByTestId('update-all-button')).toHaveTextContent('Update selected (1)');
            await user.keyboard('{Enter}');
            expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: B, packageId: 'Moq', version: '4.20.72', sourceUrl: FEED }]);
            expect(host.requests('cpm/preview')).toHaveLength(0);
            expect(screen.queryByTestId('cpm-preview-dialog')).toBeNull();
        });

        it('All Projects: a source that could not be checked is one banner over the sections, not an empty state', async () => {
            await mountAll({ sourcesUnavailable: true });
            expect(screen.getAllByTestId('updates-unavailable-banner')).toHaveLength(1);
            // Lib's section: its empty list says the updates are unknown.
            expect(screen.getByText('Updates could not be checked.')).toBeInTheDocument();
            expect(screen.queryByText('No updates available.')).toBeNull();
            expect(screen.getByTestId('updates-tab')).not.toHaveAccessibleName(/\d/);
        });

        it('has no axe violations with All Projects sections and the Update all dialog open', async () => {
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
