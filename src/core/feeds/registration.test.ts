import { describe, expect, it, vi } from 'vitest';
import type { OutboundPolicy, TransportResult } from '../contracts';
import { DefaultRegistrationClient, registrationToMetadata } from './registration';
import { FakeTransport, fail, json, silentLogger } from './testSupport';
import type { FlatContainerClient, ResolvedSource, SearchByIdClient, SearchByIdFetch, ServiceEndpoints } from './types';

const BASE = 'https://feed.example/v3/registration';
const allowAll: OutboundPolicy = { allowedSourcesFor: (_id, candidates) => candidates };

function source(endpoints: ServiceEndpoints = { registrationsBaseUrl: `${BASE}/` }, authHeader?: string): ResolvedSource {
    return { source: { name: 'feed', url: 'https://feed.example/v3/index.json', enabled: true }, endpoints, authHeader };
}

function searchBy(fetched: SearchByIdFetch): SearchByIdClient & { searchById: ReturnType<typeof vi.fn> } {
    return { searchById: vi.fn(async () => fetched) };
}

function flatWith(index: string[] | undefined): FlatContainerClient & { versionIndex: ReturnType<typeof vi.fn> } {
    return {
        versionIndex: vi.fn(async () => index),
        nuspec: vi.fn(),
        packageSize: vi.fn(),
        downloadPackage: vi.fn(),
        icon: vi.fn(),
    } as unknown as FlatContainerClient & { versionIndex: ReturnType<typeof vi.fn> };
}

function client(transport: FakeTransport, search = searchBy({ kind: 'missing' }), flat = flatWith([]), policy: OutboundPolicy = allowAll): DefaultRegistrationClient {
    return new DefaultRegistrationClient({ transport, policy, logger: silentLogger }, search, flat);
}

const noNetwork = new FakeTransport(() => fail('network'));
const found = (versions: string[], version = versions[0] ?? '1.0.0'): SearchByIdFetch => ({
    kind: 'found',
    result: { id: 'Contoso.Lib', version, versions, description: '', authors: '' },
});

/** A registration index with one inline page and one page behind a URL, one catalog entry behind a URL, and unlisted leaves. */
function registrationFeed(overrides: Record<string, () => ReturnType<typeof json>> = {}): FakeTransport {
    const routes: Record<string, () => ReturnType<typeof json>> = {
        [`${BASE}/contoso.lib/index.json`]: () => json({
            items: [
                {
                    '@id': `${BASE}/contoso.lib/index.json#page/1.0.0/2.0.0`,
                    items: [
                        { catalogEntry: { id: 'Contoso.Lib', version: '1.0.0', listed: true } },
                        { listed: false, catalogEntry: { id: 'Contoso.Lib', version: '1.5.0' } },
                        { catalogEntry: { id: 'Contoso.Lib', version: '2.0.0-beta', listed: true } },
                    ],
                },
                { '@id': `${BASE}/contoso.lib/page/3.0.0/4.0.0.json`, lower: '3.0.0', upper: '4.0.0' },
            ],
        }),
        [`${BASE}/contoso.lib/page/3.0.0/4.0.0.json`]: () => json({
            items: [
                { catalogEntry: { id: 'Contoso.Lib', version: '3.0.0', listed: false } },
                { catalogEntry: 'https://feed.example/catalog/contoso.lib.4.0.0.json' },
            ],
        }),
        'https://feed.example/catalog/contoso.lib.4.0.0.json': () => json({ id: 'Contoso.Lib', version: '4.0.0', description: 'Four' }),
        ...overrides,
    };
    return new FakeTransport(request => (routes[request.url] ?? (() => fail('http-error', 404)))());
}

