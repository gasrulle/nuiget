import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, resourceKeys, type BulkOutcome, type InstalledPackage, type InstalledResult, type OperationOutcome, type SessionSnapshot, type TransitiveResult } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { axeRuleOutcome, installFakeLayout } from '../../../shared/primitives/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';
import { InstalledTab } from './InstalledTab';

const A = '/w/App/App.csproj';
const B = '/w/Lib/Lib.csproj';
const snapshot = (rev: number, selectedProject = A): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const pkg = (id: string, changes: Partial<InstalledPackage> = {}): InstalledPackage => ({ id, version: '1.0.0', versionType: 'standard', declaration: 'project', ...changes });
const installed = (projectPath: string, packages: InstalledPackage[]): InstalledResult => ({ projectPath, fidelity: 'authoritative', isCpm: false, packages });
const THREE = [pkg('Serilog', { version: '3.0.0' }), pkg('Moq', { version: '4.20.0' }), pkg('Newtonsoft.Json', { version: '13.0.1', declaration: 'central' })];

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

function mount(): FakeHost {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><MainShell installed={view => <InstalledTab {...view} />} /></StoreProvider>);
    return host;
}

/** The panel on project A with the three packages listed. */
async function mountWith(packages: InstalledPackage[] = THREE): Promise<FakeHost> {
    const host = mount();
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }, 1));
    await hostSays(() => host.respond(host.requests('installed/get')[0], installed(A, packages), 1));
    return host;
}

