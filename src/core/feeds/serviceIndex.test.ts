import { readFileSync } from 'fs';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { NuGetSource } from '../../protocol/domain';
import { DefaultServiceIndexClient, hasUsableEndpoint, selectEndpoints, serviceIndexUrl } from './serviceIndex';
import { FakeTransport, fail, json, silentLogger } from './testSupport';

const fixture = (name: string): unknown => JSON.parse(readFileSync(path.join(__dirname, '__fixtures__', name), 'utf8'));
const NUGET_ORG = fixture('nuget-org-service-index.json');
const PRIVATE = fixture('private-feed-service-index.json');
const source = (url: string, changes: Partial<NuGetSource> = {}): NuGetSource => ({ name: url, url, enabled: true, isLocal: false, ...changes } as NuGetSource);

function client(handler: ConstructorParameters<typeof FakeTransport>[0], options: ConstructorParameters<typeof DefaultServiceIndexClient>[1] = {}, getAuthHeader: (sourceUrl: string) => Promise<string | undefined> = async () => undefined) {
    const transport = new FakeTransport(handler);
    return { transport, client: new DefaultServiceIndexClient({ transport, getAuthHeader, logger: silentLogger as never }, options) };
}

describe('service index endpoints', () => {
    it("selects nuget.org's endpoints from its real service index (tracked fixture)", () => {
        expect(selectEndpoints(NUGET_ORG)).toEqual({
            packageBaseAddress: 'https://api.nuget.org/v3-flatcontainer/',
            registrationsBaseUrl: 'https://api.nuget.org/v3/registration5-semver1/',
            searchQueryService: 'https://azuresearch-usnc.nuget.org/query',
            searchAutocompleteService: 'https://azuresearch-usnc.nuget.org/autocomplete',
            vulnerabilityInfoUrl: 'https://api.nuget.org/v3/vulnerabilities/index.json',
            readmeUriTemplate: 'https://api.nuget.org/v3-flatcontainer/{lower_id}/{lower_version}/readme',
        });
    });

    it('selects versionless types of a private feed and never the gzip registration hive', () => {
        expect(selectEndpoints(PRIVATE)).toEqual({
            packageBaseAddress: 'https://feed.example/nuget/v3/flatcontainer/',
            registrationsBaseUrl: 'https://feed.example/nuget/v3/registration/',
            searchQueryService: 'https://feed.example/nuget/v3/search',
            searchAutocompleteService: 'https://feed.example/nuget/v3/autocomplete',
        });
    });

    it('a document that is no V3 index has no endpoints, and a lone autocomplete is not usable', () => {
        expect(selectEndpoints({ version: '2.0.0' })).toEqual({});
        expect(selectEndpoints('<html>')).toEqual({});
        expect(hasUsableEndpoint({ searchAutocompleteService: 'x' })).toBe(false);
        expect(hasUsableEndpoint({ packageBaseAddress: 'x' })).toBe(true);
    });

    it('builds the index URL from a source URL', () => {
        expect(serviceIndexUrl('https://feed/v3/')).toBe('https://feed/v3/index.json');
        expect(serviceIndexUrl(' https://api.nuget.org/v3/index.json ')).toBe('https://api.nuget.org/v3/index.json');
        expect(serviceIndexUrl('https://feed/v3/Index.JSON?x=1')).toBe('https://feed/v3/Index.JSON?x=1');
    });
});