describe('DefaultRegistrationClient.versions', () => {
    it('reads listed-only versions from searchById, newest first and without prereleases unless asked', async () => {
        const search = searchBy(found(['1.0.0', '2.0.0-beta', '1.10.0', '1.0']));
        const signal = new AbortController().signal;

        await expect(client(noNetwork, search).versions(source({ searchQueryService: 'https://feed.example/query' }), 'Contoso.Lib', { includePrerelease: false, listedOnly: true, signal }))
            .resolves.toEqual(['1.10.0', '1.0.0']);
        await expect(client(noNetwork, search).versions(source({ searchQueryService: 'https://feed.example/query' }), 'Contoso.Lib', { includePrerelease: true, listedOnly: true }))
            .resolves.toEqual(['2.0.0-beta', '1.10.0', '1.0.0']);
        expect(search.searchById).toHaveBeenNthCalledWith(1, expect.objectContaining({ endpoints: { searchQueryService: 'https://feed.example/query' } }), 'Contoso.Lib', false, signal);

        await expect(client(noNetwork, searchBy(found([], '3.1.0'))).versions(source({ searchQueryService: 'q' }), 'Contoso.Lib', { includePrerelease: false, listedOnly: true }))
            .resolves.toEqual(['3.1.0']);
    });

    it('answers [] for a package the search service does not have and undefined when it failed', async () => {
        const withSearch = source({ searchQueryService: 'https://feed.example/query', registrationsBaseUrl: BASE });

        await expect(client(noNetwork, searchBy({ kind: 'missing' })).versions(withSearch, 'Contoso.Lib', { includePrerelease: false, listedOnly: true })).resolves.toEqual([]);
        await expect(client(noNetwork, searchBy({ kind: 'failed', reason: 'timeout' })).versions(withSearch, 'Contoso.Lib', { includePrerelease: false, listedOnly: true })).resolves.toBeUndefined();
        expect(noNetwork.urls()).toEqual([]);
    });

    it('reads listed-only versions from the registration index when the source has no search service', async () => {
        const transport = registrationFeed();

        const versions = await client(transport).versions(source(), 'Contoso.Lib', { includePrerelease: true, listedOnly: true });

        expect(versions).toEqual(['4.0.0', '2.0.0-beta', '1.0.0']);
        expect(transport.urls()).toEqual(expect.arrayContaining([
            `${BASE}/contoso.lib/index.json`,
            `${BASE}/contoso.lib/page/3.0.0/4.0.0.json`,
            'https://feed.example/catalog/contoso.lib.4.0.0.json',
        ]));
        await expect(client(registrationFeed()).versions(source(), 'Contoso.Lib', { includePrerelease: false, listedOnly: true })).resolves.toEqual(['4.0.0', '1.0.0']);
    });

    it('answers [] for an unknown package and undefined when any part of the registration index fails', async () => {
        await expect(client(registrationFeed()).versions(source(), 'Unknown.Package', { includePrerelease: false, listedOnly: true })).resolves.toEqual([]);

        const failures: Array<Record<string, () => TransportResult>> = [
            { [`${BASE}/contoso.lib/index.json`]: () => fail('timeout') },
            { [`${BASE}/contoso.lib/index.json`]: () => json({ items: 'not a list' }) },
            { [`${BASE}/contoso.lib/page/3.0.0/4.0.0.json`]: () => fail('http-error', 500) },
            { 'https://feed.example/catalog/contoso.lib.4.0.0.json': () => fail('network') },
        ];
        for (const overrides of failures) {
            await expect(client(registrationFeed(overrides)).versions(source(), 'Contoso.Lib', { includePrerelease: false, listedOnly: true })).resolves.toBeUndefined();
        }
        await expect(client(noNetwork).versions(source({}), 'Contoso.Lib', { includePrerelease: false, listedOnly: true })).resolves.toBeUndefined();
    });

    it('reads every version, unlisted included, from the flat-container index when listedOnly is false', async () => {
        const flat = flatWith(['1.0', '1.0.0', '1.5.0', '2.0.0-rc.1', 'not-a-version']);
        const search = searchBy(found(['9.9.9']));
        const signal = new AbortController().signal;

        await expect(client(noNetwork, search, flat).versions(source({ searchQueryService: 'q' }), 'Contoso.Lib', { includePrerelease: false, listedOnly: false, signal }))
            .resolves.toEqual(['1.5.0', '1.0']);
        await expect(client(noNetwork, search, flat).versions(source(), 'Contoso.Lib', { includePrerelease: true, listedOnly: false }))
            .resolves.toEqual(['2.0.0-rc.1', '1.5.0', '1.0']);
        expect(flat.versionIndex).toHaveBeenCalledWith(expect.anything(), 'Contoso.Lib', signal);
        expect(search.searchById).not.toHaveBeenCalled();

        await expect(client(noNetwork, search, flatWith(undefined)).versions(source(), 'Contoso.Lib', { includePrerelease: false, listedOnly: false })).resolves.toBeUndefined();
        await expect(client(noNetwork, search, flatWith([])).versions(source(), 'Contoso.Lib', { includePrerelease: false, listedOnly: false })).resolves.toEqual([]);
    });

    it('asks nothing of a source the policy does not allow for the id', async () => {
        const refuse: OutboundPolicy = { allowedSourcesFor: () => [] };
        const transport = registrationFeed();
        const search = searchBy(found(['1.0.0']));
        const flat = flatWith(['1.0.0']);
        const refusing = client(transport, search, flat, refuse);

        await expect(refusing.versions(source({ searchQueryService: 'q' }), 'Contoso.Lib', { includePrerelease: false, listedOnly: true })).resolves.toEqual([]);
        await expect(refusing.versions(source(), 'Contoso.Lib', { includePrerelease: false, listedOnly: false })).resolves.toEqual([]);
        await expect(refusing.metadata(source(), 'Contoso.Lib', '1.0.0')).resolves.toBeUndefined();

        expect(search.searchById).not.toHaveBeenCalled();
        expect(flat.versionIndex).not.toHaveBeenCalled();
        expect(transport.urls()).toEqual([]);
    });
});

