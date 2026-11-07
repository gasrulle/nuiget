import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import type { NuGetSource, SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { axeRuleOutcome, expectFocusAfterClose } from '../../../shared/primitives/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';
import { SourcesControl } from './SourcesControl';

const A = '/w/App/App.csproj';
const NUGET = 'https://api.nuget.org/v3/index.json';
const CONTOSO = 'https://contoso.example/v3/index.json';
const SOURCES: NuGetSource[] = [
    { name: 'nuget.org', url: NUGET, enabled: true, configFile: '/home/me/.nuget/NuGet/NuGet.Config' },
    { name: 'Contoso', url: CONTOSO, enabled: true, configFile: '/w/nuget.config' },
    { name: 'Old', url: 'https://old.example/v3/index.json', enabled: false },
];
const snapshot = (rev: number, changes: Partial<SessionSnapshot> = {}): SessionSnapshot => ({ rev, selectedProject: A, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host', ...changes });

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

async function mountReady(sources: NuGetSource[] = SOURCES): Promise<FakeHost> {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><MainShell /></StoreProvider>);
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
    await hostSays(() => host.respond(host.requests('sources/list')[0], { sources, failed: [] }, 1));
    return host;
}

const selector = (): HTMLSelectElement => screen.getByTestId('source-selector');
const dialog = (): HTMLElement => screen.getByTestId('source-settings-modal');
const row = (name: string): HTMLElement => screen.getByTestId(`source-row-${name.toLowerCase()}`);
const said = (): string => screen.getByTestId('status-live').textContent ?? '';

async function openDialog(): Promise<void> {
    await userEvent.setup().click(screen.getByTestId('source-settings'));
}

describe('main panel: sources', () => {
    it('the selector waits for the list, then offers All sources and every enabled source, and asks the host for the choice', async () => {
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><MainShell /></StoreProvider>);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        expect(selector()).toBeDisabled();
        await hostSays(() => host.respond(host.requests('sources/list')[0], { sources: SOURCES, failed: [] }, 1));

        expect(selector()).toBeEnabled();
        expect([...selector().options].map(option => option.textContent)).toEqual(['All sources', 'nuget.org', 'Contoso']);
        await userEvent.setup().selectOptions(selector(), CONTOSO);
        expect(host.requests('session/set').map(request => request.payload)).toEqual([{ selectedSource: CONTOSO }]);
        expect(selector()).toHaveValue(CONTOSO);
    });

    it('a selected source missing from the list stays shown as its URL', async () => {
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><MainShell /></StoreProvider>);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, { selectedSource: 'https://gone.example/v3/index.json' })));
        await hostSays(() => host.respond(host.requests('sources/list')[0], { sources: SOURCES, failed: [] }, 1));
        expect(selector()).toHaveDisplayValue('https://gone.example/v3/index.json');
    });

    it('the dialog lists every source with where it is declared; the checkbox disables and enables one', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await openDialog();

        expect(dialog()).toHaveAccessibleName('NuGet sources');
        expect(row('nuget.org')).toHaveTextContent('/home/me/.nuget/NuGet/NuGet.Config');
        // UX-P3.6: the box is named by the source alone and described by its URL and file.
        expect(within(row('nuget.org')).getByRole('checkbox', { name: 'nuget.org' })).toHaveAccessibleDescription(`${NUGET} /home/me/.nuget/NuGet/NuGet.Config`);
        // Once the host names the config files, a file shows by its label (case-insensitively); one with no label keeps its path.
        await hostSays(() => host.respond(host.requests('sources/configFiles')[0], { configFiles: [{ path: '/HOME/me/.nuget/NuGet/NuGet.Config', label: 'User' }] }));
        expect(within(row('nuget.org')).getByRole('checkbox', { name: 'nuget.org' })).toHaveAccessibleDescription(`${NUGET} User`);
        expect(row('Contoso')).toHaveTextContent('/w/nuget.config');
        expect(within(row('Old')).getByRole('checkbox')).not.toBeChecked();
        await user.click(within(row('Contoso')).getByRole('checkbox', { name: /Contoso/ }));
        expect(host.requests('sources/disable').map(request => request.payload)).toEqual([{ sourceName: 'Contoso' }]);
        expect(within(row('Contoso')).getByRole('checkbox')).toBeDisabled();
        await hostSays(() => host.respond(host.requests('sources/disable')[0], { sources: SOURCES.map(source => (source.name === 'Contoso' ? { ...source, enabled: false } : source)) }, 2));
        expect(within(row('Contoso')).getByRole('checkbox')).not.toBeChecked();
        await waitFor(() => expect(said()).toBe('Contoso disabled'));
        // The selector follows the list: a disabled source is no choice.
        expect([...selector().options].map(option => option.textContent)).toEqual(['All sources', 'nuget.org']);
    });

    it('Remove asks in the dialog first and removes from the file that declares the source; Cancel keeps it', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await openDialog();
        // UX-P3.6: one ConfirmDialog over the sources dialog, focus on Cancel; Cancel returns to the row's Remove.
        await user.click(within(row('Contoso')).getByRole('button', { name: 'Remove Contoso' }));
        const confirm = screen.getByRole('alertdialog', { name: 'Remove Contoso?' });
        expect(confirm).toHaveAccessibleDescription('Removes Contoso from /w/nuget.config. This cannot be undone.');
        expect(screen.getByTestId('confirm-dialog-cancel')).toHaveFocus();
        await user.click(screen.getByTestId('confirm-dialog-cancel'));
        expectFocusAfterClose('sources-remove-cancel');
        expect(within(row('Contoso')).getByRole('button', { name: 'Remove Contoso' })).toHaveFocus();
        expect(host.requests('sources/remove')).toHaveLength(0);

        await user.click(within(row('Contoso')).getByRole('button', { name: 'Remove Contoso' }));
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expect(host.requests('sources/remove').map(request => request.payload)).toEqual([{ sourceName: 'Contoso', configFile: '/w/nuget.config' }]);
        await hostSays(() => host.respond(host.requests('sources/remove')[0], { sources: SOURCES.filter(source => source.name !== 'Contoso'), removedUrl: CONTOSO }, 2));
        expect(screen.queryByTestId('source-row-contoso')).toBeNull();
        // The row is gone: focus is on the next row's Remove.
        expectFocusAfterClose('sources-remove-confirm');
        expect(within(row('Old')).getByRole('button', { name: 'Remove Old' })).toHaveFocus();

        // A source whose file is not known goes from the nearest config file: no configFile is sent.
        await user.click(within(row('Old')).getByRole('button', { name: 'Remove Old' }));
        expect(screen.getByRole('alertdialog', { name: 'Remove Old?' })).toHaveAccessibleDescription('Removes Old from the nearest config file. This cannot be undone.');
        await user.click(screen.getByTestId('confirm-dialog-confirm'));
        expect(host.requests('sources/remove')[1].payload).toEqual({ sourceName: 'Old' });
    });

    it('a failed refresh shows the inline error above the kept list and Retry asks again (UX-P3.6)', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await openDialog();
        await hostSays(() => host.event('resources/invalidated', { scope: { kind: 'sources' }, reason: 'manual-refresh', generation: 5, keys: [] }));
        // Refreshing: the bar over the top, the rows kept and the list busy.
        expect(screen.getByTestId('source-settings-progress')).toBeInTheDocument();
        expect(screen.getByTestId('source-settings-list')).toHaveAttribute('aria-busy', 'true');
        expect(row('Contoso')).toBeInTheDocument();
        await hostSays(() => host.fail(host.requests('sources/list')[1], 'failed', 'The NuGet configuration could not be read'));
        const error = screen.getByTestId('source-settings-error');
        expect(error).toHaveTextContent('The sources could not be listed: The NuGet configuration could not be read.');
        expect(screen.queryByTestId('source-settings-progress')).toBeNull();
        expect(error.compareDocumentPosition(screen.getByTestId('source-settings-list')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        await user.click(within(error).getByRole('button', { name: 'Retry' }));
        expect(host.requests('sources/list')).toHaveLength(3);
    });

    it('an empty list says "No package sources." (UX-P3.6)', async () => {
        await mountReady([]);
        await openDialog();
        expect(screen.getByTestId('source-settings-empty')).toHaveTextContent('No package sources.');
        expect(screen.queryByTestId('source-settings-list')).toBeNull();
    });

    it('has no axe violations with the confirmation open (UX-P3.6)', async () => {
        const user = userEvent.setup();
        await mountReady();
        await openDialog();
        await user.click(within(row('Contoso')).getByRole('button', { name: 'Remove Contoso' }));
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-dialog-name')).toBe('passes');
    });

    it('Add source: a form in the dialog with the config file, URL, name and credentials', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await openDialog();
        await user.click(within(dialog()).getByRole('button', { name: 'Add source' }));
        expect(dialog()).toHaveAccessibleName('Add a NuGet source');
        await hostSays(() => host.respond(host.requests('sources/configFiles')[0], { configFiles: [{ path: '/w/nuget.config', label: 'Workspace' }, { path: '/home/me/NuGet.Config', label: 'User' }] }));

        const panel = screen.getByTestId('add-source-panel');
        await user.selectOptions(within(panel).getByLabelText('Add to config file'), '/home/me/NuGet.Config');
        await user.type(within(panel).getByLabelText('URL'), 'https://pkgs.example/v3/index.json');
        await user.type(within(panel).getByLabelText('Name (optional)'), 'Example');
        await user.click(within(panel).getByRole('button', { name: 'Credentials' }));
        await user.type(within(panel).getByLabelText('Username'), 'me');
        await user.type(within(panel).getByLabelText('Password'), '%TOKEN%');
        await user.click(within(panel).getByRole('button', { name: 'Add source' }));

        expect(host.requests('sources/add').map(request => request.payload)).toEqual([{ url: 'https://pkgs.example/v3/index.json', name: 'Example', configFile: '/home/me/NuGet.Config', username: 'me', password: '%TOKEN%', storeEncrypted: false }]);
        await hostSays(() => host.respond(host.requests('sources/add')[0], { sources: [...SOURCES, { name: 'Example', url: 'https://pkgs.example/v3/index.json', enabled: true }] }, 2));
        await waitFor(() => expect(said()).toBe('Example added'));
        expect(row('Example')).toBeInTheDocument();
    });

    it('a %VAR% password is stored in clear text on Windows: the encrypt box is off and disabled and sources/add carries storeEncrypted false', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await openDialog();
        await waitFor(() => expect(host.requests('config/get').length).toBeGreaterThan(0));
        await hostSays(() => host.respond(host.requests('config/get')[0], { searchDebounceMode: 'quicksearch', quickSearchResultsPerSource: 5, searchResultLimit: 20, enablePerformanceLogging: false, treeIndent: 16, isWindows: true }));
        await user.click(within(dialog()).getByRole('button', { name: 'Add source' }));
        const panel = screen.getByTestId('add-source-panel');
        await user.type(within(panel).getByLabelText('URL'), 'https://pkgs.example/v3/index.json');
        await user.click(within(panel).getByRole('button', { name: 'Credentials' }));
        await user.type(within(panel).getByLabelText('Password'), 'plain');
        // An ordinary password on Windows is encrypted by default.
        expect(within(panel).getByRole('checkbox', { name: 'Store the password encrypted' })).toBeChecked();
        await user.clear(within(panel).getByLabelText('Password'));
        await user.type(within(panel).getByLabelText('Password'), '%TOKEN%');
        const box = within(panel).getByRole('checkbox', { name: /Stored in clear text/ });
        expect(box).not.toBeChecked();
        expect(box).toBeDisabled();
        await user.click(within(panel).getByRole('button', { name: 'Add source' }));
        expect(host.requests('sources/add')[0].payload.storeEncrypted).toBe(false);
        expect(host.requests('sources/add')[0].payload.password).toBe('%TOKEN%');
    });

    it('an HTTP source needs the insecure option; a refusal is shown in the form, which stays', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await openDialog();
        await user.click(within(dialog()).getByRole('button', { name: 'Add source' }));
        const panel = screen.getByTestId('add-source-panel');
        expect(within(panel).getByLabelText('URL')).toHaveFocus();
        await user.type(within(panel).getByLabelText('URL'), 'http://feed.local/v3/index.json');
        await user.click(within(panel).getByRole('checkbox', { name: /insecure/ }));
        await user.click(within(panel).getByRole('button', { name: 'Add source' }));
        expect(host.requests('sources/add')[0].payload).toEqual({ url: 'http://feed.local/v3/index.json', allowInsecure: true });

        await hostSays(() => host.fail(host.requests('sources/add')[0], 'failed', 'A source with this URL exists'));
        expect(within(panel).getByRole('alert')).toHaveTextContent('A source with this URL exists');
        expect(screen.getByTestId('add-source-panel')).toBeInTheDocument();
        expect(within(panel).getByLabelText('URL')).toHaveValue('http://feed.local/v3/index.json');
        await user.click(within(panel).getByRole('button', { name: 'Back' }));
        expect(dialog()).toHaveAccessibleName('NuGet sources');
        // Focus stays in the dialog, on the button that opened the form.
        expect(within(dialog()).getByRole('button', { name: 'Add source' })).toHaveFocus();
    });

    it('the host can open the dialog; Escape closes it', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await hostSays(() => host.event('ui/openSourceSettings', {}));
        expect(dialog()).toBeInTheDocument();
        await user.keyboard('{Escape}');
        expect(screen.queryByTestId('source-settings-modal')).toBeNull();
        expectFocusAfterClose('sources-host-opened-escape');
    });

    it('has no axe violations with the dialog open', async () => {
        await mountReady();
        await openDialog();
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-dialog-name')).toBe('passes');
    });

    it('a failed source is marked in the selector and the indicator retries with sources/refresh', async () => {
        const host = createFakeHost();
        const { container } = render(<StoreProvider bus={host.bus}><MainShell /></StoreProvider>);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
        await hostSays(() => host.respond(host.requests('sources/list')[0], { sources: SOURCES, failed: [{ url: NUGET, error: 'ECONNREFUSED' }] }, 1));

        expect([...selector().options].map(option => option.textContent)).toEqual(['All sources', 'nuget.org (unreachable)', 'Contoso']);
        expect(selector().options[1]).toHaveAttribute('title', 'ECONNREFUSED');
        const indicator = screen.getByTestId('source-health-indicator');
        expect(indicator).toHaveAccessibleName('1 source unreachable. Retry');
        expect(await axe(container)).toHaveNoViolations();

        await userEvent.setup().click(indicator);
        expect(host.requests('sources/refresh')).toHaveLength(1);
        expect(host.requests('sources/list')).toHaveLength(1);
        // The reset health tracker reports no failed source.
        await hostSays(() => host.event('sources/health', { failed: [] }));
        expect([...selector().options].map(option => option.textContent)).toEqual(['All sources', 'nuget.org', 'Contoso']);
        expect(screen.queryByTestId('source-health-indicator')).toBeNull();
    });

    it('the gear, the health indicator and the shell\'s end control share the 4 px action group; the select stands outside it', async () => {
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><SourcesControl announce={() => undefined} end={<button type="button" data-testid="end">End</button>} /></StoreProvider>);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await hostSays(() => host.respond(host.requests('sources/list')[0], { sources: SOURCES, failed: [{ url: SOURCES[0].url, error: 'ECONNREFUSED' }] }, 1));
        const group = screen.getByTestId('source-settings').parentElement as HTMLElement;
        expect(group).toHaveClass('nuiget-main-actions');
        expect(group).not.toContainElement(screen.getByTestId('source-selector'));
        const order = [screen.getByTestId('source-settings'), screen.getByTestId('source-health-indicator'), screen.getByTestId('end')];
        expect(order.every(element => group.contains(element))).toBe(true);
        expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});