const optionOf = (id: string): HTMLElement => within(screen.getByTestId(`package-row-${id.toLowerCase()}`)).getByRole('option');
/** The rows of the single-project list; the header's selects have options of their own. */
const names = (): string[] => {
    const list = screen.queryByTestId('installed-list');
    return list === null ? [] : within(list).queryAllByRole('option').map(element => element.querySelector('.nuiget-row-name')?.textContent ?? '');
};
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

    it("lists the committed project's packages as a multi-selectable list with the filter applied", async () => {
        const user = userEvent.setup();
        await mountWith();
        const list = screen.getByTestId('installed-list');
        expect(list).toHaveAttribute('role', 'listbox');
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

    it('select all selects the removable rows only and the toolbar counts them', async () => {
        const user = userEvent.setup();
        await mountWith();
        expect(uninstallSelected()).toBeDisabled();
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (0)');
        await user.click(screen.getByTestId('select-all-button'));
        expect(screen.getByTestId('select-all-button')).toHaveAttribute('aria-pressed', 'true');
        expect(['Serilog', 'Moq', 'Newtonsoft.Json'].map(id => optionOf(id).getAttribute('aria-selected'))).toEqual(['true', 'true', 'false']);
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (2)');
        // A second press clears.
        await user.click(screen.getByTestId('select-all-button'));
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (0)');
        // Space on the central row selects nothing and says why.
        optionOf('Newtonsoft.Json').focus();
        await user.keyboard(' ');
        expect(optionOf('Newtonsoft.Json')).toHaveAttribute('aria-selected', 'false');
        await waitFor(() => expect(said()).toBe('Newtonsoft.Json is managed centrally and cannot be uninstalled from this view yet'));
        optionOf('Moq').focus();
        await user.keyboard(' ');
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (1)');
    });

    it('the dialog lists the selected packages; Escape and Cancel send nothing', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(screen.getByTestId('select-all-button'));
        await user.click(uninstallSelected());
        const dialog = screen.getByRole('alertdialog', { name: 'Uninstall 2 packages?' });
        expect(within(dialog).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Serilog', 'Moq']);
        expect(dialog).toHaveTextContent('From App:');
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('alertdialog')).toBeNull();
        await user.click(uninstallSelected());
        await user.click(screen.getByTestId('confirm-dialog-cancel'));
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expect(host.requests('ops/bulkRemove')).toHaveLength(0);
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (2)');
    });

    it('Confirm asks ops/bulkRemove with exactly the listed ids, closes the dialog, and the rows are busy until the request settles', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(screen.getByTestId('select-all-button'));
        await user.click(uninstallSelected());
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expect(host.requests('ops/bulkRemove').map(request => request.payload)).toEqual([{ projectPath: A, packages: ['Serilog', 'Moq'] }]);
        // Busy from the request on, before the host reports anything (N61), and nothing left the list.
        expect(optionOf('Serilog')).toHaveAttribute('aria-busy', 'true');
        expect(optionOf('Moq')).toHaveAttribute('aria-busy', 'true');
        expect(optionOf('Newtonsoft.Json')).not.toHaveAttribute('aria-busy');
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (0)');
        const done: BulkOutcome = { opId: 'op1', status: 'completed', results: [], restores: [] };
        await hostSays(() => host.respond(host.requests('ops/bulkRemove')[0], done));
        expect(optionOf('Serilog')).not.toHaveAttribute('aria-busy');
        expect(names()).toEqual(['Serilog', 'Moq', 'Newtonsoft.Json']);
    });

    it("a partial outcome leaves the failed row where the host's list has it and is announced", async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(screen.getByTestId('select-all-button'));
        await user.click(uninstallSelected());
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
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

    it('All Projects: one section per project, selections across them become ops/bulkRemoveAllProjects with the project names', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS)));
        const request = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(request, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }));
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: installed(A, [pkg('Serilog')]) } }));
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', result: installed(B, [pkg('Moq'), pkg('xunit')]) } }));
        await hostSays(() => host.respond(request, { projectPaths: [A, B], errored: [] }));
        expect(screen.getByRole('listbox', { name: 'App' })).toHaveAttribute('data-testid', 'installed-list-app');
        expect(screen.getByRole('listbox', { name: 'Lib' })).toHaveAttribute('data-testid', 'installed-list-lib');
        expect(screen.getByTestId('section-header-transitive')).toHaveAttribute('aria-expanded', 'false'); expect(host.requests('transitive/get')).toHaveLength(0); expect(host.requests('allProjects/transitive')).toHaveLength(0);
        await user.click(within(screen.getByRole('listbox', { name: 'App' })).getByRole('option').querySelector('.nuiget-row-check') as Element);
        await user.click(within(screen.getByRole('listbox', { name: 'Lib' })).getAllByRole('option')[1].querySelector('.nuiget-row-check') as Element);
        expect(uninstallSelected()).toHaveTextContent('Uninstall selected (2)');
        await user.click(uninstallSelected());
        expect(screen.getByRole('alertdialog')).toHaveTextContent('From App:SerilogFrom Lib:xunit');
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expect(host.requests('ops/bulkRemoveAllProjects').map(entry => entry.payload)).toEqual([{
            projectRemovals: [{ projectPath: A, projectName: 'App', packages: ['Serilog'] }, { projectPath: B, projectName: 'Lib', packages: ['xunit'] }],
        }]);
    });

    it('the transitive section asks on first expand, shows the restore banner when the assets file is missing, and Restore asks with forceRestore', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        const section = screen.getByTestId('transitive-section');
        expect(host.requests('transitive/get')).toHaveLength(0);
        await user.click(within(section).getByRole('button', { name: /Transitive packages/ }));
        expect(host.requests('transitive/get').map(request => request.payload)).toEqual([{ projectPath: A }]);
        const missing: TransitiveResult = { projectPath: A, frameworks: [], dataSourceAvailable: false };
        await hostSays(() => host.respond(host.requests('transitive/get')[0], missing, 1));
        const banner = screen.getByTestId('transitive-restore-banner');
        await user.click(within(banner).getByRole('button', { name: 'Restore' }));
        expect(host.requests('transitive/get')[1].payload).toEqual({ projectPath: A, forceRestore: true });
        const restored: TransitiveResult = { projectPath: A, dataSourceAvailable: true, frameworks: [{ targetFramework: 'net10.0', packages: [{ id: 'Microsoft.Extensions.Logging', version: '9.0.0', requiredByChain: ['Serilog'] }] }] };
        await hostSays(() => host.respond(host.requests('transitive/get')[1], restored, 2));
        expect(screen.queryByTestId('transitive-restore-banner')).toBeNull();
        expect(screen.getByRole('listbox', { name: 'Transitive packages' })).toBeInTheDocument();
        expect(within(screen.getByRole('listbox', { name: 'Transitive packages' })).getByRole('option')).toHaveAccessibleDescription('Required by: Serilog');
        // The metadata request of the rows is answered `unsupported` until the feeds exist: still the rows.
        await hostSays(() => host.fail(host.requests('transitive/metadata')[0], 'unsupported', 'not yet available'));
        expect(within(screen.getByRole('listbox', { name: 'Transitive packages' })).getAllByRole('option')).toHaveLength(1);
    });

    it('@vulnerable shows the vulnerable rows, or says that the data is not there yet', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.type(screen.getByTestId('search-input'), '@vulnerable');
        expect(screen.getByText('Vulnerability data is not available for this project yet.')).toBeInTheDocument();
        // Metadata streams after the list and before the answer of a request: the next listing brings it.
        await hostSays(() => host.invalidate([[resourceKeys.installed(A), 2]]));
        const next = host.requests('installed/get')[1];
        await hostSays(() => host.chunk(next, { kind: 'metadata', packages: [{ id: 'Moq', version: '4.20.0', vulnerabilities: [{ severity: 'High', advisoryUrl: 'https://github.com/advisories/x' }] }, { id: 'Serilog', version: '3.0.0' }] }));
        await hostSays(() => host.respond(next, installed(A, THREE), 2));
        expect(names()).toEqual(['Moq']);
        expect(optionOf('Moq')).toHaveAccessibleDescription(/Has known vulnerabilities/);
    });

    it('has no axe violations with the dialog open and with All Projects sections', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(screen.getByTestId('select-all-button'));
        await user.click(uninstallSelected());
        let results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(['aria-dialog-name', 'nested-interactive', 'aria-allowed-attr'].map(rule => axeRuleOutcome(results, rule))).toEqual(['passes', 'passes', 'passes']);
        await user.keyboard('{Escape}');
        await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS)));
        const request = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: installed(A, [pkg('Serilog')]) } }));
        await hostSays(() => host.chunk(request, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', error: 'assets file unreadable' } }));
        results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(screen.getByRole('alert')).toHaveTextContent('Installed packages of Lib could not be loaded: assets file unreadable');
    });
});
