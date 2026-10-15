import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import type { NuGetSource, SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { axeRuleOutcome } from '../../../shared/primitives/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';

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
        await user.click(within(row('Contoso')).getByRole('button', { name: 'Remove Contoso' }));
        expect(within(row('Contoso')).getByRole('group', { name: 'Remove Contoso?' })).toHaveTextContent('Remove Contoso from /w/nuget.config?');
        await user.click(within(row('Contoso')).getByRole('button', { name: 'Cancel' }));
        expect(host.requests('sources/remove')).toHaveLength(0);

        await user.click(within(row('Contoso')).getByRole('button', { name: 'Remove Contoso' }));
        await user.click(within(row('Contoso')).getByRole('button', { name: 'Remove' }));
        expect(host.requests('sources/remove').map(request => request.payload)).toEqual([{ sourceName: 'Contoso', configFile: '/w/nuget.config' }]);
        await hostSays(() => host.respond(host.requests('sources/remove')[0], { sources: SOURCES.filter(source => source.name !== 'Contoso'), removedUrl: CONTOSO }, 2));
        expect(screen.queryByTestId('source-row-contoso')).toBeNull();

        // A source whose file is not known goes from the nearest config file: no configFile is sent.
        await user.click(within(row('Old')).getByRole('button', { name: 'Remove Old' }));
        expect(within(row('Old')).getByRole('group', { name: 'Remove Old?' })).toHaveTextContent('Remove Old from the nearest config file?');
        await user.click(within(row('Old')).getByRole('button', { name: 'Remove' }));
        expect(host.requests('sources/remove')[1].payload).toEqual({ sourceName: 'Old' });
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
    });

    it('has no axe violations with the dialog open', async () => {
        await mountReady();
        await openDialog();
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-dialog-name')).toBe('passes');
    });
});
