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

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

/** The panel on project A, its packages listed, the Updates tab shown. */
async function mountWith(answer: { updates: PackageUpdate[]; sourcesUnavailable?: boolean } | null = { updates: UPDATES }, selectedProject = A): Promise<FakeHost> {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><MainShell installed={view => <InstalledTab {...view} />} updates={view => <UpdatesTab {...view} />} /></StoreProvider>);
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, selectedProject)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
    if (selectedProject === A) {
        await hostSays(() => host.respond(host.requests('installed/get')[0], installed([pkg('Serilog', { version: '3.0.0' }), pkg('Moq', { version: '4.20.0' }), pkg('Newtonsoft.Json', { version: '13.0.1', declaration: 'central' })]), 1));
        if (answer !== null) {
            await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, ...answer }, 1));
        }
    }
    await userEvent.setup().click(screen.getByTestId('updates-tab'));
    return host;
}

const optionOf = (id: string): HTMLElement => within(screen.getByTestId(`package-row-${id.toLowerCase()}`)).getByRole('option');
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
        expect(names()).toEqual(['Serilog', 'Moq', 'Newtonsoft.Json']);
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
            { id: 'Serilog', version: '3.1.0', sourceUrl: FEED },
            { id: 'Moq', version: '4.20.72', sourceUrl: FEED },
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

    it('a centrally managed package opens the read-only preview of the central change and sends nothing', async () => {
        const user = userEvent.setup();
        const host = await mountWith();
        await user.click(optionOf('Newtonsoft.Json'));
        await user.keyboard('{Enter}');
        const dialog = screen.getByTestId('cpm-preview-dialog');
        expect(dialog).toHaveAccessibleName('Newtonsoft.Json is centrally managed');
        expect(dialog).toHaveTextContent('from 13.0.1');
        expect(axeRuleOutcome(await axe(document.body), 'aria-dialog-name')).toBe('passes');
        await user.click(within(dialog).getByRole('button', { name: 'Close' }));
        expect(screen.queryByTestId('cpm-preview-dialog')).toBeNull();
        expect(host.requests('ops/update')).toHaveLength(0);
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
        expect(screen.getByTestId('updates-tab')).toHaveAccessibleName(/Updates\s+0/);
    });

    it('All Projects: an empty state instead of a list', async () => {
        const host = await mountWith(null, ALL_PROJECTS);
        expect(screen.getByText('Updates for All Projects are not available in this view yet. Select a single project.')).toBeInTheDocument();
        expect(host.requests('updates/get')).toHaveLength(0);
    });
});
