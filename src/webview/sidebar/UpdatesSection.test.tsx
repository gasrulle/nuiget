import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { recordRowMenus } from '../shared/primitives/testSupport';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, resourceKeys, type InstalledPackage, type PackageUpdate, type SessionSnapshot } from '../../protocol';
import { createFakeHost, type FakeHost } from '../shared/bus/testSupport';
import { axeRuleOutcome, expectFocusAfterClose, installFakeLayout } from '../shared/primitives/testSupport';
import { StoreProvider } from '../shared/store/StoreProvider';
import { SidebarView } from './SidebarView';

const A = '/w/App/App.csproj';
const FEED = 'https://feed.example/v3/index.json';
const snapshot = (rev: number): SessionSnapshot => ({ rev, selectedProject: A, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const pkg = (id: string, version: string, changes: Partial<InstalledPackage> = {}): InstalledPackage => ({ id, version, versionType: 'standard', declaration: 'project', ...changes });
const update = (id: string, installedVersion: string, latestVersion: string): PackageUpdate => ({ id, installedVersion, latestVersion, sourceUrl: FEED });
const PACKAGES = [pkg('Serilog', '3.0.0'), pkg('Newtonsoft.Json', '13.0.1', { declaration: 'central' })];
const UPDATES = [update('Serilog', '3.0.0', '3.1.0'), update('Newtonsoft.Json', '13.0.1', '13.0.3')];

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

/** A sidebar on project A with its packages listed; the updates are answered when `answer` is given. */
async function mountWith(answer?: { updates: PackageUpdate[]; sourcesUnavailable?: boolean }, packages: InstalledPackage[] = PACKAGES): Promise<FakeHost> {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><SidebarView /></StoreProvider>);
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
    await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'authoritative', isCpm: true, packages }, 1));
    if (answer !== undefined) {
        await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, ...answer }, 1));
    }
    return host;
}

const updatesList = (): HTMLElement => screen.getByTestId('sidebar-updates-list');
const updateOption = (id: string): HTMLElement => within(within(updatesList()).getByTestId(`package-row-${id.toLowerCase()}`)).getByRole('option');
const header = (): HTMLElement => screen.getByTestId('section-header-updates');
/** The content of the Updates section, found through its toggle. */
const skeletonRows = (): NodeListOf<Element> => document.getElementById(header().getAttribute('aria-controls')!)!.querySelectorAll('.nuiget-skeleton-row');

