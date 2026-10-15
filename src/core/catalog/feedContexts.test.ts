import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { DotnetRunner, SourceProvider } from '../contracts';
import type { NuGetSource } from '../../protocol/domain';
import { DefaultOutboundPolicy, type NuGetConfigDocument } from '../sources';
import { FakeTransport, json } from '../feeds/testSupport';
import type { ResolvedSource, ServiceIndexClient } from '../feeds';
import { createFeedClients, type FeedClients, type PolicyClients } from './feedClients';
import { FeedContexts } from './feedContexts';

const privateFeed: NuGetSource = { name: 'private', url: 'https://feed.example/v3/index.json', enabled: true };
const chainFile = path.resolve('/w/nuget.config');

function sourcesOf(listing: NuGetSource[]): SourceProvider & { listSources: ReturnType<typeof vi.fn> } {
    const unused = async () => ({ ok: true });
    return { listSources: vi.fn(async () => listing), configFiles: () => [], add: unused, remove: unused, enable: unused, disable: unused, invalidate: vi.fn() };
}

function document(overrides: Partial<NuGetConfigDocument> = {}): NuGetConfigDocument {
    return { path: chainFile, sources: [], disabled: [], credentials: [], ...overrides };
}

/** Feed clients whose `forPolicy` hands out a fresh set of fakes per chain. */
function fakeFeeds(): FeedClients & { forPolicy: ReturnType<typeof vi.fn>; built: PolicyClients[] } {
    const built: PolicyClients[] = [];
    return {
        built,
        forPolicy: vi.fn(() => {
            const clients = { icons: { icon: vi.fn(), reset: vi.fn() } } as unknown as PolicyClients;
            built.push(clients);
            return clients;
        }),
    } as unknown as FeedClients & { forPolicy: ReturnType<typeof vi.fn>; built: PolicyClients[] };
}

function contextsWith(chains: Record<string, string[]>) {
    return {
        get: vi.fn(async (projectPath: string) => ({ context: { projectPath, projectDir: path.dirname(projectPath), configFiles: chains[path.dirname(projectPath)] ?? [], sourceUrls: [], revision: 'r' } })),
        configFilesFor: vi.fn(async (directory: string) => chains[directory] ?? []),
    };
}

