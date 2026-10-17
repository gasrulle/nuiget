import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_PROJECTS, type InstalledPackage, type NuGetSource, type PackageMetadata, type SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { axeRuleOutcome, installFakeLayout } from '../../../shared/primitives/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';
import { InstalledTab } from '../installed/InstalledTab';
import { BrowseList } from '../search/BrowseList';
import { UpdatesTab } from '../updates/UpdatesTab';
import { DetailsPane, primaryAction } from './DetailsPane';
import { COPIED_MS } from './markdown';

const A = '/w/App/App.csproj';
const B = '/w/Lib/Lib.csproj';
const FEED = 'https://feed.example/v3/index.json';
const LOCAL = '/packages';
const SOURCES: NuGetSource[] = [{ name: 'feed', url: FEED, enabled: true }, { name: 'local', url: LOCAL, enabled: true, isLocal: true }];
const snapshot = (rev: number, selectedProject = A): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const pkg = (id: string, version: string, changes: Partial<InstalledPackage> = {}): InstalledPackage => ({ id, version, versionType: 'standard', declaration: 'project', ...changes });
const metadata = (id: string, version: string, changes: Partial<PackageMetadata> = {}): PackageMetadata => ({ id, version, description: `About ${id}`, authors: 'Ada', dependencies: [], ...changes });

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

async function mountReady(packages: InstalledPackage[] = [pkg('Serilog', '3.0.0')], isCpm = false): Promise<FakeHost> {
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
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }, 1));
    await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'authoritative', isCpm, packages }, 1));
    await hostSays(() => host.respond(host.requests('sources/list')[0], { sources: SOURCES, failed: [] }, 1));
    return host;
}

const pane = (): HTMLElement => screen.getByTestId('package-details-panel');
const option = (listId: string, id: string): HTMLElement => within(within(screen.getByTestId(listId)).getByTestId(`package-row-${id.toLowerCase()}`)).getByRole('option');
const selector = (): HTMLSelectElement => screen.getByTestId('version-selector');
const primary = (): HTMLButtonElement => screen.getByTestId('install-update-button');
const versionsOf = (host: FakeHost) => host.requests('package/versions');
const metadataOf = (host: FakeHost) => host.requests('package/metadata');

async function selectInstalled(host: FakeHost, id = 'Serilog', versions = ['3.1.0', '3.0.0', '2.12.0']): Promise<void> {
    const user = userEvent.setup();
    await user.click(option('installed-list', id));
    await hostSays(() => host.respond(versionsOf(host)[versionsOf(host).length - 1], { packageId: id, versions }));
}

