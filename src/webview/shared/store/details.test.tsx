import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ALL_PROJECTS, resourceKeys, type InstalledPackage, type PackageMetadata, type SessionSnapshot } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider } from '../bus/useMessageBus';
import { DetailsProvider, useDetails, useDetailsActions, type DetailsActions, type DetailsSelection } from './details';
import { InstalledProvider } from './installed';
import { SessionProvider } from './session';

const A = '/w/A/A.csproj';
const B = '/w/B/B.csproj';
const FEED = 'https://feed.example/v3/index.json';
const snapshot = (rev: number, selectedProject = A, includePrerelease = false): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease, restoreEnabled: true, origin: 'host' });
const pkg = (id: string, version: string): InstalledPackage => ({ id, version, versionType: 'standard', declaration: 'project' });
const metadata = (id: string, version: string): PackageMetadata => ({ id, version, description: `About ${id}`, authors: 'Ada', dependencies: [] });
const installedRow = (packageId: string, version: string, projectPath = A): DetailsSelection => ({ packageId, version, origin: 'installed', projectPath });
const browseRow = (packageId: string, version: string): DetailsSelection => ({ packageId, version, sourceUrl: FEED, origin: 'browse', projectPath: null });
const consolidateRow = (packageId: string, version: string): DetailsSelection => ({ packageId, version, origin: 'consolidate', projectPath: null });

let actions: DetailsActions;
function Details() {
    const state = useDetails();
    actions = useDetailsActions();
    return (
        <div>
            <output data-testid="selection">{state.selection ? `${state.selection.packageId}@${state.version}` : 'none'}</output>
            <output data-testid="versions">{state.versions.status}:{state.versions.value?.join(',') ?? '-'}</output>
            <output data-testid="metadata">{state.metadata.status}:{state.metadata.value === null ? 'null' : state.metadata.value ? `${state.metadata.value.id}@${state.metadata.value.version}` : '-'}</output>
            <output data-testid="readme">{state.readme.status}:{state.readme.value ?? '-'}</output>
            <output data-testid="stale">{String(state.stale)}</output>
            <output data-testid="error">{state.versions.error?.message ?? state.metadata.error?.message ?? 'none'}</output>
        </div>
    );
}

function mount(): FakeHost {
    const host = createFakeHost();
    render(<MessageBusProvider bus={host.bus}><SessionProvider><InstalledProvider><DetailsProvider><Details /></DetailsProvider></InstalledProvider></SessionProvider></MessageBusProvider>);
    return host;
}

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const text = (testId: string): string => screen.getByTestId(testId).textContent ?? '';
const versionsAsked = (host: FakeHost) => host.requests('package/versions');
const metadataAsked = (host: FakeHost) => host.requests('package/metadata');

async function ready(host: FakeHost, packages: InstalledPackage[] = [pkg('Serilog', '3.0.0')]): Promise<void> {
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'authoritative', isCpm: false, packages }, 1));
}

