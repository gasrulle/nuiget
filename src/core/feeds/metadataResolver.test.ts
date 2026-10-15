import { describe, expect, it, vi } from 'vitest';
import type { DotnetRunner, OutboundPolicy, TransportResult } from '../contracts';
import type { PackageMetadata } from '../../protocol/domain';
import { DefaultOutboundPolicy } from '../sources/DefaultOutboundPolicy';
import { DefaultFlatContainerClient } from './flatContainer';
import { DefaultMetadataResolver, searchResultToMetadata } from './metadataResolver';
import { DefaultRegistrationClient } from './registration';
import { DefaultSearchClient } from './search';
import { FakeTransport, fail, json, ok, silentLogger } from './testSupport';
import type { RegistrationClient, ResolvedSource } from './types';

const allowAll: OutboundPolicy = { allowedSourcesFor: (_id, candidates) => candidates };
const idleRunner: DotnetRunner = { run: vi.fn(), sdkVersion: vi.fn(), clearSdkCache: vi.fn() };

function source(name: string): ResolvedSource {
    const base = `https://${name}.example`;
    return {
        source: { name, url: `${base}/v3/index.json`, enabled: true },
        endpoints: { registrationsBaseUrl: `${base}/reg/`, packageBaseAddress: `${base}/flat/`, searchQueryService: `${base}/query` },
    };
}

const NUSPEC = '<package><metadata><id>Contoso.Lib</id><version>1.0.0</version><description>From the nuspec</description><authors>Nuspec Author</authors></metadata></package>';

function leaf(description: string): TransportResult {
    return json({ catalogEntry: { id: 'Contoso.Lib', version: '1.0.0', description, authors: 'Someone' } });
}

type OfflineFn = (packageId: string, version: string) => Promise<PackageMetadata | undefined>;
type ReadmeFn = (sources: ResolvedSource[], packageId: string, version: string, signal?: AbortSignal) => Promise<string | undefined>;

function resolver(transport: FakeTransport, policy: OutboundPolicy = allowAll, offline: OfflineFn = async () => undefined, readme: ReadmeFn = async () => undefined, registration?: RegistrationClient): DefaultMetadataResolver {
    const deps = { transport, policy, logger: silentLogger };
    const flat = new DefaultFlatContainerClient(deps);
    const search = new DefaultSearchClient({ ...deps, runner: idleRunner });
    return new DefaultMetadataResolver(deps, {
        registration: registration ?? new DefaultRegistrationClient(deps, search, flat),
        flat,
        search,
        readme: { extract: readme },
        offline: { metadata: offline },
    });
}

