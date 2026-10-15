import { describe, expect, it, vi } from 'vitest';
import type { DotnetRunner, OutboundPolicy, TransportResult } from '../contracts';
import type { NuGetSource } from '../../protocol/domain';
import { DefaultOutboundPolicy } from '../sources/DefaultOutboundPolicy';
import { DefaultMetadataEnricher } from './enricher';
import { DefaultFlatContainerClient } from './flatContainer';
import { DefaultIconResolver, MemoryIconCache } from './icons';
import { DefaultMetadataResolver } from './metadataResolver';
import { OfflineMetadataReader } from './offline';
import { ReadmeExtractor } from './readme';
import { DefaultRegistrationClient } from './registration';
import { DefaultSearchClient } from './search';
import { FakeTransport, json, ok, silentLogger } from './testSupport';
import type { ResolvedSource } from './types';
import { DefaultUpdateChecker } from './updates';
import { DefaultVulnerabilityClient } from './vulnerability';

const ID = 'Contoso.Lib';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

function resolved(name: string, base: string): ResolvedSource {
    return {
        source: { name, url: `${base}/v3/index.json`, enabled: true },
        endpoints: {
            searchQueryService: `${base}/query`,
            searchAutocompleteService: `${base}/autocomplete`,
            registrationsBaseUrl: `${base}/registration/`,
            packageBaseAddress: `${base}/flat/`,
            vulnerabilityInfoUrl: `${base}/vulnerability/index.json`,
        },
    };
}

const NUGET_ORG = resolved('nuget.org', 'https://api.nuget.org');
const PRIVATE = resolved('private feed', 'https://feed.example');
const LOCAL: NuGetSource = { name: 'local', url: '/feeds/local', enabled: true, isLocal: true };
const NUGET_ORG_CLI: NuGetSource = NUGET_ORG.source;

/** Answers every feed URL plausibly, so that a request that should not have been sent succeeds and is recorded. */
function answering(): FakeTransport {
    return new FakeTransport(request => {
        const url = new URL(request.url);
        const entry = { id: ID, version: '2.0.0', versions: [{ version: '1.0.0' }, { version: '2.0.0' }], description: 'Contoso', authors: ['Ada'] };
        const routes: Array<[RegExp, () => TransportResult]> = [
            [/\/query$/, () => json({ data: [entry] })],
            [/\/autocomplete$/, () => json({ data: [ID] })],
            [/\/registration\/.+\/index\.json$/, () => json({ items: [{ items: [{ catalogEntry: { id: ID, version: '2.0.0' } }] }] })],
            [/\/registration\/.+\.json$/, () => json({ catalogEntry: { id: ID, version: '1.0.0', description: 'Contoso' } })],
            [/\/flat\/.+\/index\.json$/, () => json({ versions: ['1.0.0', '2.0.0'] })],
            [/\/flat\/.+\.nuspec$/, () => ok(`<package><metadata><id>${ID}</id><version>1.0.0</version></metadata></package>`)],
            [/\/flat\/.+\/icon$/, () => ok(PNG, { 'content-type': 'image/png' })],
            [/\/flat\/.+\.nupkg$/, () => ok('not a zip')],
            [/\/vulnerability\/index\.json$/, () => json([])],
        ];
        const route = routes.find(([pattern]) => pattern.test(url.pathname));
        return route ? route[1]() : json({});
    });
}

function recordingRunner(): DotnetRunner & { argv: string[][] } {
    const argv: string[][] = [];
    return {
        argv,
        run: vi.fn(async (args: string[]) => {
            argv.push(args);
            return { exitCode: 0, stdout: JSON.stringify({ version: 2, problems: [], searchResult: [] }), stderr: '', durationMs: 1, argv: args };
        }),
        sdkVersion: vi.fn(async () => undefined),
        clearSdkCache: vi.fn(),
    };
}

