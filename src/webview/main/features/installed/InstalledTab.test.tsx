import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, resourceKeys, type BulkOutcome, type InstalledPackage, type InstalledResult, type OperationOutcome, type SessionSnapshot, type TransitiveResult } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { axeRuleOutcome, expectFocusAfterClose, installFakeLayout } from '../../../shared/primitives/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';
import { DetailsPane } from '../details/DetailsPane';
import { InstalledTab } from './InstalledTab';

const A = '/w/App/App.csproj';
const B = '/w/Lib/Lib.csproj';
const snapshot = (rev: number, selectedProject = A): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const pkg = (id: string, changes: Partial<InstalledPackage> = {}): InstalledPackage => ({ id, version: '1.0.0', versionType: 'standard', declaration: 'project', ...changes });
const installed = (projectPath: string, packages: InstalledPackage[]): InstalledResult => ({ projectPath, fidelity: 'authoritative', isCpm: false, packages });
const THREE = [pkg('Serilog', { version: '3.0.0' }), pkg('Moq', { version: '4.20.0' }), pkg('Newtonsoft.Json', { version: '13.0.1', declaration: 'central' })];

// The bundled default icon the host puts on the root; `defaultPackageIcon()` keeps the first value it finds.
const DEFAULT_ICON = 'https://file+.vscode-resource.vscode-cdn.net/ext/resources/package-icon.png';
document.body.setAttribute('data-package-icon', DEFAULT_ICON);

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

function mount(withDetails = false): FakeHost {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><MainShell installed={view => <InstalledTab {...view} />} {...(withDetails ? { details: view => <DetailsPane {...view} /> } : {})} /></StoreProvider>);
    return host;
}

/** The panel on project A with the three packages listed; with the details pane when asked. */
async function mountWith(packages: InstalledPackage[] = THREE, withDetails = false): Promise<FakeHost> {
    const host = mount(withDetails);
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }, 1));
    await hostSays(() => host.respond(host.requests('installed/get')[0], installed(A, packages), 1));
    return host;
}

const optionOf = (id: string): HTMLElement => within(screen.getByTestId(`package-row-${id.toLowerCase()}`)).getByRole('treeitem');
/** The package rows of the tree; its group rows are treeitems too. */
const names = (): string[] => {
    const list = screen.queryByTestId('installed-list');
    return list === null ? [] : [...list.querySelectorAll('.nuiget-row-option')].map(element => element.querySelector('.nuiget-row-name')?.textContent ?? '');
};
/** The rows under the Transitive group row, its last level-1 group. */
const transitiveRows = (): HTMLElement[] => [...screen.getByTestId('installed-list').querySelectorAll<HTMLElement>('[data-testid="group-row-transitive"] ~ .nuiget-row:not([data-row-kind="group"]) .nuiget-row-option')];
const groupItem = (id: string): HTMLElement => screen.getByTestId(`group-row-${id}`).querySelector('[role="treeitem"]') as HTMLElement;
const uninstallSelected = (): HTMLElement => screen.getByTestId('uninstall-selected-button');
const said = (): string => screen.getByTestId('status-live').textContent ?? '';