describe('DefaultMetadataResolver.metadata', () => {
    it('tries registration, then the flat-container nuspec, then the search service of one source before the next source', async () => {
        const answers: Record<string, () => TransportResult> = {
            'https://b.example/reg/contoso.lib/1.0.0.json': () => leaf('From B'),
        };
        const transport = new FakeTransport(request => (answers[request.url] ?? (() => (request.url.startsWith('https://a.example/query') ? json({ data: [] }) : fail('http-error', 404))))());

        const metadata = await resolver(transport).metadata([source('a'), source('b')], 'Contoso.Lib', '1.0.0');

        expect(metadata).toMatchObject({ description: 'From B', sourceUrl: 'https://b.example/v3/index.json' });
        expect(transport.urls().map(url => url.replace(/\?.*$/, ''))).toEqual([
            'https://a.example/reg/contoso.lib/1.0.0.json',
            'https://a.example/reg/contoso.lib/index.json',
            'https://a.example/flat/contoso.lib/1.0.0/contoso.lib.nuspec',
            'https://a.example/query',
            'https://b.example/reg/contoso.lib/1.0.0.json',
        ]);

        const nuspecOnly = new FakeTransport(request => (request.url.endsWith('.nuspec') ? ok(NUSPEC) : fail('http-error', 404)));
        await expect(resolver(nuspecOnly).metadata([source('a')], 'Contoso.Lib', '1.0.0')).resolves.toMatchObject({ description: 'From the nuspec', authors: 'Nuspec Author', sourceUrl: 'https://a.example/v3/index.json' });

        const searchOnly = new FakeTransport(request => (request.url.startsWith('https://a.example/query')
            ? json({ data: [{ id: 'Contoso.Lib', version: '2.0.0', description: 'From search', authors: ['Ada'], totalDownloads: 7 }] })
            : fail('http-error', 404)));
        await expect(resolver(searchOnly).metadata([source('a')], 'Contoso.Lib', '1.0.0')).resolves.toEqual({
            id: 'Contoso.Lib', version: '1.0.0', description: 'From search', authors: 'Ada', totalDownloads: 7, dependencies: [], sourceUrl: 'https://a.example/v3/index.json',
        });
    });

    it('metadata for the same id and version from two sources never bleeds across sources (F6)', async () => {
        const transport = new FakeTransport(request => {
            if (request.url === 'https://a.example/reg/contoso.lib/1.0.0.json') {
                return leaf('From A');
            }
            if (request.url === 'https://b.example/reg/contoso.lib/1.0.0.json') {
                return leaf('From B');
            }
            return fail('http-error', 404);
        });
        const shared = resolver(transport);

        await expect(shared.metadata([source('a'), source('b')], 'Contoso.Lib', '1.0.0')).resolves.toMatchObject({ description: 'From A', sourceUrl: 'https://a.example/v3/index.json' });
        await expect(shared.metadata([source('b')], 'Contoso.Lib', '1.0.0')).resolves.toMatchObject({ description: 'From B', sourceUrl: 'https://b.example/v3/index.json' });

        const before = transport.urls().length;
        const mapped = resolver(transport, new DefaultOutboundPolicy(new Map([['b', ['Contoso.*']]])));
        await expect(mapped.metadata([source('a'), source('b')], 'Contoso.Lib', '1.0.0')).resolves.toMatchObject({ description: 'From B', sourceUrl: 'https://b.example/v3/index.json' });
        expect(transport.urls().slice(before).filter(url => url.startsWith('https://a.example'))).toEqual([]);
    });

    it('never sends the nuspec or size request to a source the policy refuses', async () => {
        const transport = new FakeTransport(request => (request.url.startsWith('https://b.example/flat/') ? ok(NUSPEC) : fail('http-error', 404)));
        const onlyB: OutboundPolicy = { allowedSourcesFor: (_id, candidates) => candidates.filter(candidate => candidate.name === 'b') };

        await expect(resolver(transport, onlyB).metadata([source('a'), source('b')], 'Contoso.Lib', '1.0.0')).resolves.toMatchObject({ sourceUrl: 'https://b.example/v3/index.json' });

        expect(transport.urls().filter(url => url.startsWith('https://a.example'))).toEqual([]);
        expect(transport.requests.filter(request => request.method === 'HEAD')).toEqual([]);
    });

    it('falls back to the offline nuspec when no allowed source produced metadata, also when none is allowed, and marks it offline', async () => {
        const offlineAnswer = { id: 'Contoso.Lib', version: '1.0.0', description: 'Restored', authors: '', dependencies: [], offline: true };
        const offline = vi.fn(async () => offlineAnswer);
        const unknown = new FakeTransport(request => (request.url.startsWith('https://a.example/query') ? json({ data: [] }) : fail('http-error', 404)));

        await expect(resolver(unknown, allowAll, offline).metadata([source('a')], 'Contoso.Lib', '1.0.0')).resolves.toEqual(offlineAnswer);
        await expect(resolver(unknown, allowAll, offline).metadata([], 'Contoso.Lib', '1.0.0')).resolves.toEqual(offlineAnswer);
        const refuseAll: OutboundPolicy = { allowedSourcesFor: () => [] };
        const before = unknown.urls().length;
        await expect(resolver(unknown, refuseAll, offline).metadata([source('a')], 'Contoso.Lib', '1.0.0')).resolves.toEqual(offlineAnswer);
        expect(unknown.urls()).toHaveLength(before);
        expect(offline).toHaveBeenCalledTimes(3);
        expect(offline).toHaveBeenCalledWith('Contoso.Lib', '1.0.0');

        const down = new FakeTransport(() => fail('network'));
        await expect(resolver(down, allowAll, vi.fn(async () => undefined)).metadata([source('a')], 'Contoso.Lib', '1.0.0')).resolves.toBeUndefined();
    });

    it('maps a search row to metadata for the asked version', () => {
        expect(searchResultToMetadata({ id: 'X', version: '9.0.0', versions: [], description: 'd', authors: 'a' }, '1.0.0')).toEqual({ id: 'X', version: '1.0.0', description: 'd', authors: 'a', dependencies: [] });
    });
});

describe('DefaultMetadataResolver.versions and readme', () => {
    it('versions unions the allowed sources, deduplicates by normalized version, sorts descending and flags an allowed source that failed', async () => {
        const answers: Record<string, string[] | undefined> = { a: ['2.0.0', '1.0'], b: ['3.0.0-beta', '1.0.0'], c: undefined };
        const registration: RegistrationClient = { versions: vi.fn(async (src: ResolvedSource) => answers[src.source.name]), metadata: vi.fn() };
        const options = { includePrerelease: true, listedOnly: true };
        const notC: OutboundPolicy = { allowedSourcesFor: (_id, candidates) => candidates.filter(candidate => candidate.name !== 'c') };
        const transport = new FakeTransport(() => fail('network'));

        await expect(resolver(transport, allowAll, undefined, undefined, registration).versions([source('a'), source('b'), source('c')], 'Lib', options))
            .resolves.toEqual({ versions: ['3.0.0-beta', '2.0.0', '1.0'], sourcesUnavailable: true });
        await expect(resolver(transport, notC, undefined, undefined, registration).versions([source('a'), source('b'), source('c')], 'Lib', options))
            .resolves.toEqual({ versions: ['3.0.0-beta', '2.0.0', '1.0'], sourcesUnavailable: false });
        await expect(resolver(transport, { allowedSourcesFor: () => [] }, undefined, undefined, registration).versions([source('a')], 'Lib', options))
            .resolves.toEqual({ versions: [], sourcesUnavailable: false });
        expect(registration.versions).toHaveBeenCalledWith(expect.anything(), 'Lib', options);
    });

    it('readme reads only the allowed sources', async () => {
        const readme = vi.fn(async () => '# Readme');
        const onlyB: OutboundPolicy = { allowedSourcesFor: (_id, candidates) => candidates.filter(candidate => candidate.name === 'b') };
        const signal = new AbortController().signal;

        await expect(resolver(new FakeTransport(() => fail('network')), onlyB, undefined, readme).readme([source('a'), source('b')], 'Contoso.Lib', '1.0.0', signal)).resolves.toBe('# Readme');

        expect(readme).toHaveBeenCalledWith([source('b')], 'Contoso.Lib', '1.0.0', signal);
    });
});