describe('details slice', () => {
    it('asks nothing without a selection; a selection asks its versions and the details of its version', async () => {
        const host = mount();
        await ready(host);
        expect(versionsAsked(host)).toHaveLength(0);
        expect(text('selection')).toBe('none');

        await act(async () => actions.select(browseRow('Polly', '8.4.2')));

        expect(versionsAsked(host).map(request => request.payload)).toEqual([{ packageId: 'Polly', sourceUrl: FEED, includePrerelease: false }]);
        expect(metadataAsked(host).map(request => request.payload)).toEqual([{ packageId: 'Polly', version: '8.4.2', sourceUrl: FEED }]);
        await hostSays(() => host.respond(versionsAsked(host)[0], { packageId: 'Polly', versions: ['8.4.2', '8.4.1'] }));
        await hostSays(() => host.respond(metadataAsked(host)[0], { metadata: metadata('Polly', '8.4.2') }));
        expect(text('versions')).toBe('ready:8.4.2,8.4.1');
        expect(text('metadata')).toBe('ready:Polly@8.4.2');
    });

    it('response for other package ignored', async () => {
        const host = mount();
        await ready(host);
        await act(async () => actions.select(browseRow('Polly', '8.4.2')));
        await act(async () => actions.select(browseRow('Moq', '4.20.72')));
        const [pollyVersions, moqVersions] = versionsAsked(host);
        const [pollyMetadata, moqMetadata] = metadataAsked(host);

        // The earlier selection's requests are cancelled; their answers never show.
        expect(host.cancelled()).toEqual(expect.arrayContaining([pollyVersions.id, pollyMetadata.id]));
        await hostSays(() => host.respond(pollyVersions, { packageId: 'Polly', versions: ['8.4.2'] }));
        await hostSays(() => host.respond(pollyMetadata, { metadata: metadata('Polly', '8.4.2') }));
        expect(text('versions')).toBe('loading:-');
        // An answer to this selection's own request that names another package or version is not shown either.
        await hostSays(() => host.respond(moqVersions, { packageId: 'Polly', versions: ['8.4.2'] }));
        await hostSays(() => host.respond(moqMetadata, { metadata: metadata('Moq', '4.18.0') }));
        expect(text('versions')).toBe('loading:-');
        expect(text('metadata')).toBe('loading:-');
    });

    it('another version asks its details and the README follows once shown; null is no README', async () => {
        const host = mount();
        await ready(host);
        await act(async () => actions.select(installedRow('Serilog', '3.0.0')));
        expect(versionsAsked(host)[0].payload).toEqual({ packageId: 'Serilog', sourceUrl: undefined, includePrerelease: false });
        expect(host.requests('package/readme')).toHaveLength(0);

        await act(async () => actions.chooseVersion('3.1.0'));
        expect(metadataAsked(host).map(request => request.payload.version)).toEqual(['3.0.0', '3.1.0']);
        await act(async () => actions.showReadme());
        expect(host.requests('package/readme').map(request => request.payload)).toEqual([{ packageId: 'Serilog', version: '3.1.0', sourceUrl: undefined }]);
        await hostSays(() => host.respond(host.requests('package/readme')[0], { readme: null }));
        expect(text('readme')).toBe('ready:-');
        await act(async () => actions.chooseVersion('3.0.0'));
        await hostSays(() => host.respond(host.requests('package/readme')[1], { readme: '# Serilog' }));
        expect(text('readme')).toBe('ready:# Serilog');

        // A new selection starts with the Details tab: no README is asked until it is shown again.
        await act(async () => actions.select(installedRow('Serilog', '3.0.0')));
        expect(host.requests('package/readme')).toHaveLength(2);
    });

    it('asks again when an invalidation names a versions: or metadata: key of the package, and only then', async () => {
        const host = mount();
        await ready(host);
        await act(async () => actions.select(browseRow('Polly', '8.4.2')));
        await hostSays(() => host.respond(versionsAsked(host)[0], { packageId: 'Polly', versions: ['8.4.2'] }));

        await hostSays(() => host.invalidate([[resourceKeys.versions('Polly', FEED, false), 2]]));
        expect(versionsAsked(host)).toHaveLength(2);
        expect(metadataAsked(host)).toHaveLength(1);
        // The list stays while it is asked again.
        expect(text('versions')).toBe('ready:8.4.2');
        await hostSays(() => host.invalidate([[resourceKeys.metadata('Polly', '8.4.2', FEED), 2]]));
        expect(metadataAsked(host)).toHaveLength(2);
        await hostSays(() => host.invalidate([[resourceKeys.versions('Polly.Core', FEED, false), 2], [resourceKeys.installed(A), 2]]));
        expect(versionsAsked(host)).toHaveLength(2);
    });

    it('a prerelease change asks the versions again', async () => {
        const host = mount();
        await ready(host);
        await act(async () => actions.select(browseRow('Polly', '8.4.2')));
        await hostSays(() => host.event('session/changed', snapshot(2, A, true)));
        expect(versionsAsked(host).map(request => request.payload.includePrerelease)).toEqual([false, true]);
    });

    it('an error ends loading and retry asks again', async () => {
        const host = mount();
        await ready(host);
        await act(async () => actions.select(browseRow('Polly', '8.4.2')));
        await hostSays(() => host.fail(versionsAsked(host)[0], 'failed', 'No package source could be reached for this package'));
        expect(text('versions')).toBe('error:-');
        expect(text('error')).toBe('No package source could be reached for this package');
        await act(async () => actions.retryVersions());
        expect(versionsAsked(host)).toHaveLength(2);
        expect(text('versions')).toBe('loading:-');
    });

    it('stale selection: another project keeps an installed selection read-only until its list confirms or clears it', async () => {
        const host = mount();
        await ready(host);
        await act(async () => actions.select(installedRow('Serilog', '3.0.0')));
        expect(text('stale')).toBe('false');

        await hostSays(() => host.event('session/changed', snapshot(2, B)));
        expect(text('stale')).toBe('true');
        expect(text('selection')).toBe('Serilog@3.0.0');
        await hostSays(() => host.respond(host.requests('installed/get')[1], { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('serilog', '2.12.0')] }, 1));
        expect(text('stale')).toBe('false');
        expect(text('selection')).toBe('Serilog@3.0.0');

        await hostSays(() => host.event('session/changed', snapshot(3, A)));
        expect(text('stale')).toBe('true');
        await hostSays(() => host.respond(host.requests('installed/get')[2], { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [pkg('Moq', '4.20.0')] }, 2));
        expect(text('selection')).toBe('none');
    });

    it('a transitive selection asks no versions or details and goes when the committed project changes', async () => {
        const host = mount();
        await ready(host);
        await act(async () => actions.select({ packageId: 'Microsoft.Extensions.Logging', version: '9.0.0', origin: 'transitive', projectPath: A }));
        expect(text('selection')).toBe('Microsoft.Extensions.Logging@9.0.0');
        await act(async () => actions.showReadme());
        expect(versionsAsked(host)).toHaveLength(0);
        expect(metadataAsked(host)).toHaveLength(0);
        expect(host.requests('package/readme')).toHaveLength(0);
        expect(text('versions')).toBe('idle:-');

        // Another project: its list does not have the package as a direct reference, so the selection goes.
        await hostSays(() => host.event('session/changed', snapshot(2, B)));
        await hostSays(() => host.respond(host.requests('installed/get').find(request => request.payload.projectPath === B)!, { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Serilog', '3.0.0')] }, 2));
        expect(text('selection')).toBe('none');
    });

    it('showView keeps one selection per view, starts browse without one and restores a tab\'s', async () => {
        const host = mount();
        await ready(host);
        await act(async () => actions.select(installedRow('Serilog', '3.0.0')));
        await act(async () => actions.showView('browse'));
        expect(text('selection')).toBe('none');
        await act(async () => actions.select(browseRow('Polly', '8.4.2')));
        expect(text('selection')).toBe('Polly@8.4.2');
        await act(async () => actions.showView('installed'));
        expect(text('selection')).toBe('Serilog@3.0.0');
        await act(async () => actions.showView('updates'));
        expect(text('selection')).toBe('none');
        await act(async () => actions.showView('browse'));
        expect(text('selection')).toBe('none');
        expect(versionsAsked(host).length).toBeGreaterThan(0);
    });

    it('the consolidate view holds a consolidate selection and leaves the Installed selection to come back (UX-P5.3c)', async () => {
        const host = mount();
        await ready(host);
        await act(async () => actions.select(installedRow('Serilog', '3.0.0')));
        const asked = versionsAsked(host).length;
        await act(async () => actions.showView('consolidate'));
        expect(text('selection')).toBe('none');
        expect(versionsAsked(host)).toHaveLength(asked);
        const row = consolidateRow('Polly', '8.4.0');
        await act(async () => actions.select(row));
        expect(text('selection')).toBe('Polly@null');
        await act(async () => actions.showView('installed'));
        expect(text('selection')).toBe('Serilog@3.0.0');
        await act(async () => actions.showView('consolidate'));
        expect(text('selection')).toBe('Polly@null');
    });

    it('a consolidate selection asks no package/metadata while its versions load, then exactly one, for the offered version', async () => {
        const host = mount();
        await ready(host);
        const row = consolidateRow('Polly', '8.4.0');
        await act(async () => actions.select(row));
        expect(versionsAsked(host).map(request => request.payload)).toEqual([{ packageId: 'Polly', sourceUrl: undefined, includePrerelease: false }]);
        await hostSays(() => host.respond(versionsAsked(host)[0], { packageId: 'Polly', versions: ['8.5.0', '8.4.2', '8.4.0'] }));
        expect(metadataAsked(host)).toHaveLength(0);
        await act(async () => actions.offerVersion(row, '8.4.2'));
        expect(text('selection')).toBe('Polly@8.4.2');
        expect(metadataAsked(host).map(request => request.payload)).toEqual([{ packageId: 'Polly', version: '8.4.2', sourceUrl: undefined }]);
    });

    it('a null offer shows the selection\'s version and asks its details once; a later default replaces it and is kept (UX-P5.fix-15)', async () => {
        const host = mount();
        await ready(host);
        const row = consolidateRow('Polly', '8.4.0');
        await act(async () => actions.select(row));
        await hostSays(() => host.respond(versionsAsked(host)[0], { packageId: 'Polly', versions: ['8.5.0', '8.4.2', '8.4.0'] }));
        await act(async () => actions.offerVersion(row, null));
        expect(text('selection')).toBe('Polly@8.4.0');
        expect(metadataAsked(host).map(request => request.payload.version)).toEqual(['8.4.0']);
        await act(async () => actions.offerVersion(row, null));
        expect(metadataAsked(host)).toHaveLength(1);
        await act(async () => actions.offerVersion(row, '8.4.2'));
        expect(text('selection')).toBe('Polly@8.4.2');
        await act(async () => actions.offerVersion(row, '8.5.0'));
        expect(text('selection')).toBe('Polly@8.4.2');
    });

    it('a null offer after a default changes nothing (UX-P5.fix-15)', async () => {
        const host = mount();
        await ready(host);
        const row = consolidateRow('Polly', '8.4.0');
        await act(async () => actions.select(row));
        await act(async () => actions.offerVersion(row, '8.4.2'));
        await act(async () => actions.offerVersion(row, null));
        expect(text('selection')).toBe('Polly@8.4.2');
    });

    it('the first offer for a selection is kept; a later offer for the same selection changes nothing; another selection object\'s offer is ignored', async () => {
        const host = mount();
        await ready(host);
        const row = consolidateRow('Polly', '8.4.0');
        await act(async () => actions.select(row));
        await act(async () => actions.offerVersion(row, '8.4.2'));
        await act(async () => actions.offerVersion(row, '8.5.0'));
        expect(text('selection')).toBe('Polly@8.4.2');
        await act(async () => actions.offerVersion(consolidateRow('Polly', '8.4.0'), '8.5.0'));
        expect(text('selection')).toBe('Polly@8.4.2');
        expect(metadataAsked(host)).toHaveLength(1);
    });

    it('a chosen version outlives a later offer; a showView round trip shows the offer again, never the selection\'s version', async () => {
        const host = mount();
        await ready(host);
        const row = consolidateRow('Polly', '8.4.0');
        await act(async () => actions.select(row));
        await act(async () => actions.chooseVersion('8.5.0'));
        await act(async () => actions.offerVersion(row, '8.4.2'));
        expect(text('selection')).toBe('Polly@8.5.0');
        await act(async () => actions.showView('installed'));
        await act(async () => actions.showView('consolidate'));
        expect(text('selection')).toBe('Polly@8.4.2');
    });

    it('two consolidate selections with the same default each get their details asked', async () => {
        const host = mount();
        await ready(host);
        const first = consolidateRow('Polly', '8.4.0');
        await act(async () => actions.select(first));
        await act(async () => actions.offerVersion(first, '8.4.2'));
        const second = consolidateRow('Moq', '4.20.0');
        await act(async () => actions.select(second));
        await act(async () => actions.offerVersion(second, '8.4.2'));
        expect(metadataAsked(host).map(request => request.payload.packageId)).toEqual(['Polly', 'Moq']);
    });

    it('versions failed: the details of the selection\'s version are asked; an empty answer shows the selection\'s version', async () => {
        const host = mount();
        await ready(host);
        await act(async () => actions.select(consolidateRow('Polly', '8.4.0')));
        await hostSays(() => host.fail(versionsAsked(host)[0], 'failed', 'The feed did not answer'));
        expect(text('selection')).toBe('Polly@8.4.0');
        expect(metadataAsked(host).map(request => request.payload.version)).toEqual(['8.4.0']);
        await act(async () => actions.select(consolidateRow('Moq', '4.20.0')));
        await hostSays(() => host.respond(versionsAsked(host)[1], { packageId: 'Moq', versions: [] }));
        expect(text('selection')).toBe('Moq@4.20.0');
    });

    it('versions failed, then Retry: the first ready answer applies the offer', async () => {
        const host = mount();
        await ready(host);
        const row = consolidateRow('Polly', '8.4.0');
        await act(async () => actions.select(row));
        await hostSays(() => host.fail(versionsAsked(host)[0], 'failed', 'The feed did not answer'));
        await act(async () => actions.retryVersions());
        await hostSays(() => host.respond(versionsAsked(host)[1], { packageId: 'Polly', versions: ['8.4.2', '8.4.0'] }));
        expect(text('selection')).toBe('Polly@null');
        await act(async () => actions.offerVersion(row, '8.4.2'));
        expect(text('selection')).toBe('Polly@8.4.2');
    });

    it('a consolidate selection is never stale: a committed project change neither clears it nor rewrites its project', async () => {
        const host = mount();
        await ready(host);
        await act(async () => actions.select(consolidateRow('Polly', '8.4.0')));
        await hostSays(() => host.event('session/changed', snapshot(2, B)));
        expect(text('stale')).toBe('false');
        expect(text('selection')).toBe('Polly@null');
    });

    it('a browse selection is never stale; All Projects clears an installed one', async () => {
        const host = mount();
        await ready(host);
        await act(async () => actions.select(browseRow('Polly', '8.4.2')));
        await hostSays(() => host.event('session/changed', snapshot(2, B)));
        expect(text('stale')).toBe('false');
        expect(text('selection')).toBe('Polly@8.4.2');

        await act(async () => actions.select(installedRow('Serilog', '3.0.0', B)));
        await hostSays(() => host.event('session/changed', snapshot(3, ALL_PROJECTS)));
        expect(text('selection')).toBe('none');
    });
});