describe('sidebar: Updates section', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 240, row: 22 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('shows its own skeleton rows before the session and while the first answer is pending, none once answered', async () => {
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><SidebarView /></StoreProvider>);
        expect(skeletonRows()).toHaveLength(3);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        expect(skeletonRows()).toHaveLength(3);
        await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, updates: UPDATES }, 1));
        expect(skeletonRows()).toHaveLength(0);
        expect(within(updatesList()).getAllByRole('option')).toHaveLength(2);
    });

    it('asks the updates of the selected project and lists them with their versions, counted on the header', async () => {
        const host = await mountWith();
        expect(host.requests('updates/get').map(request => request.payload)).toEqual([{ projectPath: A, includePrerelease: false }]);
        // Unknown until answered: no count.
        expect(header()).toHaveAccessibleName('Updates');
        // A pane box of the measurements (UX-P0.10).
        expect(screen.getByTestId('section-box-updates')).toHaveAttribute('data-variant', 'pane');

        await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, updates: UPDATES }, 1));
        expect(screen.getByRole('listbox', { name: 'Updates' })).toBe(updatesList());
        expect(within(updatesList()).getAllByRole('option').map(element => element.querySelector('.nuiget-row-name')?.textContent)).toEqual(['Newtonsoft.Json', 'Serilog']);
        expect(within(updatesList()).getByTestId('package-row-serilog')).toHaveTextContent('3.0.0 → 3.1.0');
        // The `id version` tooltip of P9.2 on the row's body (SB15).
        expect(within(updatesList()).getByTestId('package-row-serilog').querySelector('.nuiget-row-body')).toHaveAttribute('title', 'Serilog 3.0.0 → 3.1.0');
        expect(updateOption('Newtonsoft.Json')).toHaveAccessibleDescription(/Centrally managed/);
        expect(header()).toHaveAccessibleName('Updates 2');
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-required-children')).toBe('passes');
    });

    it('Enter or the row button updates the package to its latest version; a centrally managed one opens the actions menu', async () => {
        const user = userEvent.setup();
        const menus = recordRowMenus();
        const host = await mountWith({ updates: UPDATES });
        await user.click(updateOption('Serilog'));
        await user.keyboard('{Enter}');
        expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Serilog', version: '3.1.0', sourceUrl: FEED }]);
        expect(updateOption('Serilog')).toHaveAttribute('aria-busy', 'true');

        // A central change goes through the host's actions menu, where the host previews and confirms it (P6.4a).
        await user.click(updateOption('Newtonsoft.Json'));
        await user.keyboard('{Enter}');
        expect(menus.contexts).toEqual([expect.objectContaining({ packageId: 'Newtonsoft.Json', webviewSection: 'updateRow', projectPath: A })]);
        await user.click(within(within(updatesList()).getByTestId('package-row-newtonsoft.json')).getByTestId('row-action-update'));
        expect(menus.contexts).toHaveLength(2);
        expect(host.requests('ops/update')).toHaveLength(1);
    });

    it('an override row updates in its project alone: one ops/update, no actions menu', async () => {
        const user = userEvent.setup();
        const menus = recordRowMenus();
        const host = await mountWith({ updates: [update('Moq', '4.18.0', '4.20.72')] }, [pkg('Moq', '4.18.0', { declaration: 'central-override' })]);
        await user.click(updateOption('Moq'));
        await user.keyboard('{Enter}');
        expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Moq', version: '4.20.72', sourceUrl: FEED }]);
        expect(menus.contexts).toHaveLength(0);
        expect(updateOption('Moq')).toHaveAttribute('aria-busy', 'true');
        expect(updateOption('Moq')).toHaveAccessibleDescription(/Centrally managed/);
    });

    it('loads and revalidates under the pane\'s 2 px bar (UX-P3.10)', async () => {
        const host = await mountWith();
        // The first load: the bar over the skeleton.
        expect(screen.getByTestId('sidebar-updates-progress')).toHaveAccessibleName('Loading updates');
        expect(skeletonRows().length).toBeGreaterThan(0);
        await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, updates: [update('Serilog', '3.0.0', '4.0.0')] }, 1));
        expect(screen.queryByTestId('sidebar-updates-progress')).toBeNull();
        // A revalidation: the rows stay under the bar.
        await hostSays(() => host.invalidate([[resourceKeys.updates(A, false), 2]]));
        expect(screen.getByTestId('sidebar-updates-progress')).toHaveAccessibleName('Refreshing updates');
        expect(updateOption('Serilog')).toBeInTheDocument();
    });

    it('a failed check with nothing listed is its error banner with Retry alone, never "No updates available" (UX-P3.10)', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await hostSays(() => host.fail(host.requests('updates/get')[0], 'failed', 'the feed is down'));
        const error = screen.getByTestId('sidebar-updates-error');
        expect(error).toHaveTextContent('Updates could not be checked: the feed is down.');
        expect(screen.queryByTestId('sidebar-updates-empty')).toBeNull();
        expect(screen.queryByTestId('sidebar-updates-progress')).toBeNull();
        await user.click(within(error).getByRole('button', { name: 'Retry' }));
        expect(host.requests('updates/get')).toHaveLength(2);
    });

    it('an unsupported project shows its banner above its read-only rows, and no Update all (UX-P3.10)', async () => {
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><SidebarView /></StoreProvider>);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
        await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: PACKAGES, unsupported: { reason: 'sdk-too-old', message: 'needs SDK 10' } }, 1));
        await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, updates: [update('Serilog', '3.0.0', '4.0.0')] }, 1));
        expect(screen.getByTestId('sidebar-updates-unsupported')).toHaveTextContent('Unsupported project: needs SDK 10.');
        // Both panes open: the view's banner too, one full stop (DS-COPY-3); in @updates mode the pane's banner is the one message.
        expect(screen.getByTestId('sidebar-unsupported')).toHaveTextContent(/Unsupported project: needs SDK 10\.$/);
        expect(updateOption('Serilog')).toBeInTheDocument();
        expect(screen.queryByTestId('sidebar-update-all-button')).toBeNull();
    });

    it('an unreachable source is its banner with Retry alone, never an empty list, and the header shows no count (UX-P3.10)', async () => {
        const user = userEvent.setup();
        const host = await mountWith({ updates: [], sourcesUnavailable: true });
        expect(screen.getByTestId('sidebar-updates-unavailable')).toHaveTextContent('could not be checked');
        // The banner is the one message: no empty state marks an unknown as empty (design-advisor follow-up 1, F1).
        expect(screen.queryByTestId('sidebar-updates-empty')).toBeNull();
        expect(screen.queryByText('No updates available.')).toBeNull();
        expect(header()).toHaveAccessibleName('Updates');
        await user.click(within(screen.getByTestId('sidebar-updates-unavailable')).getByRole('button', { name: 'Retry' }));
        expect(host.requests('updates/get')).toHaveLength(2);
    });

    it('All Projects: one tree with a folder row per workspace folder, a project row under it and its updates; Enter sends ops/update with the row\'s project', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        const B = '/w2/Lib/Lib.csproj';
        await hostSays(() => host.event('session/changed', { ...snapshot(2), selectedProject: ALL_PROJECTS }));
        const installedStream = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(installedStream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', workspaceFolder: 'w2', result: { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Moq', '4.20.0')] } } }));
        const stream = host.requests('allProjects/updates')[0];
        await hostSays(() => host.chunk(stream, { kind: 'start', projects: [{ name: 'App', path: A, workspaceFolder: 'w1' }, { name: 'Lib', path: B, workspaceFolder: 'w2' }] }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', workspaceFolder: 'w1', updates: [update('Serilog', '3.0.0', '3.1.0')] } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', workspaceFolder: 'w2', updates: [update('Moq', '4.20.0', '4.20.72')] } }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B] }));

        expect(header()).toHaveAccessibleName('Updates 2');
        // D48 (UX-P3.7d): one tree, its group ids prefixed (the Installed tree is in the same document).
        const tree = updatesList();
        expect(tree).toHaveAttribute('role', 'tree');
        for (const [testId, level] of [['group-row-updates-folder-w1', '1'], ['group-row-updates-folder-w2', '1'], ['group-row-updates-project-app', '2'], ['group-row-updates-project-lib', '2']] as const) {
            expect(within(screen.getByTestId(testId)).getByRole('treeitem')).toHaveAttribute('aria-level', level);
        }
        expect(within(screen.getByTestId('group-row-updates-project-lib')).getByTestId('section-header-updates-project-lib')).toHaveTextContent('Lib');
        expect(screen.queryByTestId('sidebar-updates-list-lib')).toBeNull();
        const moq = within(within(tree).getByTestId('package-row-moq')).getByRole('treeitem');
        expect(moq).toHaveAttribute('aria-level', '3');
        await user.click(moq);
        await user.keyboard('{Enter}');
        expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: B, packageId: 'Moq', version: '4.20.72', sourceUrl: FEED }]);
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-required-children')).toBe('passes');
    });

    it('All Projects tree: an empty project and an unsupported one say so in a leaf, a failed one in a banner with Retry; Left and Right fold a project row (UX-P3.7d)', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        const B = '/w/Lib/Lib.csproj';
        const C = '/w/Old/Old.csproj';
        const D = '/w/Bad/Bad.csproj';
        await hostSays(() => host.event('session/changed', { ...snapshot(2), selectedProject: ALL_PROJECTS }));
        const installedStream = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(installedStream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [pkg('Serilog', '3.0.0')] } } }));
        await hostSays(() => host.chunk(installedStream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', result: { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [] } } }));
        await hostSays(() => host.chunk(installedStream, { kind: 'project', chunk: { projectPath: C, projectName: 'Old', result: { projectPath: C, fidelity: 'authoritative', isCpm: false, packages: [pkg('Moq', '4.20.0')], unsupported: { reason: 'sdk-too-old', message: 'needs SDK 10.' } } } }));
        const stream = host.requests('allProjects/updates')[0];
        await hostSays(() => host.chunk(stream, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }, { name: 'Old', path: C }, { name: 'Bad', path: D }] }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', updates: [update('Serilog', '3.0.0', '3.1.0')] } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', updates: [] } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: C, projectName: 'Old', updates: [update('Moq', '4.20.0', '4.20.72')] } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: D, projectName: 'Bad', updates: [], error: 'boom' } }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B, C, D] }));

        expect(screen.getByTestId('sidebar-updates-empty-lib')).toHaveTextContent('No packages installed.');
        // The host's reason ends with exactly one full stop (DS-COPY-3).
        expect(screen.getByTestId('sidebar-updates-unsupported-old').textContent).toBe('Unsupported project: needs SDK 10.');
        // An unsupported project's rows are read-only: no update button.
        expect(within(screen.getByTestId('package-row-moq')).queryByTestId('row-action-update')).toBeNull();
        // A failed project is a banner above the tree, never inside a treeitem, and its group row has no count.
        const banner = screen.getByTestId('sidebar-updates-error-bad');
        expect(banner).toHaveTextContent('Updates of Bad could not be checked: boom.');
        expect(updatesList()).not.toContainElement(banner);
        expect(within(screen.getByTestId('group-row-updates-project-bad')).queryByText(/\d/)).toBeNull();
        await user.click(within(banner).getByRole('button', { name: 'Retry' }));
        expect(host.requests('allProjects/updates').length).toBeGreaterThan(1);
        // Left folds a project row, Right unfolds it.
        const app = within(screen.getByTestId('group-row-updates-project-app')).getByRole('treeitem');
        await user.click(app);
        await user.keyboard('{ArrowLeft}');
        expect(app).toHaveAttribute('aria-expanded', 'false');
        expect(within(updatesList()).queryByTestId('package-row-serilog')).toBeNull();
        await user.keyboard('{ArrowRight}');
        expect(app).toHaveAttribute('aria-expanded', 'true');
        expect(within(updatesList()).getByTestId('package-row-serilog')).toBeInTheDocument();
    });

    it('the actions menu and Ctrl+Enter carry the update\'s versions and source', async () => {
        const user = userEvent.setup();
        const menus = recordRowMenus();
        const host = await mountWith({ updates: UPDATES });
        await user.click(updateOption('Serilog'));
        await user.keyboard('{Shift>}{F10}{/Shift}');
        await user.keyboard('{Control>}{Enter}{/Control}');

        expect(menus.contexts).toEqual([{ preventDefaultContextMenuItems: true, 'nuiget.floating': false, 'nuiget.central': false, 'nuiget.readOnly': false, packageId: 'Serilog', installedVersion: '3.0.0', latestVersion: '3.1.0', webviewSection: 'updateRow', projectPath: A, versionType: 'standard', sourceUrl: FEED }]);
        expect(host.requests('ui/viewPackage').map(request => request.payload)).toEqual([{ packageId: 'Serilog', version: '3.1.0' }]);
        expect(host.requests('ops/update')).toHaveLength(0);
    });

    it('@updates with text counts the matches as "k of N", "0 of N" included (DS-COPY-5, UX-P3.7b)', async () => {
        const user = userEvent.setup();
        await mountWith({ updates: [update('Moq', '4.18.0', '4.20.72'), update('Serilog', '3.0.0', '3.1.1')] }, [pkg('Moq', '4.18.0'), pkg('Serilog', '3.0.0')]);
        expect(header()).toHaveAccessibleName('Updates 2');
        const search = screen.getByTestId('sidebar-search-input');
        await user.type(search, '@updates ser');
        expect(header()).toHaveAccessibleName('Updates 1 of 2');
        await user.type(search, 'zz');
        expect(header()).toHaveAccessibleName('Updates 0 of 2');
    });

    it('a complete empty answer says "No updates available" and shows no count; the header collapses the section', async () => {
        const user = userEvent.setup();
        await mountWith({ updates: [] });
        expect(screen.getByTestId('sidebar-updates-empty')).toHaveTextContent('No updates available.');
        // SB13 (UX-P3.7b): no 0 badge; the sentence says it.
        expect(header()).toHaveAccessibleName('Updates');
        expect(screen.getByTestId('section-box-updates').querySelector('.nuiget-badge--count')).toBeNull();
        expect(header()).toHaveAttribute('aria-expanded', 'true');
        await user.click(header());
        expect(header()).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByTestId('sidebar-updates-empty')).toBeNull();
    });

    it('update all button runs bulk update', async () => {
        const user = userEvent.setup();
        const host = await mountWith({ updates: UPDATES });
        // Newtonsoft.Json is set centrally: it goes through its own preview, not Update all (N76).
        const button = screen.getByTestId('sidebar-update-all-button');
        expect(button).toHaveAccessibleName('Update all (1)');
        await user.click(button);
        const dialog = screen.getByTestId('confirm-dialog');
        expect(dialog).toHaveTextContent('Serilog: 3.0.0 → 3.1.0');
        expect(dialog).not.toHaveTextContent('Newtonsoft.Json');
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-dialog-name')).toBe('passes');
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expect(host.requests('ops/bulkUpdate').map(request => request.payload)).toEqual([{ projectPath: A, packages: [{ id: 'Serilog', version: '3.1.0', sourceUrl: FEED }] }]);
        expect(screen.queryByTestId('confirm-dialog')).toBeNull();
        expectFocusAfterClose('sidebar-update-all-confirm');
    });

    it('an unresolved row is listed but stays out of Update all, its dialog and the bulk update (UX-P3.7d)', async () => {
        const user = userEvent.setup();
        const host = await mountWith({ updates: [...UPDATES, update('Moq', '4.20.0', '4.20.72')] }, [...PACKAGES, pkg('Moq', '', { versionType: 'unresolved', declaration: 'unresolved' })]);
        expect(within(updatesList()).getByTestId('package-row-moq')).toBeInTheDocument();
        expect(screen.getByTestId('sidebar-update-all-button')).toHaveAccessibleName('Update all (1)');
        await user.click(screen.getByTestId('sidebar-update-all-button'));
        expect(screen.getByTestId('confirm-dialog')).not.toHaveTextContent('Moq');
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expectFocusAfterClose('sidebar-update-all-confirm');
        expect(host.requests('ops/bulkUpdate').map(request => request.payload)).toEqual([{ projectPath: A, packages: [{ id: 'Serilog', version: '3.1.0', sourceUrl: FEED }] }]);
    });

    it('update all under All Projects sends one ops/bulkUpdateAllProjects grouped by project', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        const B = '/w/Lib/Lib.csproj';
        await hostSays(() => host.event('session/changed', { ...snapshot(2), selectedProject: ALL_PROJECTS }));
        const installedStream = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(installedStream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [pkg('Serilog', '3.0.0')] } } }));
        await hostSays(() => host.chunk(installedStream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', result: { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Moq', '4.20.0')] } } }));
        const stream = host.requests('allProjects/updates')[0];
        await hostSays(() => host.chunk(stream, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', updates: [update('Serilog', '3.0.0', '3.1.0')] } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', updates: [update('Moq', '4.20.0', '4.20.72')] } }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B] }));

        await user.click(screen.getByTestId('sidebar-update-all-button'));
        const dialog = screen.getByTestId('confirm-dialog');
        expect(dialog).toHaveTextContent('In App:Serilog: 3.0.0 → 3.1.0In Lib:Moq: 4.20.0 → 4.20.72');
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expectFocusAfterClose('sidebar-all-projects-update-all-confirm');
        expect(host.requests('ops/bulkUpdateAllProjects').map(request => request.payload)).toEqual([{ projectUpdates: [
            { projectPath: A, projectName: 'App', packages: [{ id: 'Serilog', version: '3.1.0', sourceUrl: FEED }] },
            { projectPath: B, projectName: 'Lib', packages: [{ id: 'Moq', version: '4.20.72', sourceUrl: FEED }] },
        ] }]);
    });

    it('All Projects tree: a project with packages and no update says so, a filter hides the leaves, and a source that could not be checked makes the leaf say so with no count (UX-P3.7d)', async () => {
        const user = userEvent.setup();
        const B = '/w/Lib/Lib.csproj';
        const allProjects = async (sourcesUnavailable: boolean): Promise<FakeHost> => {
            const host = await mountWith();
            await hostSays(() => host.event('session/changed', { ...snapshot(2), selectedProject: ALL_PROJECTS }));
            const installedStream = host.requests('allProjects/installed')[0];
            await hostSays(() => host.chunk(installedStream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [pkg('Serilog', '3.0.0')] } } }));
            await hostSays(() => host.chunk(installedStream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', result: { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Moq', '4.20.0')] } } }));
            const stream = host.requests('allProjects/updates')[0];
            await hostSays(() => host.chunk(stream, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }));
            await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', updates: sourcesUnavailable ? [] : [update('Serilog', '3.0.0', '3.1.0')] } }));
            await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', updates: [] } }));
            await hostSays(() => host.respond(stream, { projectPaths: [A, B], sourcesUnavailable }));
            return host;
        };

        await allProjects(false);
        expect(screen.getByTestId('sidebar-updates-empty-lib')).toHaveTextContent('No updates available.');
        expect(within(screen.getByTestId('group-row-updates-project-lib')).getByText('0')).toBeInTheDocument();
        // A filter lists the matches only: no leaf says a project has nothing.
        await user.type(screen.getByTestId('sidebar-search-input'), '@updates Ser');
        expect(screen.queryByTestId('sidebar-updates-empty-lib')).toBeNull();
        expect(within(updatesList()).getByTestId('package-row-serilog')).toBeInTheDocument();

        cleanup();
        await allProjects(true);
        expect(screen.getByTestId('sidebar-updates-unavailable')).toBeInTheDocument();
        expect(screen.getByTestId('sidebar-updates-empty-lib')).toHaveTextContent('Updates could not be checked.');
        expect(screen.queryByText('No updates available.')).toBeNull();
        expect(within(screen.getByTestId('group-row-updates-project-lib')).queryByText(/\d/)).toBeNull();
    });

    it('update all under All Projects lists In <project>: groups and leaves out a central row and a project whose installed list has not arrived (UX-P3.7d)', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        const B = '/w/Lib/Lib.csproj';
        await hostSays(() => host.event('session/changed', { ...snapshot(2), selectedProject: ALL_PROJECTS }));
        const installedStream = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(installedStream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: { projectPath: A, fidelity: 'authoritative', isCpm: true, packages: PACKAGES } } }));
        const stream = host.requests('allProjects/updates')[0];
        await hostSays(() => host.chunk(stream, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', updates: UPDATES } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', updates: [update('Moq', '4.20.0', '4.20.72')] } }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B] }));

        expect(screen.getByTestId('sidebar-update-all-button')).toHaveAccessibleName('Update all (1)');
        await user.click(screen.getByTestId('sidebar-update-all-button'));
        const dialog = screen.getByTestId('confirm-dialog');
        expect(dialog).toHaveTextContent('In App:Serilog: 3.0.0 → 3.1.0');
        expect(dialog).not.toHaveTextContent('Newtonsoft.Json');
        expect(dialog).not.toHaveTextContent('Lib');
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expectFocusAfterClose('sidebar-all-projects-update-all-confirm');
        expect(host.requests('ops/bulkUpdateAllProjects').map(request => request.payload)).toEqual([{ projectUpdates: [
            { projectPath: A, projectName: 'App', packages: [{ id: 'Serilog', version: '3.1.0', sourceUrl: FEED }] },
        ] }]);
    });

    it('update all cancels without a request, and there is no button without an update', async () => {
        const user = userEvent.setup();
        const host = await mountWith({ updates: UPDATES });
        await user.click(screen.getByTestId('sidebar-update-all-button'));
        await user.click(screen.getByTestId('confirm-dialog-cancel'));
        expect(screen.queryByTestId('confirm-dialog')).toBeNull();
        expectFocusAfterClose('sidebar-update-all-cancel');
        expect(host.requests('ops/bulkUpdate')).toHaveLength(0);

        // A complete empty answer: no button.
        cleanup();
        await mountWith({ updates: [] });
        expect(screen.queryByTestId('sidebar-update-all-button')).toBeNull();
    });

    it('an unsupported project has no Update all', async () => {
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><SidebarView /></StoreProvider>);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
        await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [pkg('Serilog', '3.0.0')], unsupported: { reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' } }, 1));
        await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, updates: [update('Serilog', '3.0.0', '3.1.0')] }, 1));
        expect(within(updatesList()).getAllByRole('option')).toHaveLength(1);
        expect(screen.queryByTestId('sidebar-update-all-button')).toBeNull();
    });
});