describe('FeedContexts', () => {
    it('one context per nuget.config chain, reached by project and by directory, without a second config-paths run for a known directory', async () => {
        const app = path.resolve('/w/App');
        const other = path.resolve('/w/Other');
        const contexts = contextsWith({ [app]: [chainFile], [other]: [chainFile] });
        const feeds = fakeFeeds();
        const registry = new FeedContexts({ contexts, sources: sourcesOf([privateFeed]), configs: { readChain: vi.fn(async () => [document()]) }, feeds });

        const byProject = await registry.forProject(path.join(app, 'App.csproj'));
        const again = await registry.forProject(path.join(app, 'App.csproj'));
        const byDirectory = await registry.forDirectory(app);
        const byOther = await registry.forDirectory(other);

        expect(again).toBe(byProject);
        expect(byDirectory).toBe(byProject);
        expect(byOther).toBe(byProject);
        expect(byProject).toMatchObject({ key: chainFile, directory: app, configFiles: [chainFile], sources: [privateFeed] });
        expect(contexts.get).toHaveBeenCalledTimes(1);
        expect(contexts.configFilesFor.mock.calls.map(call => call[0])).toEqual([other]);
        expect(feeds.forPolicy).toHaveBeenCalledTimes(1);
    });

    it('an empty chain is one shared context without mapping or config credentials', async () => {
        const feeds = fakeFeeds();
        const registry = new FeedContexts({ contexts: contextsWith({}), sources: sourcesOf([privateFeed]), configs: { readChain: vi.fn(async () => []) }, feeds });

        const first = await registry.forDirectory(path.resolve('/a'));
        const second = await registry.forDirectory(path.resolve('/b'));

        expect(second).toBe(first);
        expect(first.key).toBe('');
        expect(first.merged.mapping).toBeUndefined();
        expect(first.policy.allowedSourcesFor('Any.Package', [privateFeed])).toEqual([privateFeed]);
        await expect(registry.lookupConfigCredential(privateFeed.url)).resolves.toBeUndefined();
    });

    it('the credential of a source URL is found once its chain is registered', async () => {
        const credentials = [{ kind: 'item' as const, name: 'private', username: 'ci', password: 'secret', passwordKind: 'clear' as const }];
        const registry = new FeedContexts({
            contexts: contextsWith({ [path.resolve('/w')]: [chainFile] }),
            sources: sourcesOf([privateFeed]),
            configs: { readChain: vi.fn(async () => [document({ credentials })]) },
            feeds: fakeFeeds(),
        });

        await expect(registry.lookupConfigCredential(privateFeed.url)).resolves.toBeUndefined();
        await registry.forDirectory(path.resolve('/w'));
        await expect(registry.lookupConfigCredential(`${privateFeed.url}/`)).resolves.toMatchObject({ username: 'ci', password: 'secret', passwordKind: 'clear', sourceName: 'private' });
        await expect(registry.lookupConfigCredential('https://other.example/v3/index.json')).resolves.toBeUndefined();
    });

    it('clear resets every icon resolver and forgets the chains', async () => {
        const a = path.resolve('/a');
        const b = path.resolve('/b');
        const contexts = contextsWith({ [a]: ['/a/nuget.config'], [b]: ['/b/nuget.config'] });
        const feeds = fakeFeeds();
        const registry = new FeedContexts({ contexts, sources: sourcesOf([privateFeed]), configs: { readChain: vi.fn(async () => []) }, feeds });
        await registry.forDirectory(a);
        await registry.forDirectory(b);

        registry.clear();

        expect(feeds.built.map(clients => (clients.icons.reset as ReturnType<typeof vi.fn>).mock.calls.length)).toEqual([1, 1]);
        await registry.forDirectory(a);
        expect(contexts.configFilesFor).toHaveBeenCalledTimes(3);
        expect(feeds.forPolicy).toHaveBeenCalledTimes(3);
    });

    it('the search enricher never consults the vulnerability data and the installed enricher does', async () => {
        const transport = new FakeTransport(request => (request.url.includes('/vulnerability/') ? json([]) : json({ data: [] })));
        const runner = { run: vi.fn(), sdkVersion: vi.fn(), clearSdkCache: vi.fn() } as unknown as DotnetRunner;
        const serviceIndex = { clearCaches: vi.fn() } as unknown as ServiceIndexClient;
        const store = new Map<string, unknown>();
        const feeds = createFeedClients({
            transport,
            runner,
            serviceIndex,
            credentials: { getAuthHeader: vi.fn(async () => undefined), prewarm: vi.fn(), clear: vi.fn() },
            cache: { get: <T>(key: string) => store.get(key) as T | undefined, set: (key: string, value: unknown) => void store.set(key, value) },
            globalPackagesFolder: async () => undefined,
        });
        const clients = feeds.forPolicy(new DefaultOutboundPolicy());
        const resolved: ResolvedSource[] = [{ source: privateFeed, endpoints: { searchQueryService: 'https://feed.example/query', vulnerabilityInfoUrl: 'https://feed.example/vulnerability/index.json' } }];

        await clients.searchEnricher.enrich(resolved, [{ id: 'Lib', version: '1.0.0' }]);
        expect(transport.urls().filter(url => url.includes('/vulnerability/'))).toEqual([]);

        const [entry] = await clients.enricher.enrich(resolved, [{ id: 'Lib', version: '1.0.0' }]);
        expect(transport.urls().filter(url => url.includes('/vulnerability/'))).toEqual(['https://feed.example/vulnerability/index.json']);
        expect(entry.vulnerabilities).toEqual([]);
    });
});