describe('main panel: details', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 440, row: 44 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('says how to get details until a row is made current, then shows the package and its versions', async () => {
        const host = await mountReady();
        expect(pane()).toHaveTextContent('Select a package to see its details.');

        await selectInstalled(host);

        expect(within(pane()).getByRole('heading', { name: 'Serilog' })).toBeInTheDocument();
        expect(versionsOf(host)[0].payload).toEqual({ packageId: 'Serilog', sourceUrl: undefined, includePrerelease: false });
        expect([...selector().options].map(element => element.textContent)).toEqual(['3.1.0', '3.0.0 (installed)', '2.12.0']);
        expect(selector()).toHaveValue('3.0.0');
        expect(primary()).toHaveTextContent('Update');
        expect(primary()).toBeDisabled();
        expect(screen.getByTestId('uninstall-button')).toBeEnabled();
        // One grid for both rows, so Uninstall and Update share a column (P9.fix-5).
        expect(screen.getByTestId('uninstall-button').parentElement).toHaveClass('nuiget-details-actions');
        expect(primary().parentElement).toBe(screen.getByTestId('uninstall-button').parentElement);
    });

    it('an override row changes its version in its project alone: ops/update without a preview', async () => {
        const user = userEvent.setup();
        const host = await mountReady([pkg('Serilog', '3.0.0', { declaration: 'central-override' })], true);
        await selectInstalled(host);
        await user.selectOptions(selector(), '3.1.0');
        expect(primary()).toBeEnabled();
        await user.click(primary());
        expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Serilog', version: '3.1.0', sourceUrl: undefined }]);
        expect(host.requests('cpm/preview')).toHaveLength(0);
        expect(screen.queryByTestId('cpm-preview-dialog')).toBeNull();
    });

    it('Update for a newer version, Downgrade for an older one, each asking ops/update with the chosen version', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await selectInstalled(host);

        await user.selectOptions(selector(), '2.12.0');
        expect(primary()).toHaveTextContent('Downgrade');
        expect(metadataOf(host).map(request => request.payload.version)).toEqual(['3.0.0', '2.12.0']);
        await user.selectOptions(selector(), '3.1.0');
        expect(primary()).toHaveTextContent('Update');
        await user.click(primary());
        expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Serilog', version: '3.1.0', sourceUrl: undefined }]);
        expect(primary()).toBeDisabled();

        await user.click(screen.getByTestId('uninstall-button'));
        // Busy until the operation ends: nothing more is asked.
        expect(host.requests('ops/remove')).toHaveLength(0);
    });

    it('an install into a Central Package Management project asks for the preview first: with a central entry it opens the dialog and installs on confirm, without one it installs at once', async () => {
        const user = userEvent.setup();
        const host = await mountReady([pkg('Serilog', '3.0.0', { declaration: 'central' })], true);
        await user.type(screen.getByTestId('search-input'), 'polly{Enter}');
        await hostSays(() => host.respond(host.requests('search/query')[0], { query: 'polly', results: [
            { id: 'Polly', version: '8.4.2', description: '', authors: '', versions: ['8.4.2'], sourceUrl: FEED },
            { id: 'Xunit', version: '2.9.0', description: '', authors: '', versions: ['2.9.0'], sourceUrl: FEED },
        ] }));
        await user.click(option('browse-list', 'Polly'));
        await hostSays(() => host.respond(versionsOf(host)[0], { packageId: 'Polly', versions: ['8.4.2'] }));
        await user.click(primary());
        expect(primary()).toBeDisabled();
        await hostSays(() => host.respond(host.requests('cpm/preview')[0], { preview: { centralPropsPath: '/w/Directory.Packages.props', packageId: 'Polly', fromVersion: '8.0.0', toVersion: '8.4.2', affectedProjects: [A, B] } }));
        const dialog = screen.getByTestId('cpm-preview-dialog');
        expect(dialog).toHaveAccessibleDescription(/Installing it sets the central version in Directory.Packages.props for every project that uses it: 8.0.0 → 8.4.2/);
        expect(host.requests('ops/install')).toHaveLength(0);
        // The dialog asks for its own preview.
        await hostSays(() => host.respond(host.requests('cpm/preview')[1], { preview: { centralPropsPath: '/w/Directory.Packages.props', packageId: 'Polly', fromVersion: '8.0.0', toVersion: '8.4.2', affectedProjects: [A, B] } }));
        await user.click(within(dialog).getByTestId('cpm-preview-confirm'));
        expect(host.requests('ops/install').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Polly', version: '8.4.2', sourceUrl: FEED }]);

        // Without a central entry: no dialog, the install runs at once.
        await user.click(option('browse-list', 'Xunit'));
        await hostSays(() => host.respond(versionsOf(host).at(-1)!, { packageId: 'Xunit', versions: ['2.9.0'] }));
        await user.click(primary());
        await hostSays(() => host.respond(host.requests('cpm/preview').at(-1)!, { preview: null }));
        expect(screen.queryByTestId('cpm-preview-dialog')).toBeNull();
        expect(host.requests('ops/install').map(request => request.payload.packageId)).toEqual(['Polly', 'Xunit']);
    });

    it('a failed preview opens the dialog with Retry and installs nothing', async () => {
        const user = userEvent.setup();
        const host = await mountReady([pkg('Serilog', '3.0.0', { declaration: 'central' })], true);
        await user.type(screen.getByTestId('search-input'), 'polly{Enter}');
        await hostSays(() => host.respond(host.requests('search/query')[0], { query: 'polly', results: [{ id: 'Polly', version: '8.4.2', description: '', authors: '', versions: ['8.4.2'], sourceUrl: FEED }] }));
        await user.click(option('browse-list', 'Polly'));
        await hostSays(() => host.respond(versionsOf(host)[0], { packageId: 'Polly', versions: ['8.4.2'] }));
        await user.click(primary());
        await hostSays(() => host.fail(host.requests('cpm/preview')[0], 'failed', 'no context'));
        const dialog = screen.getByTestId('cpm-preview-dialog');
        await hostSays(() => host.fail(host.requests('cpm/preview')[1], 'failed', 'no context'));
        expect(within(dialog).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
        expect(within(dialog).getByTestId('cpm-preview-confirm')).toBeDisabled();
        expect(host.requests('ops/install')).toHaveLength(0);
    });

    it('a browse result that is not installed is installed into the selected project from its source', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(screen.getByTestId('search-input'), 'polly{Enter}');
        await hostSays(() => host.respond(host.requests('search/query')[0], { query: 'polly', results: [{ id: 'Polly', version: '8.4.2', description: '', authors: '', versions: ['8.4.2'], sourceUrl: FEED }] }));
        await user.click(option('browse-list', 'Polly'));
        await hostSays(() => host.respond(versionsOf(host)[0], { packageId: 'Polly', versions: ['8.4.2', '8.4.1'] }));

        expect(versionsOf(host)[0].payload.sourceUrl).toBe(FEED);
        expect(screen.queryByTestId('uninstall-button')).toBeNull();
        expect(primary()).toHaveTextContent('Install');
        await user.click(primary());
        expect(host.requests('ops/install').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Polly', version: '8.4.2', sourceUrl: FEED }]);
    });

    it('an update row shows its latest version first; a centrally managed package previews the central change and updates on confirm', async () => {
        const user = userEvent.setup();
        const host = await mountReady([pkg('Newtonsoft.Json', '13.0.1', { declaration: 'central' })], true);
        await user.click(screen.getByTestId('updates-tab'));
        await hostSays(() => host.respond(host.requests('updates/get')[0], { projectPath: A, updates: [{ id: 'Newtonsoft.Json', installedVersion: '13.0.1', latestVersion: '13.0.3', sourceUrl: FEED }] }, 1));
        await user.click(option('updates-list', 'Newtonsoft.Json'));
        await hostSays(() => host.respond(versionsOf(host)[0], { packageId: 'Newtonsoft.Json', versions: ['13.0.3', '13.0.1'] }));

        expect(selector()).toHaveValue('13.0.3');
        expect(screen.getByText(/Its version is set centrally in Directory.Packages.props/)).toBeInTheDocument();
        await user.click(primary());
        const dialog = screen.getByTestId('cpm-preview-dialog');
        expect(host.requests('cpm/preview').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Newtonsoft.Json', version: '13.0.3' }]);
        expect(within(dialog).getByTestId('cpm-preview-confirm')).toBeDisabled();
        await hostSays(() => host.respond(host.requests('cpm/preview')[0], { preview: { centralPropsPath: '/w/Directory.Packages.props', packageId: 'Newtonsoft.Json', fromVersion: '13.0.1', toVersion: '13.0.3', affectedProjects: [A, B] } }));
        expect(dialog).toHaveTextContent('Changes the central version 13.0.1 → 13.0.3 in Directory.Packages.props for:');
        expect(within(dialog).getAllByRole('listitem').map(item => item.textContent)).toEqual(['App', 'Lib']);
        expect(host.requests('ops/update')).toHaveLength(0);
        await user.click(within(dialog).getByTestId('cpm-preview-confirm'));
        expect(screen.queryByTestId('cpm-preview-dialog')).toBeNull();
        expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Newtonsoft.Json', version: '13.0.3', sourceUrl: FEED }]);
    });

    it('a centrally managed package uninstalls from its project without a dialog', async () => {
        const user = userEvent.setup();
        const host = await mountReady([pkg('Newtonsoft.Json', '13.0.1', { declaration: 'central' })], true);
        await user.click(option('installed-list', 'Newtonsoft.Json'));
        await hostSays(() => host.respond(versionsOf(host)[0], { packageId: 'Newtonsoft.Json', versions: ['13.0.3', '13.0.1'] }));
        expect(screen.getByTestId('uninstall-button')).toBeEnabled();
        await user.click(screen.getByTestId('uninstall-button'));
        expect(screen.queryByTestId('cpm-preview-dialog')).toBeNull();
        expect(host.requests('cpm/preview')).toHaveLength(0);
        expect(host.requests('ops/remove').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Newtonsoft.Json' }]);
    });

    it('the Details tab: description, facts, vulnerabilities in words and dependencies by framework', async () => {
        const host = await mountReady();
        await selectInstalled(host);
        await hostSays(() => host.respond(metadataOf(host)[0], {
            metadata: metadata('Serilog', '3.0.0', {
                totalDownloads: 1234567, published: '2023-06-01T10:00:00Z', license: 'Apache-2.0', projectUrl: 'https://serilog.net', packageSize: 2_097_152,
                vulnerabilities: [{ advisoryUrl: 'https://github.com/advisories/GHSA-1', severity: 'High' }],
                dependencies: [{ targetFramework: 'net8.0', dependencies: [{ id: 'System.Diagnostics.DiagnosticSource', versionRange: '>= 8.0.0' }] }, { targetFramework: 'net6.0', dependencies: [] }],
            }),
        }));

        expect(screen.getByTestId('details-tab-details')).toHaveAttribute('aria-selected', 'true');
        expect(pane()).toHaveTextContent('About Serilog');
        expect(pane()).toHaveTextContent('1,234,567');
        expect(pane()).toHaveTextContent('2023-06-01');
        expect(pane()).toHaveTextContent('2.0 MB');
        expect(within(pane()).getByRole('link', { name: 'https://serilog.net' })).toHaveAttribute('href', 'https://serilog.net');
        expect(within(pane()).getByRole('region', { name: 'Vulnerabilities' })).toHaveTextContent('High severity');
        // The groups start collapsed: their toggles name the framework and the count, and no dependency is shown.
        const dependencies = within(pane()).getByRole('region', { name: 'Dependencies' });
        expect(within(dependencies).getByRole('button', { name: 'net8.0 (1)' })).toHaveAttribute('aria-expanded', 'false');
        expect(within(dependencies).getByRole('button', { name: 'net6.0 (0)' })).toHaveAttribute('aria-expanded', 'false');
        expect(dependencies).not.toHaveTextContent('System.Diagnostics.DiagnosticSource');
    });

    it('details show size and downloads', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(screen.getByTestId('search-input'), 'polly{Enter}');
        await hostSays(() => host.respond(host.requests('search/query')[0], { query: 'polly', results: [{ id: 'Polly', version: '8.4.2', description: '', authors: 'App vNext', versions: ['8.4.2'], sourceUrl: FEED, totalDownloads: 42_000, verified: true }] }));
        await user.click(option('browse-list', 'Polly'));
        await hostSays(() => host.respond(metadataOf(host)[0], { metadata: metadata('Polly', '8.4.2', { authors: 'App vNext', packageSize: 2_097_152, sourceUrl: FEED }) }));

        const fact = (term: string): HTMLElement => within(pane()).getByText(term, { selector: 'dt' }).parentElement as HTMLElement;
        expect(fact('Version')).toHaveTextContent('8.4.2');
        expect(fact('Downloads')).toHaveTextContent('42,000');
        expect(fact('Package size')).toHaveTextContent('2.0 MB');
        expect(within(fact('Author(s)')).getByRole('img', { name: /Verified/ })).toBeInTheDocument();
        expect([...pane().querySelectorAll('dt')].map(term => term.textContent)).toEqual(['Version', 'Author(s)', 'Downloads', 'Package size']);
        expect(within(pane()).queryByText('Report abuse')).toBeNull();
    });

    it('the Details tab links Report abuse for a nuget.org package and not for a private feed', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        const NUGET = 'https://api.nuget.org/v3/index.json';
        await user.type(screen.getByTestId('search-input'), 'polly{Enter}');
        await hostSays(() => host.respond(host.requests('search/query')[0], { query: 'polly', results: [
            { id: 'Polly', version: '8.4.2', description: '', authors: '', versions: ['8.4.2'], sourceUrl: NUGET },
            { id: 'Private.Lib', version: '1.0.0', description: '', authors: '', versions: ['1.0.0'], sourceUrl: FEED },
        ] }));
        await user.click(option('browse-list', 'Polly'));
        await hostSays(() => host.respond(metadataOf(host)[0], { metadata: metadata('Polly', '8.4.2', { sourceUrl: NUGET }) }));
        expect(within(pane()).getByRole('link', { name: 'Report this package' })).toHaveAttribute('href', 'https://www.nuget.org/packages/Polly/8.4.2/ReportAbuse');

        await user.click(option('browse-list', 'Private.Lib'));
        await hostSays(() => host.respond(metadataOf(host)[1], { metadata: metadata('Private.Lib', '1.0.0', { sourceUrl: FEED }) }));
        expect(within(pane()).queryByRole('link', { name: 'Report this package' })).toBeNull();
    });

    it('dependency groups collapsed with counts', async () => {
        const user = userEvent.setup();
        const host = await mountReady([pkg('Serilog', '3.0.0'), pkg('Moq', '4.20.0')]);
        await selectInstalled(host);
        await hostSays(() => host.respond(metadataOf(host)[0], { metadata: metadata('Serilog', '3.0.0', {
            dependencies: [{ targetFramework: 'net8.0', dependencies: [{ id: 'System.Diagnostics.DiagnosticSource', versionRange: '>= 8.0.0' }] }, { targetFramework: 'net6.0', dependencies: [] }],
        }) }));
        const dependencies = (): HTMLElement => within(pane()).getByRole('region', { name: 'Dependencies' });
        const toggle = (name: string): HTMLElement => within(dependencies()).getByRole('button', { name });
        expect(toggle('net8.0 (1)')).toHaveAttribute('aria-expanded', 'false');
        expect(toggle('net6.0 (0)')).toHaveAttribute('aria-expanded', 'false');
        expect(dependencies()).not.toHaveTextContent('System.Diagnostics.DiagnosticSource');

        await user.click(toggle('net8.0 (1)'));
        expect(toggle('net8.0 (1)')).toHaveAttribute('aria-expanded', 'true');
        expect(dependencies()).toHaveTextContent('System.Diagnostics.DiagnosticSource >= 8.0.0');
        await user.click(toggle('net6.0 (0)'));
        expect(dependencies()).toHaveTextContent('No dependencies.');

        // Another package starts collapsed, and so does this one made current again.
        await selectInstalled(host, 'Moq', ['4.20.0']);
        expect(within(pane()).getByRole('heading', { name: 'Moq' })).toBeInTheDocument();
        await user.click(option('installed-list', 'Serilog'));
        // Made current again, the package is asked for once more.
        const asked = metadataOf(host).filter(request => request.payload.packageId === 'Serilog');
        expect(asked).toHaveLength(2);
        await hostSays(() => host.respond(asked[1], { metadata: metadata('Serilog', '3.0.0', {
            dependencies: [{ targetFramework: 'net8.0', dependencies: [{ id: 'System.Diagnostics.DiagnosticSource', versionRange: '>= 8.0.0' }] }, { targetFramework: 'net6.0', dependencies: [] }],
        }) }));
        expect(toggle('net8.0 (1)')).toHaveAttribute('aria-expanded', 'false');
    });

    it('multi install offered in single project mode', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(screen.getByTestId('search-input'), 'polly{Enter}');
        await hostSays(() => host.respond(host.requests('search/query')[0], { query: 'polly', results: [{ id: 'Polly', version: '8.4.2', description: '', authors: '', versions: ['8.4.2'], sourceUrl: FEED }] }));
        await user.click(option('browse-list', 'Polly'));
        expect(primary()).toHaveTextContent('Install');
        await user.click(screen.getByTestId('multi-install-button'));

        expect(host.requests('allProjects/installed')).toHaveLength(1);
        const stream = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(stream, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [] } } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', result: { projectPath: B, fidelity: 'authoritative', isCpm: true, packages: [] } } }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B], errored: [] }));
        await waitFor(() => expect(host.requests('cpm/preview').map(request => request.payload)).toEqual([{ projectPath: B, packageId: 'Polly', version: '8.4.2' }]));
        await hostSays(() => host.respond(host.requests('cpm/preview')[0], { preview: null }));

        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-dialog-name')).toBe('passes');
        const dialog = screen.getByTestId('multi-install-dialog');
        await user.click(within(dialog).getByRole('checkbox', { name: 'Lib' }));
        await user.click(within(dialog).getByRole('button', { name: 'Install in 1 project' }));
        expect(host.requests('ops/bulkInstall').map(request => request.payload)).toEqual([{ projectPaths: [B], packageId: 'Polly', version: '8.4.2' }]);
        expect(screen.queryByTestId('multi-install-dialog')).toBeNull();
    });

    it('an installed package offers no Install in projects', async () => {
        const user = userEvent.setup();
        const host = await mountReady([pkg('Polly', '8.4.2')]);
        await user.type(screen.getByTestId('search-input'), 'polly{Enter}');
        await hostSays(() => host.respond(host.requests('search/query')[0], { query: 'polly', results: [{ id: 'Polly', version: '8.4.2', description: '', authors: '', versions: ['8.4.2'], sourceUrl: FEED }] }));
        await user.click(option('browse-list', 'Polly'));
        expect(screen.queryByTestId('multi-install-button')).toBeNull();
    });

    it('offline details say whether a source is down or no source knows the version', async () => {
        const host = await mountReady();
        await selectInstalled(host);
        await hostSays(() => host.respond(metadataOf(host)[0], { metadata: metadata('Serilog', '3.0.0', { offline: true }) }));
        expect(pane()).toHaveTextContent('Offline: no package source knows this version.');

        await hostSays(() => host.event('sources/health', { failed: [{ url: FEED, error: 'timeout' }] }));
        expect(pane()).toHaveTextContent('Offline: a package source could not be reached.');
    });

    it('the README tab renders the README, fetches its images through the host and copies code', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await selectInstalled(host);
        expect(host.requests('package/readme')).toHaveLength(0);

        await user.click(screen.getByTestId('details-tab-readme'));
        expect(host.requests('package/readme').map(request => request.payload)).toEqual([{ packageId: 'Serilog', version: '3.0.0', sourceUrl: undefined }]);
        await hostSays(() => host.respond(host.requests('package/readme')[0], { readme: '# Serilog\n\n![build](http://img.shields.io/b.svg)\n\n<script>alert(1)</script>\n\n```csharp\nvar log = 1;\n```' }));

        const content = screen.getByTestId('readme-content');
        expect(within(content).getByRole('heading', { name: 'Serilog' })).toBeInTheDocument();
        expect(content.querySelector('script')).toBeNull();
        await waitFor(() => expect(host.requests('readme/image').map(request => request.payload)).toEqual([{ url: 'https://img.shields.io/b.svg', sourceUrl: undefined }]));
        await hostSays(() => host.respond(host.requests('readme/image')[0], { url: 'https://img.shields.io/b.svg', dataUri: 'data:image/svg+xml;base64,AAAA' }));
        await waitFor(() => expect(content.querySelector('img')).toHaveAttribute('src', 'data:image/svg+xml;base64,AAAA'));

        const copied: string[] = [];
        const copy = (): HTMLElement => within(content).getByRole('button', { name: 'Copy C# code' });
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            // user-event's setup puts its own clipboard on navigator: the test's goes in after it.
            const clicker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { copied.push(value); } } });
            await clicker.click(copy());
            expect(copied).toEqual(['var log = 1;']);
            await waitFor(() => expect(copy()).toHaveAttribute('data-copied'));
            expect(copy()).toHaveTextContent('Copied');
            await waitFor(() => expect(screen.getByTestId('status-live')).toHaveTextContent('Copied the C# code.'));
            act(() => {
                vi.advanceTimersByTime(COPIED_MS);
            });
            expect(copy()).not.toHaveAttribute('data-copied');
            expect(copy()).toHaveTextContent('C#');
        } finally {
            vi.useRealTimers();
        }

        // Without the webview's clipboard the host copies it.
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
        await user.click(copy());
        await waitFor(() => expect(host.requests('ui/copyToClipboard').map(request => request.payload)).toEqual([{ text: 'var log = 1;' }]));
        await hostSays(() => host.respond(host.requests('ui/copyToClipboard')[0], {}));
        await waitFor(() => expect(copy()).toHaveAttribute('data-copied'));
    });

    it('the same row made current again keeps the README tab and shows its README; another package starts on Details', async () => {
        const user = userEvent.setup();
        const host = await mountReady([pkg('Serilog', '3.0.0'), pkg('Moq', '4.20.0')]);
        await selectInstalled(host);
        await user.click(screen.getByTestId('details-tab-readme'));
        await user.click(option('installed-list', 'Serilog'));

        expect(screen.getByTestId('details-tab-readme')).toHaveAttribute('aria-selected', 'true');
        expect(host.requests('package/readme')).toHaveLength(2);
        await hostSays(() => host.respond(host.requests('package/readme')[1], { readme: '# Serilog' }));
        expect(screen.getByTestId('readme-content')).toHaveTextContent('Serilog');

        await user.click(option('installed-list', 'Moq'));
        expect(screen.getByTestId('details-tab-details')).toHaveAttribute('aria-selected', 'true');
        expect(host.requests('package/readme')).toHaveLength(2);
    });

    it('no README is an empty state; a failure is Retry', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await selectInstalled(host);
        await user.click(screen.getByTestId('details-tab-readme'));
        await hostSays(() => host.respond(host.requests('package/readme')[0], { readme: null }));
        expect(screen.getByTestId('readme-empty')).toHaveTextContent('No README available.');

        await user.selectOptions(selector(), '3.1.0');
        await hostSays(() => host.fail(host.requests('package/readme')[1], 'failed', 'timeout'));
        await user.click(within(pane()).getByRole('button', { name: 'Retry' }));
        expect(host.requests('package/readme')).toHaveLength(3);
    });

    it('stale selection: another project keeps the details read-only until its list confirms the package', async () => {
        const host = await mountReady();
        await selectInstalled(host);

        await hostSays(() => host.event('session/changed', snapshot(2, B)));
        expect(pane()).toHaveTextContent('Showing Serilog of App until the packages of the selected project are listed.');
        expect(primary()).toBeDisabled();
        await hostSays(() => host.respond(host.requests('installed/get')[1], { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Serilog', '2.12.0')] }, 1));
        expect(pane()).not.toHaveTextContent('Showing Serilog of App');
        expect([...selector().options].map(element => element.textContent)).toContain('2.12.0 (installed)');
    });

    it('a browse selection under All Projects opens the project picker and installs into the projects picked', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS)));
        const stream = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(stream, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [pkg('Polly', '8.4.2')] } } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', result: { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Polly', '7.2.4')] } } }));
        await user.type(screen.getByTestId('search-input'), 'polly{Enter}');
        await hostSays(() => host.respond(host.requests('search/query')[0], { query: 'polly', results: [{ id: 'Polly', version: '8.4.2', description: '', authors: '', versions: ['8.4.2'], sourceUrl: FEED }] }));
        await user.click(option('browse-list', 'Polly'));

        expect(primary()).toHaveTextContent('Install…');
        await user.click(primary());
        const dialog = screen.getByTestId('multi-install-dialog');
        expect(within(dialog).getByRole('checkbox', { name: 'App' })).toBeDisabled();
        expect(dialog).toHaveTextContent('8.4.2 installed');
        expect(dialog).toHaveTextContent('installed: 7.2.4');
        expect(within(dialog).getByRole('button', { name: 'Install in 0 projects' })).toBeDisabled();
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-dialog-name')).toBe('passes');
        await user.click(within(dialog).getByRole('checkbox', { name: 'Lib' }));
        await user.click(within(dialog).getByRole('button', { name: 'Install in 1 project' }));

        expect(host.requests('ops/bulkInstall').map(request => request.payload)).toEqual([{ projectPaths: [B], packageId: 'Polly', version: '8.4.2' }]);
        expect(screen.queryByTestId('multi-install-dialog')).toBeNull();
    });

    it('an installed row under All Projects changes its own project', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS)));
        const stream = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(stream, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', result: { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Moq', '4.18.0')] } } }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B], errored: [] }));
        await user.click(option('installed-list-lib', 'Moq'));
        await hostSays(() => host.respond(versionsOf(host)[0], { packageId: 'Moq', versions: ['4.20.0', '4.18.0'] }));

        expect([...selector().options].map(element => element.textContent)).toContain('4.18.0 (installed)');
        await user.selectOptions(selector(), '4.20.0');
        await user.click(primary());
        expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: B, packageId: 'Moq', version: '4.20.0', sourceUrl: undefined }]);
    });

    it('no version of a local source can be listed, and it says so', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.type(screen.getByTestId('search-input'), 'mylib{Enter}');
        await hostSays(() => host.respond(host.requests('search/query')[0], { query: 'mylib', results: [{ id: 'MyLib', version: '1.0.0', description: '', authors: '', versions: [], sourceUrl: LOCAL }] }));
        await user.click(option('browse-list', 'MyLib'));
        await hostSays(() => host.respond(versionsOf(host)[0], { packageId: 'MyLib', versions: [] }));
        expect(pane()).toHaveTextContent('Versions of a local source cannot be listed.');
        expect(selector()).toHaveValue('1.0.0');
    });

    it('has no axe violations with details shown', async () => {
        const host = await mountReady();
        await selectInstalled(host);
        await hostSays(() => host.respond(metadataOf(host)[0], { metadata: metadata('Serilog', '3.0.0', { vulnerabilities: [{ advisoryUrl: 'https://github.com/advisories/GHSA-1', severity: 'Moderate' }] }) }));
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'label')).toBe('passes');
    });
    it('details pane does not show stale installed package in browse mode', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await selectInstalled(host);
        expect(pane()).toHaveTextContent('Serilog');
        await user.type(screen.getByTestId('search-input'), 'polly{Enter}');
        expect(pane()).toHaveTextContent('Select a package to see its details.');
        expect(screen.queryByTestId('install-update-button')).toBeNull();
        await hostSays(() => host.respond(host.requests('search/query')[0], { query: 'polly', results: [{ id: 'Polly', version: '8.4.2', description: '', authors: '', versions: ['8.4.2'], sourceUrl: FEED }] }));
        await user.click(option('browse-list', 'Polly'));
        expect(pane()).toHaveTextContent('Polly');
        // Clearing the box ends Browse: the Installed tab's own selection comes back.
        await user.clear(screen.getByTestId('search-input'));
        expect(screen.getByTestId('tab-bar')).toBeInTheDocument();
        expect(pane()).toHaveTextContent('Serilog');
    });

    it('switching tabs and back restores each tab\'s selection and its row', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await selectInstalled(host);
        await user.click(screen.getByTestId('updates-tab'));
        expect(pane()).toHaveTextContent('Select a package to see its details.');
        await user.click(screen.getByTestId('installed-tab'));
        expect(pane()).toHaveTextContent('Serilog');
        expect(option('installed-list', 'Serilog')).toHaveAttribute('aria-current', 'true');
    });
});

describe('primaryAction', () => {
    it('Install without an installed version; Update and Downgrade by the order of the list, Update when it cannot tell', () => {
        expect(primaryAction(undefined, '1.0.0', ['1.0.0'])).toBe('Install');
        expect(primaryAction('2.0.0', '3.0.0', ['3.0.0', '2.0.0', '1.0.0'])).toBe('Update');
        expect(primaryAction('2.0.0', '1.0.0', ['3.0.0', '2.0.0', '1.0.0'])).toBe('Downgrade');
        expect(primaryAction('2.0.0-beta', '1.0.0', ['3.0.0', '1.0.0'])).toBe('Update');
    });

});