describe('service index client', () => {
    it('discovers once for concurrent callers, caches the answer for its TTL, and sends the credential', async () => {
        let now = 0;
        const { transport, client: c } = client(() => json(PRIVATE), { now: () => now }, async () => 'Basic abc');
        const [a, b] = await Promise.all([c.endpoints('https://feed.example/nuget/v3/index.json'), c.endpoints('https://feed.example/nuget/v3/index.json')]);
        expect(a).toEqual(b);
        expect(transport.requests).toHaveLength(1);
        expect(transport.requests[0].headers).toEqual({ Authorization: 'Basic abc' });
        now = 9 * 60_000;
        await c.endpoints('https://feed.example/nuget/v3/index.json');
        expect(transport.requests).toHaveLength(1);
        now = 11 * 60_000;
        await c.endpoints('https://feed.example/nuget/v3/index.json');
        expect(transport.requests).toHaveLength(2);
    });

    it('a failure marks the source unhealthy for the failure TTL, and resolve leaves it out meanwhile', async () => {
        let now = 0;
        let down = true;
        const { transport, client: c } = client(() => (down ? fail('timeout') : json(NUGET_ORG)), { now: () => now, failureTtlMs: 120_000 });
        const nugetOrg = source('https://api.nuget.org/v3/index.json');
        expect(await c.resolve([nugetOrg])).toEqual([]);
        expect(c.health.failed()).toEqual([{ url: nugetOrg.url, error: 'timeout: timeout' }]);
        down = false;
        now = 60_000;
        expect(await c.resolve([nugetOrg])).toEqual([]);
        expect(transport.requests).toHaveLength(1);
        now = 121_000;
        const resolved = await c.resolve([nugetOrg]);
        expect(resolved.map(entry => entry.source.url)).toEqual([nugetOrg.url]);
        expect(c.health.failed()).toEqual([]);
    });

    it('a document that is no V3 index counts as a failure', async () => {
        const { client: c } = client(() => json({ version: '2.0.0' }));
        expect(await c.endpoints('https://feed.example/v2/')).toEqual({});
        expect(c.health.failed()[0].error).toMatch(/Not a NuGet V3 service index/);
    });

    it('a caller that cancels gets nothing and records no failure; another caller of the same discovery still gets the endpoints', async () => {
        let answer: (value: ReturnType<typeof json>) => void = () => undefined;
        const { transport, client: c } = client(() => new Promise(resolve => {
            answer = resolve;
        }));
        const controller = new AbortController();
        const first = c.endpoints('https://feed.example/nuget/v3/index.json', controller.signal);
        const second = c.endpoints('https://feed.example/nuget/v3/index.json');
        // The credential lookup comes first; answer once the request is out.
        await vi.waitFor(() => expect(transport.requests).toHaveLength(1));
        controller.abort();
        expect(await first).toEqual({});
        answer(json(PRIVATE));
        expect(hasUsableEndpoint(await second)).toBe(true);
        expect(transport.requests).toHaveLength(1);
        expect(transport.requests[0].signal).toBeUndefined();
        expect(c.health.failed()).toEqual([]);
        // An aborted signal is answered at once for a source not yet discovered; a cached answer is still returned.
        expect(await c.endpoints('https://other.example/v3/index.json', AbortSignal.abort())).toEqual({});
        expect(hasUsableEndpoint(await c.endpoints('https://feed.example/nuget/v3/index.json', AbortSignal.abort()))).toBe(true);
    });

    it('a caller whose signal is already aborted does not empty the discovery a caller joining it waits for', async () => {
        const { transport, client: c } = client(() => json(PRIVATE));
        const first = c.endpoints('https://feed.example/nuget/v3/index.json', AbortSignal.abort());
        const second = c.endpoints('https://feed.example/nuget/v3/index.json');
        expect(await first).toEqual({});
        expect(hasUsableEndpoint(await second)).toBe(true);
        expect(transport.requests).toHaveLength(1);
    });

    it('a cancelled transport answer (a disposed transport) is no failure of the source', async () => {
        const { client: c } = client(() => fail('cancelled'));
        expect(await c.endpoints('https://feed.example/nuget/v3/index.json')).toEqual({});
        expect(c.health.failed()).toEqual([]);
    });

    it('resolve leaves out local, disabled and endpoint-less sources and attaches the credential', async () => {
        const { client: c } = client(request => (request.url.includes('broken') ? json({ version: '3.0.0', resources: [] }) : json(PRIVATE)), {}, async (url: string) => (url.includes('feed.example') ? 'Bearer t' : undefined));
        const resolved = await c.resolve([
            source('https://feed.example/nuget/v3/index.json'),
            source('https://feed.example/disabled/index.json', { enabled: false }),
            source('/var/packages', { isLocal: true }),
            source('https://broken.example/v3/index.json'),
        ]);
        expect(resolved.map(entry => [entry.source.url, entry.authHeader])).toEqual([['https://feed.example/nuget/v3/index.json', 'Bearer t']]);
    });

    it('a credential provider that throws means no credential, not a failed source', async () => {
        const { transport, client: c } = client(() => json(PRIVATE), {}, async () => {
            throw new Error('provider missing');
        });
        expect(hasUsableEndpoint(await c.endpoints('https://feed.example/nuget/v3/index.json'))).toBe(true);
        expect(transport.requests[0].headers).toBeUndefined();
    });

    it('probe asks again past the caches; clearCaches forgets successes and failures', async () => {
        let down = false;
        const { transport, client: c } = client(() => (down ? fail('network') : json(PRIVATE)));
        const feed = source('https://feed.example/nuget/v3/index.json');
        await c.endpoints(feed.url);
        down = true;
        await c.probe([feed, source('/local', { isLocal: true })]);
        expect(transport.requests).toHaveLength(2);
        expect(c.health.isHealthy(feed.url)).toBe(false);
        c.clearCaches();
        expect(c.health.isHealthy(feed.url)).toBe(true);
        down = false;
        await c.endpoints(feed.url);
        expect(transport.requests).toHaveLength(3);
        // A file-system source is never asked.
        expect(await c.endpoints('C:\\packages')).toEqual({});
        expect(transport.requests).toHaveLength(3);
    });
});