/** Every entry point of the feed clients, with the sources and CLI fallback sources a project would hand in. */
async function exercise(policy: OutboundPolicy, sources: ResolvedSource[], cliSources: NuGetSource[]): Promise<{ transport: FakeTransport; runner: ReturnType<typeof recordingRunner> }> {
    const transport = answering();
    const runner = recordingRunner();
    const deps = { transport, policy, runner, logger: silentLogger };
    const flat = new DefaultFlatContainerClient(deps);
    const search = new DefaultSearchClient(deps);
    const registration = new DefaultRegistrationClient(deps, search, flat);
    const icons = new DefaultIconResolver(flat, new MemoryIconCache(), policy);
    const vulnerabilities = new DefaultVulnerabilityClient(deps);
    const resolver = new DefaultMetadataResolver(deps, {
        registration,
        flat,
        search,
        readme: new ReadmeExtractor(transport, flat, { logger: silentLogger }),
        offline: new OfflineMetadataReader({ globalPackagesFolder: async () => undefined, logger: silentLogger }),
    });
    const enricher = new DefaultMetadataEnricher(deps, search, icons, vulnerabilities);
    const updates = new DefaultUpdateChecker(deps, registration);

    await updates.check(sources, [{ id: ID, version: '1.0.0', versionType: 'standard', declaration: 'project' }], false);
    await enricher.enrich(sources, [{ id: ID, version: '1.0.0' }]);
    await resolver.metadata(sources, ID, '1.0.0');
    await resolver.versions(sources, ID, { includePrerelease: false, listedOnly: false });
    await resolver.readme(sources, ID, '1.0.0');
    await icons.icon(sources, ID, '3.0.0');
    await search.search(sources, cliSources, { query: 'contoso', includePrerelease: false, take: 10 }, '/work/app');
    await search.search(sources, cliSources, { query: ID, includePrerelease: false, take: 10, exactMatch: true }, '/work/app');
    await search.quickSearch(sources, 'contoso', false, 5);
    for (const source of sources) {
        await search.searchById(source, ID, false);
        await search.lookup(source, ID);
        await registration.versions(source, ID, { includePrerelease: false, listedOnly: true });
        await registration.versions(source, ID, { includePrerelease: false, listedOnly: false });
        await registration.metadata(source, ID, '1.0.0');
    }
    await vulnerabilities.forPackage(sources, ID, '1.0.0');
    return { transport, runner };
}

function isNuGetOrgHost(url: string): boolean {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'nuget.org' || host.endsWith('.nuget.org');
}

function carriesId(url: string): boolean {
    const parsed = new URL(url);
    return decodeURIComponent(`${parsed.pathname}?${parsed.search}`).toLowerCase().includes(ID.toLowerCase());
}

describe('outbound policy across the feed clients', () => {
    it('private-only configuration never contacts nuget.org', async () => {
        const { transport, runner } = await exercise(new DefaultOutboundPolicy(), [PRIVATE], [LOCAL]);

        expect(transport.requests.length).toBeGreaterThan(0);
        expect(transport.urls().filter(url => new URL(url).hostname !== 'feed.example')).toEqual([]);
        expect(transport.urls().filter(isNuGetOrgHost)).toEqual([]);
        expect(runner.argv.length).toBeGreaterThan(0);
        expect(runner.argv.flat().filter(arg => arg.toLowerCase().includes('nuget.org'))).toEqual([]);
    });

    it('never puts a package id into a request to nuget.org when the mapping sends every id to the private feed (M2, ADR-005)', async () => {
        const policy = new DefaultOutboundPolicy(new Map([['private feed', ['*']]]));

        const { transport, runner } = await exercise(policy, [NUGET_ORG, PRIVATE], [NUGET_ORG_CLI, LOCAL]);

        expect(transport.urls().filter(url => isNuGetOrgHost(url) && carriesId(url))).toEqual([]);
        expect(transport.urls().filter(url => new URL(url).hostname === 'feed.example' && carriesId(url)).length).toBeGreaterThan(5);
        const exactRuns = runner.argv.filter(args => args.includes('--exact-match'));
        expect(exactRuns.flat().filter(arg => arg.toLowerCase().includes('nuget.org'))).toEqual([]);
    });
});
