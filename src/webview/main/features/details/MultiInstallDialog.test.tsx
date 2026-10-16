import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, type InstalledPackage, type SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { installFakeLayout } from '../../../shared/primitives/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';
import { InstalledTab } from '../installed/InstalledTab';
import { BrowseList } from '../search/BrowseList';
import { UpdatesTab } from '../updates/UpdatesTab';
import { DetailsPane } from './DetailsPane';

const A = '/w/App/App.csproj';
const B = '/w/Lib/Lib.csproj';
const C = '/w/Web/Web.csproj';
const FEED = 'https://feed.example/v3/index.json';
const snapshot = (rev: number, selectedProject = A): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const pkg = (id: string, version: string): InstalledPackage => ({ id, version, versionType: 'standard', declaration: 'project' });
const preview = { centralPropsPath: '/w/Directory.Packages.props', packageId: 'Polly', fromVersion: '8.4.1', toVersion: '8.4.2', affectedProjects: [B] };

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

/** The main panel under All Projects with App (not CPM), Lib and Web (both CPM), the Polly browse row made current. */
async function openPicker(): Promise<FakeHost> {
    const user = userEvent.setup();
    const host = createFakeHost();
    render(
        <StoreProvider bus={host.bus}>
            <MainShell
                installed={view => <InstalledTab {...view} />}
                updates={view => <UpdatesTab {...view} />}
                browse={view => <BrowseList {...view} />}
                details={view => <DetailsPane {...view} />}
            />
        </StoreProvider>,
    );
    const projects = [{ name: 'App', path: A }, { name: 'Lib', path: B }, { name: 'Web', path: C }];
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects }, 1));
    await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [] }, 1));
    await hostSays(() => host.respond(host.requests('sources/list')[0], { sources: [{ name: 'feed', url: FEED, enabled: true }], failed: [] }, 1));
    await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS)));
    const stream = host.requests('allProjects/installed')[0];
    await hostSays(() => host.chunk(stream, { kind: 'start', projects }));
    await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [] } } }));
    await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', result: { projectPath: B, fidelity: 'authoritative', isCpm: true, packages: [pkg('Serilog', '4.0.0')] } } }));
    await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: C, projectName: 'Web', result: { projectPath: C, fidelity: 'authoritative', isCpm: true, packages: [] } } }));
    await hostSays(() => host.respond(stream, { projectPaths: [A, B, C], errored: [] }));
    await user.type(screen.getByTestId('search-input'), 'polly{Enter}');
    await hostSays(() => host.respond(host.requests('search/query')[0], { query: 'polly', results: [{ id: 'Polly', version: '8.4.2', description: '', authors: '', versions: ['8.4.2'], sourceUrl: FEED }] }));
    await user.click(within(within(screen.getByTestId('browse-list')).getByTestId('package-row-polly')).getByRole('option'));
    await user.click(screen.getByTestId('install-update-button'));
    return host;
}

describe('main panel: Install in All Projects', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 440, row: 44 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('a project where the package has a central entry is listed but cannot be picked, and the bulk install leaves it out', async () => {
        const user = userEvent.setup();
        const host = await openPicker();
        const dialog = screen.getByTestId('multi-install-dialog');

        // Only the CPM projects are asked, one after the other; the Install button waits for the answers.
        expect(host.requests('cpm/preview').map(request => request.payload)).toEqual([{ projectPath: B, packageId: 'Polly', version: '8.4.2' }]);
        await user.click(within(dialog).getByRole('checkbox', { name: 'App' }));
        expect(within(dialog).getByRole('button', { name: 'Install in 1 project' })).toBeDisabled();
        await hostSays(() => host.respond(host.requests('cpm/preview')[0], { preview }));
        await waitFor(() => expect(host.requests('cpm/preview')).toHaveLength(2));
        expect(host.requests('cpm/preview')[1].payload).toEqual({ projectPath: C, packageId: 'Polly', version: '8.4.2' });
        await hostSays(() => host.respond(host.requests('cpm/preview')[1], { preview: null }));

        await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'Lib' })).toBeDisabled());
        expect(dialog).toHaveTextContent('centrally managed: install it from the project to see the preview');
        expect(within(dialog).getByRole('checkbox', { name: 'Web' })).toBeEnabled();
        await user.click(within(dialog).getByRole('checkbox', { name: 'Web' }));
        await user.click(within(dialog).getByRole('button', { name: 'Install in 2 projects' }));

        expect(host.requests('ops/bulkInstall').map(request => request.payload)).toEqual([{ projectPaths: [A, C], packageId: 'Polly', version: '8.4.2' }]);
    });

    it('a failed preview blocks the project rather than installing blind', async () => {
        const user = userEvent.setup();
        const host = await openPicker();
        const dialog = screen.getByTestId('multi-install-dialog');

        await hostSays(() => host.fail(host.requests('cpm/preview')[0], 'failed', 'no context'));
        await waitFor(() => expect(host.requests('cpm/preview')).toHaveLength(2));
        await hostSays(() => host.respond(host.requests('cpm/preview')[1], { preview: null }));

        await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'Lib' })).toBeDisabled());
        expect(dialog).toHaveTextContent('preview failed');
        await user.click(within(dialog).getByRole('checkbox', { name: 'App' }));
        await user.click(within(dialog).getByRole('button', { name: 'Install in 1 project' }));

        expect(host.requests('ops/bulkInstall')).toHaveLength(1);
        expect(host.requests('ops/bulkInstall')[0].payload).toEqual({ projectPaths: [A], packageId: 'Polly', version: '8.4.2' });
    });
});