describe('DefaultRegistrationClient.metadata', () => {
    it('reads the registration leaf and its catalog entry, with the source credential', async () => {
        const transport = new FakeTransport(request => {
            if (request.url === `${BASE}/contoso.lib/1.0.0.json`) {
                return json({ '@id': request.url, catalogEntry: 'https://feed.example/catalog/contoso.lib.1.0.0.json', listed: true });
            }
            if (request.url === 'https://feed.example/catalog/contoso.lib.1.0.0.json') {
                return json({
                    id: 'Contoso.Lib',
                    version: '1.0.0',
                    summary: 'A summary',
                    authors: ['Ada', ' Grace '],
                    licenseExpression: 'MIT',
                    licenseUrl: 'https://licenses.example/MIT',
                    projectUrl: 'https://contoso.example',
                    published: '2026-01-02T03:04:05Z',
                    dependencyGroups: [
                        { targetFramework: 'net8.0', dependencies: [{ id: 'A', range: '[1.0.0, )' }, { id: 'B', version: '2.0.0' }, { id: 'C' }, { range: '1.0' }] },
                        { dependencies: [] },
                    ],
                });
            }
            return fail('http-error', 404);
        });

        const metadata = await client(transport).metadata(source(undefined, 'Basic abc'), 'Contoso.Lib', '1.0');

        expect(metadata).toEqual({
            id: 'Contoso.Lib',
            version: '1.0.0',
            description: 'A summary',
            authors: 'Ada, Grace',
            license: 'MIT',
            licenseUrl: 'https://licenses.example/MIT',
            projectUrl: 'https://contoso.example',
            published: '2026-01-02T03:04:05Z',
            dependencies: [
                { targetFramework: 'net8.0', dependencies: [{ id: 'A', versionRange: '[1.0.0, )' }, { id: 'B', versionRange: '2.0.0' }, { id: 'C', versionRange: '*' }] },
                { targetFramework: 'Any', dependencies: [] },
            ],
            sourceUrl: 'https://feed.example/v3/index.json',
        });
        expect(transport.urls()).toEqual([`${BASE}/contoso.lib/1.0.0.json`, 'https://feed.example/catalog/contoso.lib.1.0.0.json']);
        expect(transport.requests.every(request => request.headers?.Authorization === 'Basic abc')).toBe(true);
    });

    it('falls back to the registration index when there is no leaf and matches the version by its normalized form', async () => {
        const transport = registrationFeed();

        await expect(client(transport).metadata(source(), 'Contoso.Lib', '4.0')).resolves.toMatchObject({ id: 'Contoso.Lib', version: '4.0.0', description: 'Four' });
        await expect(client(transport).metadata(source(), 'Contoso.Lib', '1.5.0')).resolves.toMatchObject({ version: '1.5.0', description: '' });
        await expect(client(transport).metadata(source(), 'Contoso.Lib', '9.0.0')).resolves.toBeUndefined();
        await expect(client(transport).metadata(source({ searchQueryService: 'q' }), 'Contoso.Lib', '1.0.0')).resolves.toBeUndefined();
        await expect(client(registrationFeed({ [`${BASE}/contoso.lib/index.json`]: () => fail('timeout') })).metadata(source(), 'Contoso.Lib', '1.0.0')).resolves.toBeUndefined();
    });

    it('answers undefined for a leaf whose catalog entry cannot be read and maps nothing without an id or version', async () => {
        const transport = new FakeTransport(request => request.url.endsWith('/1.0.0.json')
            ? json({ catalogEntry: 'https://feed.example/catalog/missing.json' })
            : fail('network'));

        await expect(client(transport).metadata(source(), 'Contoso.Lib', '1.0.0')).resolves.toBeUndefined();
        expect(registrationToMetadata({ version: '1.0.0' }, 'https://feed.example')).toBeUndefined();
        expect(registrationToMetadata({ id: 'X' }, 'https://feed.example')).toBeUndefined();
        expect(registrationToMetadata({ id: 'X', version: '1.0.0', dependencyGroups: 'nope' as never }, 'https://feed.example')).toEqual({
            id: 'X', version: '1.0.0', description: '', authors: '', dependencies: [], sourceUrl: 'https://feed.example',
        });
    });
});