describe('main panel: Installed tab', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 400, row: 44 });
    });

    afterEach(() => {
        removeLayout();
    });

    it("lists the committed project's packages as a multi-selectable tree under the Direct packages group row, with the filter applied", async () => {
        const user = userEvent.setup();
        await mountWith();
        const list = screen.getByTestId('installed-list');
        expect(list).toHaveAttribute('role', 'tree');
        expect(within(list).getByTestId('group-row-direct').querySelector('[role="treeitem"]')).toHaveAttribute('aria-expanded', 'true');
        expect(list).toHaveAttribute('aria-multiselectable', 'true');
        expect(list).toHaveAccessibleName('Installed packages');
        expect(names()).toEqual(['Serilog', 'Moq', 'Newtonsoft.Json']);
        expect(optionOf('Newtonsoft.Json')).toHaveAccessibleDescription(/Centrally managed/);
        await user.type(screen.getByTestId('search-input'), '@installed ser');
        expect(names()).toEqual(['Serilog']);
        await user.clear(screen.getByTestId('search-input'));
        await user.type(screen.getByTestId('search-input'), '@installed zzz');
        expect(screen.getByText('No installed package matches "zzz".')).toBeInTheDocument();
        // The current row: a click, shown as aria-current; the bulk set is apart from it.
        await user.clear(screen.getByTestId('search-input'));
        await user.click(optionOf('Moq'));
        expect(optionOf('Moq')).toHaveAttribute('aria-current', 'true');
        expect(optionOf('Moq')).toHaveAttribute('aria-selected', 'false');
    });

    it('provisional: the badge leaves when the authoritative list replaces the chunk', async () => {
        // The main panel shows a project header, and with it the badge, in All Projects; the evaluated list arrives
        // as a second `project` chunk for the same project.
        const host = await mountWith();
        await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS)));
        const request = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: { ...installed(A, THREE), fidelity: 'provisional' } } }));
        const header = (): HTMLElement => screen.getByTestId('section-header-project-app').closest('.nuiget-section-header') as HTMLElement;
        expect(within(header()).getByText('provisional')).toBeInTheDocument();
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: installed(A, THREE) } }));
        expect(within(header()).queryByText('provisional')).toBeNull();
    });

    it('provisional: the Direct packages group row carries the badge until the authoritative list replaces it', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }, 1));
        await hostSays(() => host.respond(host.requests('installed/get')[0], { ...installed(A, THREE), fidelity: 'provisional' }, 1));
        expect(within(screen.getByTestId('group-row-direct')).getByText('provisional')).toBeInTheDocument();
        expect(names()).toEqual(['Serilog', 'Moq', 'Newtonsoft.Json']);

        // The evaluation finishes: the host invalidates the key and the authoritative list replaces the provisional one.
        await hostSays(() => host.event('resources/invalidated', { scope: { kind: 'project', projectPaths: [A] }, reason: 'file-watcher', generation: 2, keys: [{ key: resourceKeys.installed(A), generation: 2 }] }));
        await hostSays(() => host.respond(host.requests('installed/get')[1], installed(A, THREE), 2));
        expect(screen.queryByText('provisional')).toBeNull();
    });

    it('select all selects the removable rows only and the toolbar counts them', async () => {
        const user = userEvent.setup();
        await mountWith();
        // The toolbar box of the measurements (UX-P0.10).
        expect(screen.getByTestId('installed-toolbar')).toHaveAttribute('role', 'toolbar');
        expect(screen.getByTestId('installed-toolbar')).toContainElement(screen.getByTestId('select-all-button'));
        expect(uninstallSelected()).toBeDisabled();
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (0)');
        await user.click(screen.getByTestId('select-all-button'));
        expect(screen.getByTestId('select-all-button')).toHaveAttribute('aria-pressed', 'true');
        // A centrally managed row is removable: an uninstall keeps its central entry (ADR-004).
        expect(['Serilog', 'Moq', 'Newtonsoft.Json'].map(id => optionOf(id).getAttribute('aria-selected'))).toEqual(['true', 'true', 'true']);
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (3)');
        // A second press clears.
        await user.click(screen.getByTestId('select-all-button'));
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (0)');
        // Space on the central row selects it.
        optionOf('Newtonsoft.Json').focus();
        await user.keyboard(' ');
        expect(optionOf('Newtonsoft.Json')).toHaveAttribute('aria-selected', 'true');
        optionOf('Moq').focus();
        await user.keyboard(' ');
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (2)');
    });

    it('Enter, ArrowLeft and ArrowRight collapse and expand a group row; its rows leave and return and the bulk set survives', async () => {
        const user = userEvent.setup();
        await mountWith();
        await user.click(screen.getByTestId('select-all-button'));
        const group = (): HTMLElement => screen.getByTestId('group-row-direct').querySelector('[role="treeitem"]') as HTMLElement;
        group().focus();
        await user.keyboard('{Enter}');
        expect(group()).toHaveAttribute('aria-expanded', 'false');
        expect(names()).toEqual([]);
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (3)');
        await user.keyboard('{ArrowRight}');
        expect(group()).toHaveAttribute('aria-expanded', 'true');
        expect(names()).toEqual(['Serilog', 'Moq', 'Newtonsoft.Json']);
        await user.keyboard('{ArrowLeft}');
        expect(group()).toHaveAttribute('aria-expanded', 'false');
        await user.keyboard('{ArrowRight}');
        expect(optionOf('Moq')).toHaveAttribute('aria-selected', 'true');
    });

    it('the tree is described by the hint that names the group keys', async () => {
        await mountWith();
        expect(screen.getByTestId('installed-list')).toHaveAccessibleDescription('Space selects the package for a bulk action. Enter shows its details. Delete uninstalls it. Shift+F10 opens the actions menu. On a group row, Enter, Left and Right expand and collapse it.');
    });

    it('a busy row cannot join the bulk set and Space says why', async () => {
        const user = userEvent.setup();
        await mountWith();
        await user.click(within(screen.getByTestId('package-row-moq')).getByTestId('row-action-uninstall'));
        expect(optionOf('Moq')).toHaveAttribute('aria-busy', 'true');
        optionOf('Moq').focus();
        await user.keyboard(' ');
        expect(optionOf('Moq')).toHaveAttribute('aria-selected', 'false');
        await waitFor(() => expect(said()).toBe('An operation on this package is running.'));
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (0)');
    });

    it('the dialog lists the selected packages; Escape and Cancel send nothing', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(screen.getByTestId('select-all-button'));
        await user.click(uninstallSelected());
        const dialog = screen.getByRole('alertdialog', { name: 'Uninstall 3 packages?' });
        expect(within(dialog).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Serilog', 'Moq', 'Newtonsoft.Json']);
        expect(dialog).toHaveTextContent('From App:');
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expectFocusAfterClose('installed-bulk-uninstall-escape');
        await user.click(uninstallSelected());
        await user.click(screen.getByTestId('confirm-dialog-cancel'));
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expectFocusAfterClose('installed-bulk-uninstall-cancel');
        expect(host.requests('ops/bulkRemove')).toHaveLength(0);
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (3)');
    });

    it('Confirm asks ops/bulkRemove with exactly the listed ids, closes the dialog, and the rows are busy until the request settles', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(screen.getByTestId('select-all-button'));
        await user.click(uninstallSelected());
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expectFocusAfterClose('installed-bulk-uninstall-confirm');
        expect(host.requests('ops/bulkRemove').map(request => request.payload)).toEqual([{ projectPath: A, packages: ['Serilog', 'Moq', 'Newtonsoft.Json'] }]);
        // Busy from the request on, before the host reports anything (N61), and nothing left the list.
        expect(optionOf('Serilog')).toHaveAttribute('aria-busy', 'true');
        expect(optionOf('Moq')).toHaveAttribute('aria-busy', 'true');
        expect(optionOf('Newtonsoft.Json')).toHaveAttribute('aria-busy', 'true');
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (0)');
        const done: BulkOutcome = { opId: 'op1', status: 'completed', results: [], restores: [] };
        await hostSays(() => host.respond(host.requests('ops/bulkRemove')[0], done));
        for (const id of ['Serilog', 'Moq', 'Newtonsoft.Json']) {
            expect(optionOf(id)).not.toHaveAttribute('aria-busy');
        }
        expect(names()).toEqual(['Serilog', 'Moq', 'Newtonsoft.Json']);
    });

    it("a partial outcome leaves the failed row where the host's list has it and is announced", async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(screen.getByTestId('select-all-button'));
        await user.click(uninstallSelected());
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expectFocusAfterClose('installed-bulk-uninstall-partial-confirm');
        const removed = (packageId: string, status: OperationOutcome['status']): OperationOutcome => ({ opId: `op-${packageId}`, kind: 'remove', status, projectPath: A, packageId, message: status === 'failed' ? 'Moq could not be removed' : undefined });
        const partial: BulkOutcome = { opId: 'op2', status: 'partial', results: [removed('Serilog', 'completed'), removed('Moq', 'failed')], restores: [{ projectPath: A, ok: true }] };
        await hostSays(() => host.respond(host.requests('ops/bulkRemove')[0], partial));
        await waitFor(() => expect(said()).toBe('1 of 2 operations completed'));
        // Rows leave only with the host's next list: then Moq is still there.
        expect(names()).toEqual(['Serilog', 'Moq', 'Newtonsoft.Json']);
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
        await hostSays(() => host.respond(host.requests('installed/get')[1], installed(A, [THREE[1], THREE[2]]), 2));
        expect(names()).toEqual(['Moq', 'Newtonsoft.Json']);
    });

    it('All Projects: one tree with a group row per project; selections across projects become ops/bulkRemoveAllProjects with the project names', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS)));
        const request = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(request, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }));
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: installed(A, [pkg('Serilog')]) } }));
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', result: installed(B, [pkg('Moq'), pkg('xunit')]) } }));
        await hostSays(() => host.respond(request, { projectPaths: [A, B], errored: [] }));
        const tree = screen.getByRole('tree', { name: 'Installed packages' });
        expect(tree).toHaveAttribute('data-testid', 'installed-list');
        expect(within(tree).getByTestId('group-row-project-app').querySelector('[role="treeitem"]')).toHaveAttribute('aria-level', '1');
        expect(within(tree).getByTestId('group-row-project-lib').querySelector('[role="treeitem"]')).toHaveAttribute('aria-level', '1');
        expect(groupItem('transitive')).toHaveAttribute('aria-expanded', 'false'); expect(host.requests('allProjects/transitive')).toHaveLength(0);
        await user.click(optionOf('Serilog').querySelector('.nuiget-row-check') as Element);
        await user.click(optionOf('xunit').querySelector('.nuiget-row-check') as Element);
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (2)');
        await user.click(uninstallSelected());
        expect(screen.getByRole('alertdialog')).toHaveTextContent('From App:SerilogFrom Lib:xunit');
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expectFocusAfterClose('installed-all-projects-uninstall-confirm');
        expect(host.requests('ops/bulkRemoveAllProjects').map(entry => entry.payload)).toEqual([{
            projectRemovals: [{ projectPath: A, projectName: 'App', packages: ['Serilog'] }, { projectPath: B, projectName: 'Lib', packages: ['xunit'] }],
        }]);
    });

    it('the Transitive group row asks on first expand, shows the restore banner above the tree when the assets file is missing, and Restore asks with forceRestore', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        // One tree: the Transitive group row follows the direct rows (P9.fix-2, D48).
        expect(screen.getByTestId('installed-list')).toContainElement(screen.getByTestId('group-row-transitive'));
        expect(host.requests('transitive/get')).toHaveLength(0);
        await user.click(screen.getByTestId('section-header-transitive'));
        expect(groupItem('transitive')).toHaveAttribute('aria-expanded', 'true');
        expect(host.requests('transitive/get').map(request => request.payload)).toEqual([{ projectPath: A }]);
        const missing: TransitiveResult = { projectPath: A, frameworks: [], dataSourceAvailable: false };
        await hostSays(() => host.respond(host.requests('transitive/get')[0], missing, 1));
        const banner = screen.getByTestId('transitive-restore-banner');
        expect(screen.getByTestId('installed-list').contains(banner)).toBe(false);
        expect(banner.compareDocumentPosition(screen.getByTestId('installed-list')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        await user.click(within(banner).getByRole('button', { name: 'Restore' }));
        expect(host.requests('transitive/get')[1].payload).toEqual({ projectPath: A, forceRestore: true });
        const restored: TransitiveResult = { projectPath: A, dataSourceAvailable: true, frameworks: [{ targetFramework: 'net10.0', packages: [{ id: 'Microsoft.Extensions.Logging', version: '9.0.0', requiredByChain: ['Serilog'] }] }] };
        await hostSays(() => host.respond(host.requests('transitive/get')[1], restored, 2));
        expect(screen.queryByTestId('transitive-restore-banner')).toBeNull();
        expect(transitiveRows()).toHaveLength(1);
        expect(transitiveRows()[0]).not.toHaveAccessibleDescription(/Required by/);
        // The metadata request of the rows is answered `unsupported` until the feeds exist: still the rows.
        await hostSays(() => host.fail(host.requests('transitive/metadata')[0], 'unsupported', 'not yet available'));
        expect(transitiveRows()).toHaveLength(1);
    });

    it('Space and Delete on a transitive row change nothing and the live region says why', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(screen.getByTestId('section-header-transitive'));
        await hostSays(() => host.respond(host.requests('transitive/get')[0], { projectPath: A, dataSourceAvailable: true, frameworks: [{ targetFramework: 'net8.0', packages: [{ id: 'Core', version: '1.0.0', requiredByChain: ['Serilog'] }] }] }, 1));
        transitiveRows()[0].focus();
        await user.keyboard(' ');
        await waitFor(() => expect(said()).toBe('Transitive packages cannot be selected: they come with the packages that require them.'));
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (0)');
        expect(transitiveRows()[0]).toHaveAttribute('aria-selected', 'false');
        await user.keyboard('{Delete}');
        await waitFor(() => expect(said()).toBe('Transitive packages cannot be uninstalled: uninstall the package that requires them.'));
        expect(host.requests('ops/remove')).toHaveLength(0);
    });

    it('the transitive messages stand above the tree: a failed read, an unreadable assets file and no packages', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(screen.getByTestId('section-header-transitive'));
        const aboveTree = (element: HTMLElement): void => {
            expect(screen.getByTestId('installed-list').contains(element)).toBe(false);
            expect(element.compareDocumentPosition(screen.getByTestId('installed-list')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        };
        await hostSays(() => host.fail(host.requests('transitive/get')[0], 'unsupported', 'broken'));
        aboveTree(screen.getByText('The transitive packages could not be listed: broken'));
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        await hostSays(() => host.respond(host.requests('transitive/get')[1], { projectPath: A, dataSourceAvailable: true, frameworks: [], errorKind: 'parse-failed' }, 2));
        aboveTree(screen.getByText('The assets file of the project could not be read'));
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        await hostSays(() => host.respond(host.requests('transitive/get')[2], { projectPath: A, dataSourceAvailable: true, frameworks: [] }, 3));
        aboveTree(screen.getByText('No transitive dependencies.'));
    });

    it('another project closes Transitive, and a transitive selection that comes back is the current row', async () => {
        const user = userEvent.setup();
        const host = await mountWith(THREE, true);
        await user.click(screen.getByTestId('section-header-transitive'));
        await hostSays(() => host.respond(host.requests('transitive/get')[0], { projectPath: A, dataSourceAvailable: true, frameworks: [{ targetFramework: 'net8.0', packages: [{ id: 'Core', version: '1.0.0', requiredByChain: ['Serilog'] }] }] }, 1));
        await user.click(transitiveRows()[0]);
        expect(transitiveRows()[0]).toHaveAttribute('aria-current', 'true');
        // Collapsed and open again: the rows are new, the selection the same.
        await user.click(screen.getByTestId('section-header-transitive'));
        await user.click(screen.getByTestId('section-header-transitive'));
        expect(transitiveRows()[0]).toHaveAttribute('aria-current', 'true');
        await hostSays(() => host.event('session/changed', snapshot(2, B)));
        expect(groupItem('transitive')).toHaveAttribute('aria-expanded', 'false');
    });

    it('collapsing Transitive keeps what was listed', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(screen.getByTestId('section-header-transitive'));
        await hostSays(() => host.respond(host.requests('transitive/get')[0], { projectPath: A, dataSourceAvailable: true, frameworks: [{ targetFramework: 'net8.0', packages: [{ id: 'Core', version: '1.0.0', requiredByChain: ['Serilog'] }] }] }, 1));
        await user.click(screen.getByTestId('section-header-transitive'));
        expect(groupItem('transitive')).toHaveAttribute('aria-expanded', 'false');
        expect(transitiveRows()).toHaveLength(0);
        expect(screen.getByTestId('section-header-transitive')).toHaveTextContent('Transitive packages (1)');
        await user.click(screen.getByTestId('section-header-transitive'));
        expect(transitiveRows()).toHaveLength(1);
        expect(host.requests('transitive/get')).toHaveLength(1);
    });

    it('@vulnerable shows the vulnerable rows, or says that the data is not there yet', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.type(screen.getByTestId('search-input'), '@vulnerable');
        expect(screen.getByText('Vulnerability data is not available for this project yet.')).toBeInTheDocument();
        // The slice asks the metadata of the rows on screen; its answer brings the vulnerabilities.
        const ask = host.requests('transitive/metadata')[0];
        await hostSays(() => host.respond(ask, { metadata: [{ id: 'Moq', version: '4.20.0', vulnerabilities: [{ severity: 'High', advisoryUrl: 'https://github.com/advisories/x' }] }, { id: 'Serilog', version: '3.0.0' }] }));
        expect(names()).toEqual(['Moq']);
        expect(optionOf('Moq')).toHaveAccessibleDescription(/Has known vulnerabilities/);
    });

    it("has no axe violations with the dialog open, with All Projects group rows and an errored project's banner", async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(screen.getByTestId('select-all-button'));
        await user.click(uninstallSelected());
        let results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(['aria-dialog-name', 'nested-interactive', 'aria-allowed-attr'].map(rule => axeRuleOutcome(results, rule))).toEqual(['passes', 'passes', 'passes']);
        await user.keyboard('{Escape}');
        expectFocusAfterClose('installed-axe-dialog-escape');
        await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS)));
        const request = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: installed(A, [pkg('Serilog')]) } }));
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', error: 'assets file unreadable' } }));
        results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(screen.getByRole('alert')).toHaveTextContent('Installed packages of Lib could not be loaded: assets file unreadable');
        // The tree holds no control: its rows' actions are hidden siblings, and the errored project's Retry is above it.
        const tree = screen.getByTestId('installed-list');
        expect(tree.contains(screen.getByRole('alert'))).toBe(false);
        expect(within(tree).getAllByRole('treeitem').filter(item => item.querySelector('button, a[href], input, select, textarea, [tabindex]') !== null)).toEqual([]);
        await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }));
        expect(host.requests('allProjects/installed').length).toBeGreaterThan(1);
        expect(['aria-allowed-attr', 'aria-required-children', 'aria-required-parent', 'nested-interactive'].map(rule => axeRuleOutcome(results, rule))).toEqual(['passes', 'passes', 'passes', 'passes']);
    });

    it('installed row shows icon, authors and verified', async () => {
        const host = await mountWith();
        await hostSays(() => host.respond(host.requests('transitive/metadata')[0], { metadata: [
            { id: 'Serilog', version: '3.0.0', iconUrl: 'data:image/png;base64,AAAA', authors: 'Serilog Contributors', verified: true, description: 'Logging' },
            { id: 'Moq', version: '4.20.0' },
        ] }));
        const icon = (id: string): string | null | undefined => screen.getByTestId(`package-row-${id.toLowerCase()}`).querySelector('.nuiget-row-icon img')?.getAttribute('src');
        expect(icon('Serilog')).toBe('data:image/png;base64,AAAA');
        expect(icon('Moq')).toBe(DEFAULT_ICON);
        expect(optionOf('Serilog')).toHaveAccessibleDescription(/Verified: the package id prefix is reserved by its owner/);
        expect(optionOf('Serilog')).toHaveTextContent('Serilog Contributors');
        expect(optionOf('Moq')).not.toHaveAccessibleDescription(/Verified/);
        // No description on an Installed row (D14).
        expect(screen.queryByText('Logging')).toBeNull();
    });

    it('the Direct packages group row shows k of N while filtering', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        const header = (): HTMLElement => screen.getByTestId('section-header-direct');
        expect(header()).toHaveTextContent('Direct packages (3)');
        await user.type(screen.getByTestId('search-input'), '@installed ser');
        expect(header()).toHaveTextContent('Direct packages (1 of 3)');
        await user.clear(screen.getByTestId('search-input'));
        expect(header()).toHaveTextContent('Direct packages (3)');
        // Without vulnerability data `@vulnerable` counts nothing.
        await user.type(screen.getByTestId('search-input'), '@vulnerable');
        expect(header()).toHaveTextContent('Direct packages (3)');
        expect(screen.getByText('Vulnerability data is not available for this project yet.')).toBeInTheDocument();
        await hostSays(() => host.respond(host.requests('transitive/metadata')[0], { metadata: [{ id: 'Moq', version: '4.20.0', vulnerabilities: [{ severity: 'High', advisoryUrl: 'https://github.com/advisories/x' }] }] }));
        expect(header()).toHaveTextContent('Direct packages (1 of 3)');
    });

    it('SDK and props rows carry their badge and a muted check mark, and Space says why', async () => {
        const user = userEvent.setup();
        await mountWith([pkg('Microsoft.NET.ILLink.Tasks', { isImplicit: true }), pkg('Shared', { declaration: 'props' }), pkg('Serilog', { version: '3.0.0' })]);
        expect(optionOf('Microsoft.NET.ILLink.Tasks')).toHaveAccessibleDescription(/Added by the .NET SDK/);
        expect(optionOf('Shared')).toHaveAccessibleDescription(/imported props file/);
        for (const id of ['Microsoft.NET.ILLink.Tasks', 'Shared']) {
            expect(optionOf(id).querySelector('.nuiget-row-check')).toHaveClass('nuiget-row-check--off');
            expect(within(screen.getByTestId(`package-row-${id.toLowerCase()}`)).queryByTestId('row-action-uninstall')).toBeNull();
        }
        expect(optionOf('Serilog').querySelector('.nuiget-row-check')).not.toHaveClass('nuiget-row-check--off');

        optionOf('Microsoft.NET.ILLink.Tasks').focus();
        await user.keyboard(' ');
        expect(optionOf('Microsoft.NET.ILLink.Tasks')).toHaveAttribute('aria-selected', 'false');
        await waitFor(() => expect(said()).toBe('Microsoft.NET.ILLink.Tasks is added by the .NET SDK and cannot be uninstalled'));
        // Enter still shows its details.
        await user.keyboard('{Enter}');
        expect(optionOf('Microsoft.NET.ILLink.Tasks')).toHaveAttribute('aria-current', 'true');
    });

    it('floating and range rows show the declared pattern with the resolved version and a badge', async () => {
        await mountWith([pkg('Pattern', { version: '10.*', versionType: 'floating', resolvedVersion: '10.2.0' }), pkg('Ranged', { version: '[1,2)', versionType: 'range' })]);
        expect(screen.getByRole('treeitem', { name: 'Pattern 10.* (10.2.0)' })).toHaveAccessibleDescription(/Floating version pattern/);
        expect(screen.getByRole('treeitem', { name: 'Ranged [1,2) (run restore)' })).toHaveAccessibleDescription(/Version range/);
    });

    it('a transitive row under its framework group opens the read-only details with Required by and is current, not selected', async () => {
        const user = userEvent.setup();
        const host = await mountWith(THREE, true);
        await user.click(screen.getByTestId('section-header-transitive'));
        const result: TransitiveResult = { projectPath: A, dataSourceAvailable: true, frameworks: [{ targetFramework: 'net8.0', packages: [{ id: 'Microsoft.Extensions.Logging', version: '9.0.0', requiredByChain: ['Serilog'] }] }] };
        await hostSays(() => host.respond(host.requests('transitive/get')[0], result, 1));
        const header = screen.getByTestId('section-header-transitive');
        expect(header).toHaveTextContent('Transitive packages (1)');
        expect(header.closest('.nuiget-section-header')).toHaveTextContent('net8.0');
        // The installed rows ask their own metadata too: answer the ask of the transitive rows.
        const ask = host.requests('transitive/metadata').find(request => request.payload.packages.some(entry => entry.id === 'Microsoft.Extensions.Logging'))!;
        await hostSays(() => host.respond(ask, { metadata: [{ id: 'Microsoft.Extensions.Logging', version: '9.0.0', iconUrl: 'data:image/png;base64,AAAA', authors: 'Microsoft', verified: true }] }));
        const row = screen.getByTestId('package-row-microsoft.extensions.logging');
        const option = (): HTMLElement => within(screen.getByTestId('package-row-microsoft.extensions.logging')).getByRole('treeitem');
        expect(transitiveRows()).toEqual([option()]);
        expect(row.querySelector('.nuiget-row-icon img')).toHaveAttribute('src', 'data:image/png;base64,AAAA');
        expect(option()).toHaveTextContent('Microsoft');
        expect(option()).toHaveAccessibleDescription(/Verified: the package id prefix/);
        expect(option()).not.toHaveAccessibleDescription(/Required by/);
        expect(option().querySelector('.nuiget-row-check')).toHaveClass('nuiget-row-check--off');

        await user.click(option());
        expect(option()).toHaveAttribute('aria-current', 'true');
        expect(option()).toHaveAttribute('aria-selected', 'false');
        expect(optionOf('Serilog')).not.toHaveAttribute('aria-current');
        const details = screen.getByTestId('transitive-details');
        for (const text of ['Transitive', '9.0.0', 'Microsoft', 'Required by', 'Serilog']) {
            expect(details).toHaveTextContent(text);
        }
        expect(host.requests('package/versions')).toHaveLength(0);
        expect(host.requests('package/metadata')).toHaveLength(0);

        // A direct row made current takes the details back.
        await user.click(optionOf('Serilog'));
        expect(option()).not.toHaveAttribute('aria-current');
        expect(screen.getByTestId('install-update-button')).toBeInTheDocument();
    });

    it('several target frameworks: a level-2 group row per framework under Transitive, expanded by default, with its count and framework badge', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(screen.getByTestId('section-header-transitive'));
        const entry = (id: string) => ({ id, version: '1.0.0', requiredByChain: ['Serilog'] });
        await hostSays(() => host.respond(host.requests('transitive/get')[0], { projectPath: A, dataSourceAvailable: true, frameworks: [
            { targetFramework: 'net8.0', packages: [entry('A.Core')] },
            { targetFramework: 'net6.0', packages: [entry('B.Core')] },
        ] }, 1));
        expect(screen.getByTestId('section-header-transitive')).toHaveTextContent(/^Transitive packages$/);
        for (const tfm of ['net8.0', 'net6.0']) {
            const header = screen.getByTestId(`section-header-transitive-${tfm}`);
            expect(header).toHaveTextContent('Transitive packages (1)');
            expect(header.closest('.nuiget-section-header')).toHaveTextContent(tfm);
            expect(groupItem(`transitive-${tfm}`)).toHaveAttribute('aria-level', '2');
            expect(groupItem(`transitive-${tfm}`)).toHaveAttribute('aria-expanded', 'true');
        }
        expect(within(screen.getByTestId('package-row-a.core')).getByRole('treeitem')).toHaveAttribute('aria-level', '3');
        await user.click(screen.getByTestId('section-header-transitive-net8.0'));
        expect(screen.queryByTestId('package-row-a.core')).toBeNull();
        expect(screen.getByTestId('package-row-b.core')).toBeInTheDocument();
    });
});
