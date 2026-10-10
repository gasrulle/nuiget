/**
 * Integration tests for NuGetPackageService.
 *
 * Tests the search → version lookup → metadata enrichment → icon resolution
 * pipeline with mocked deps and real LRU caching.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NuGetPackageService, type PackageServiceDeps } from '../../services/NuGetPackageService';
import type { NuGetSource } from '../../services/NuGetTypes';

const MOCK_SEARCH_RESPONSE = {
    totalHits: 2,
    data: [
        { id: 'Newtonsoft.Json', version: '13.0.3', description: 'Popular JSON framework', authors: ['James Newton-King'], totalDownloads: 1000000, verified: true, iconUrl: 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/icon' },
        { id: 'Newtonsoft.Json.Bson', version: '1.0.3', description: 'BSON support', authors: ['James Newton-King'], totalDownloads: 500000, verified: false },
    ],
};

const MOCK_VERSIONS_RESPONSE = {
    versions: ['12.0.1', '12.0.2', '12.0.3', '13.0.1', '13.0.2', '13.0.3'],
};

/** Minimal PackageServiceDeps with fetchJson that routes to mock data */
function createDeps(overrides?: Partial<PackageServiceDeps>): PackageServiceDeps {
    // Mock fetchJson returns different data based on URL pattern
    const mockFetchJson = vi.fn(async <T>(url: string): Promise<T | null> => {
        if (url.includes('/query') || url.includes('azuresearch')) {
            return MOCK_SEARCH_RESPONSE as T;
        }
        if (url.includes('/v3-flatcontainer/') && url.endsWith('/index.json')) {
            return MOCK_VERSIONS_RESPONSE as T;
        }
        if (url.includes('/registration5-semver1/')) {
            return { items: [{ items: [{ catalogEntry: { id: 'Newtonsoft.Json', version: '13.0.3', description: 'Popular JSON framework', authors: 'James Newton-King', dependencyGroups: [] } }] }] } as T;
        }
        return null;
    });

    return {
        discoverServiceEndpoints: vi.fn(async (_sourceUrl: string) => {
            // camelCase keys matching real discoverServiceEndpoints output
            return {
                searchQueryService: 'https://azuresearch-usnc.nuget.org/query',
                searchAutocompleteService: 'https://azuresearch-usnc.nuget.org/autocomplete',
                registrationsBaseUrl: 'https://api.nuget.org/v3/registration5-semver1/',
                packageBaseAddress: 'https://api.nuget.org/v3-flatcontainer/',
            };
        }),
        getAuthHeader: vi.fn(async () => undefined),
        fetchJson: mockFetchJson,
        fetchJsonWithDetails: vi.fn(async (url: string) => {
            const data = await mockFetchJson(url);
            return { data, status: data ? 200 : 404 };
        }),
        fetchJsonWithCompression: vi.fn(async <T>(url: string): Promise<T | null> => {
            return mockFetchJson<T>(url);
        }),
        fetchText: vi.fn(async () => undefined),
        downloadFile: vi.fn(async () => false),
        getSources: vi.fn(async () => [{ name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true }] as NuGetSource[]),
        isLocalSource: vi.fn(() => false),
        filterHealthySources: vi.fn((urls: string[]) => urls),
        getFailedEndpointCacheTTL: vi.fn(() => 120_000),
        getFailedEndpointCache: vi.fn(() => new Map()),
        getHttpRequestTimeout: vi.fn(() => 30_000),
        getMaxDownloadSize: vi.fn(() => 50 * 1024 * 1024),
        getMaxResponseSize: vi.fn(() => 10 * 1024 * 1024),
        sanitizeForLogging: vi.fn((text: string) => text),
        ...overrides,
    };
}

describe('NuGetPackageService Integration', () => {
    let packageService: NuGetPackageService;
    let deps: PackageServiceDeps;

    beforeEach(() => {
        deps = createDeps();
        packageService = new NuGetPackageService(deps);
    });

    describe('searchPackages', () => {
        it('should search via API and cache results in LRU', async () => {
            const results1 = await packageService.searchPackages(
                'Newtonsoft.Json',
                ['https://api.nuget.org/v3/index.json'],
            );
            expect(results1.length).toBeGreaterThanOrEqual(1);
            expect(results1[0].id).toBe('Newtonsoft.Json');

            // Second call should use cache — fetchJson should not be called again for same query
            const callCount = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls.length;
            const results2 = await packageService.searchPackages(
                'Newtonsoft.Json',
                ['https://api.nuget.org/v3/index.json'],
            );
            expect(results2).toEqual(results1);
            // fetchJson shouldn't have been called again (cached)
            expect((deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
        });

        it('should return empty for nonexistent packages when API returns no data', async () => {
            const emptyDeps = createDeps({
                fetchJson: vi.fn(async () => ({ totalHits: 0, data: [] })),
            });
            const emptyService = new NuGetPackageService(emptyDeps);

            const results = await emptyService.searchPackages(
                'nonexistent-package-xyz',
                ['https://api.nuget.org/v3/index.json'],
            );
            expect(results).toHaveLength(0);
        });

        it('should handle custom search response via deps override', async () => {
            const customDeps = createDeps({
                fetchJson: vi.fn(async () => ({
                    totalHits: 1,
                    data: [{ id: 'CustomPkg', version: '1.0.0', description: 'Test', authors: 'Author', totalDownloads: 100 }],
                })),
            });
            const customService = new NuGetPackageService(customDeps);

            const results = await customService.searchPackages(
                'Custom',
                ['https://api.nuget.org/v3/index.json'],
            );
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('CustomPkg');
        });
    });

    describe('getPackageVersions', () => {
        it('should return versions from flat container via deps', async () => {
            const versions = await packageService.getPackageVersions(
                'Newtonsoft.Json',
                'https://api.nuget.org/v3/index.json',
            );

            expect(versions.length).toBeGreaterThan(0);
            expect(versions).toContain('13.0.3');
        });
    });

    describe('listed-only update suggestions', () => {
        const packageId = 'Mammoth.Extensions.DependencyInjection';
        const installed = [{ id: packageId, version: '0.7.1', versionType: 'standard' as const }];
        const sourceUrl = 'https://feed.example/v3/index.json';
        const searchUrl = 'https://feed.example/query';
        const registrationUrl = `https://feed.example/registration/${packageId.toLowerCase()}/index.json`;
        const flatUrl = `https://feed.example/flat/${packageId.toLowerCase()}/index.json`;

        function createUpdateService(responses: Record<string, unknown>, search = true) {
            const localDeps = createDeps({
                getSources: vi.fn(async () => [{ name: 'test', url: sourceUrl, enabled: true }]),
                discoverServiceEndpoints: vi.fn(async () => ({
                    packageBaseAddress: 'https://feed.example/flat/',
                    registrationsBaseUrl: 'https://feed.example/registration/',
                    searchQueryService: search ? searchUrl : undefined,
                })),
                fetchJson: vi.fn(async <T>(url: string): Promise<T | null> =>
                    (responses[url.startsWith(searchUrl) ? searchUrl : url] as T) ?? null),
            });
            const service = new NuGetPackageService(localDeps);
            service.clearVersionsCache();
            vi.spyOn(service, 'getPackageSearchMetadata').mockResolvedValue({ verified: false });
            vi.spyOn(service, 'getPackageIconUrl').mockResolvedValue(undefined);
            return { service, localDeps };
        }

        it.each(['checkPackageUpdates', 'checkPackageUpdatesMinimal'] as const)(
            '%s suggests the latest listed version instead of the unlisted 6.0.0',
            async method => {
                const { service, localDeps } = createUpdateService({
                    [flatUrl]: { versions: ['0.7.1', '0.8.0', '6.0.0'] },
                    [searchUrl]: { data: [{ id: packageId, version: '0.8.0', versions: [{ version: '0.8.0' }, { version: '0.7.1' }] }] },
                });

                // An explicit latest-version lookup must not poison the update cache.
                expect(await service.getPackageVersions(packageId, sourceUrl, false, 1)).toEqual(['6.0.0']);
                const onUpdateFound = vi.fn();
                const updates = method === 'checkPackageUpdates'
                    ? await service.checkPackageUpdates(installed, false, undefined, onUpdateFound)
                    : await service.checkPackageUpdatesMinimal(installed, false);
                expect(updates).toEqual([expect.objectContaining({
                    id: packageId, installedVersion: '0.7.1', latestVersion: '0.8.0', sourceUrl,
                })]);
                if (method === 'checkPackageUpdates') {
                    expect(onUpdateFound).toHaveBeenCalledWith(updates[0]);
                }
                expect(localDeps.fetchJson).toHaveBeenCalledWith(
                    expect.stringContaining('&prerelease=false&semVerLevel=2.0.0'), undefined
                );

                const calls = vi.mocked(localDeps.fetchJson).mock.calls.length;
                expect(await service.checkPackageUpdatesMinimal(installed, false)).toEqual([
                    expect.objectContaining({ latestVersion: '0.8.0' }),
                ]);
                expect(vi.mocked(localDeps.fetchJson).mock.calls).toHaveLength(calls);
                service.clearVersionsCacheForPackages([packageId]);
                await service.checkPackageUpdatesMinimal(installed, false);
                expect(vi.mocked(localDeps.fetchJson).mock.calls.length).toBeGreaterThan(calls);
            }
        );

        it('filters unlisted registration entries on inline and external pages when search is unavailable', async () => {
            const pageUrl = 'https://feed.example/registration/page.json';
            const catalogUrl = 'https://feed.example/catalog/0.8.0.json';
            const { service } = createUpdateService({
                [registrationUrl]: { items: [
                    { items: [{ catalogEntry: { version: '6.0.0', listed: false } }] },
                    { '@id': pageUrl },
                ] },
                [pageUrl]: { items: [
                    { catalogEntry: catalogUrl },
                    { listed: false, catalogEntry: { version: '7.0.0', listed: true } },
                    { catalogEntry: { version: '0.7.1', listed: true } },
                ] },
                [catalogUrl]: { version: '0.8.0' },
            });
            expect(await service.checkPackageUpdatesMinimal(installed, false)).toEqual([
                expect.objectContaining({ latestVersion: '0.8.0' }),
            ]);
        });

        it('supports authenticated registration-only sources', async () => {
            const { service, localDeps } = createUpdateService({
                [registrationUrl]: { items: [{ items: [
                    { catalogEntry: { version: '6.0.0', listed: false } },
                    { catalogEntry: { version: '0.8.0', listed: true } },
                ] }] },
            }, false);
            vi.mocked(localDeps.discoverServiceEndpoints).mockResolvedValue({
                registrationsBaseUrl: 'https://feed.example/registration/',
            });
            vi.mocked(localDeps.getAuthHeader).mockResolvedValue('Basic test');
            expect(await service.checkPackageUpdatesMinimal(installed, false)).toEqual([
                expect.objectContaining({ latestVersion: '0.8.0' }),
            ]);
            expect(localDeps.fetchJson).toHaveBeenCalledWith(registrationUrl, 'Basic test');
        });

        it('ignores an all-unlisted source and retains the source of the listed update', async () => {
            const otherSource = 'https://other.example/index.json';
            const otherSearch = 'https://other.example/query';
            const { service, localDeps } = createUpdateService({
                [searchUrl]: { data: [] },
                [otherSearch]: { data: [{ id: packageId, version: '0.8.0' }] },
            });
            vi.mocked(localDeps.getSources).mockResolvedValue([
                { name: 'all-unlisted', url: sourceUrl, enabled: true },
                { name: 'listed', url: otherSource, enabled: true },
            ]);
            vi.mocked(localDeps.discoverServiceEndpoints).mockImplementation(async url => ({
                searchQueryService: url === otherSource ? otherSearch : searchUrl,
            }));
            vi.mocked(localDeps.fetchJson).mockImplementation(async <T>(url: string): Promise<T | null> => {
                return (url.startsWith(otherSearch)
                    ? { data: [{ id: packageId, version: '0.8.0' }] }
                    : { data: [] }) as T;
            });
            expect(await service.checkPackageUpdatesMinimal(installed, false)).toEqual([
                expect.objectContaining({ latestVersion: '0.8.0', sourceUrl: otherSource }),
            ]);
        });

        it.each([
            { entries: [{ version: '6.0.0', listed: false }] },
            { entries: [{ version: '6.0.0', listed: false }, { version: '0.7.1', listed: true }] },
        ])('does not suggest unlisted versions when no newer listed version exists (%j)', async ({ entries }) => {
            const { service } = createUpdateService({
                [registrationUrl]: { items: [{ items: entries.map(catalogEntry => ({ catalogEntry })) }] },
            }, false);
            expect(await service.checkPackageUpdatesMinimal(installed, false)).toEqual([]);
        });

        it('treats empty search results as authoritative, not a reason to use unlisted downloads', async () => {
            const { service, localDeps } = createUpdateService({
                [searchUrl]: { data: [] },
                [flatUrl]: { versions: ['6.0.0'] },
            });
            expect(await service.checkPackageUpdatesMinimal(installed, false)).toEqual([]);
            expect(localDeps.fetchJson).toHaveBeenCalledTimes(1);
        });

        it('handles PascalCase search results, version-only feeds, and prerelease filtering', async () => {
            const { service } = createUpdateService({
                [searchUrl]: { Data: [{ Id: packageId.toUpperCase(), Versions: [
                    { version: '0.8.0' }, { version: '1.0.0-beta.2' }, { version: '0.9.0' },
                ] }] },
            });
            expect(await service.checkPackageUpdatesMinimal(installed, false)).toEqual([
                expect.objectContaining({ latestVersion: '0.9.0' }),
            ]);
            expect(await service.checkPackageUpdatesMinimal(installed, true)).toEqual([
                expect.objectContaining({ latestVersion: '1.0.0-beta.2' }),
            ]);
            const versionOnly = createUpdateService({
                [searchUrl]: { Data: [{ Id: packageId, Version: '0.8.0' }] },
            }).service;
            expect(await versionOnly.checkPackageUpdatesMinimal(installed, false)).toEqual([
                expect.objectContaining({ latestVersion: '0.8.0' }),
            ]);
        });

        it('does not suggest a search result for a different package ID', async () => {
            const { service } = createUpdateService({
                [searchUrl]: { data: [{ id: `${packageId}.Other`, version: '9.0.0' }] },
            });
            expect(await service.checkPackageUpdatesMinimal(installed, false)).toEqual([]);
        });

        it('logs failed registration pages rather than falling back to unlisted versions', async () => {
            const { service } = createUpdateService({
                [registrationUrl]: { items: [{ '@id': 'https://feed.example/missing-page.json' }] },
                [flatUrl]: { versions: ['6.0.0'] },
            }, false);
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            try {
                expect(await service.checkPackageUpdatesMinimal(installed, false)).toEqual([]);
                expect(error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch versions'), expect.any(Error));
            } finally {
                error.mockRestore();
            }
        });

        it('logs unavailable listing information and returns no unsafe update suggestion', async () => {
            const { service } = createUpdateService({ [flatUrl]: { versions: ['6.0.0'] } }, false);
            const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                expect(await service.checkPackageUpdatesMinimal(installed, false)).toEqual([]);
                expect(warning).toHaveBeenCalledWith(expect.stringContaining('Unable to determine listed versions'));
            } finally {
                warning.mockRestore();
            }
        });
    });

    describe('cache clearing', () => {
        it('should clear versions cache without throwing', () => {
            expect(() => packageService.clearVersionsCache()).not.toThrow();
        });
    });

    describe('prefetch slots', () => {
        it('caps concurrent prefetch slots at 4', () => {
            expect(packageService.tryAcquirePrefetchSlot()).toBe(true);
            expect(packageService.tryAcquirePrefetchSlot()).toBe(true);
            expect(packageService.tryAcquirePrefetchSlot()).toBe(true);
            expect(packageService.tryAcquirePrefetchSlot()).toBe(true);
            expect(packageService.tryAcquirePrefetchSlot()).toBe(false);
            packageService.releasePrefetchSlot();
            expect(packageService.tryAcquirePrefetchSlot()).toBe(true);
            packageService.releasePrefetchSlot();
            packageService.releasePrefetchSlot();
            packageService.releasePrefetchSlot();
            packageService.releasePrefetchSlot();
        });

        it('release is safe to call when no slot is held', () => {
            expect(() => packageService.releasePrefetchSlot()).not.toThrow();
            expect(packageService.tryAcquirePrefetchSlot()).toBe(true);
            packageService.releasePrefetchSlot();
        });
    });

    describe('in-flight dedup', () => {
        it('dedupes concurrent getPackageVersions calls into one network request', async () => {
            // Reset mock to count fetchJson calls precisely
            const localDeps = createDeps();
            const localService = new NuGetPackageService(localDeps);
            // First call returns a slow promise to keep it in-flight
            const fetchJsonMock = localDeps.fetchJson as ReturnType<typeof vi.fn>;
            fetchJsonMock.mockClear();

            const [a, b] = await Promise.all([
                localService.getPackageVersions('Newtonsoft.Json', 'https://api.nuget.org/v3/index.json'),
                localService.getPackageVersions('Newtonsoft.Json', 'https://api.nuget.org/v3/index.json'),
            ]);
            expect(a).toEqual(b);

            // Both calls share the same in-flight promise — only one flat-container fetch.
            const flatContainerCalls = fetchJsonMock.mock.calls.filter(
                ([url]) => typeof url === 'string' && url.includes('/v3-flatcontainer/') && url.endsWith('/index.json'),
            );
            expect(flatContainerCalls.length).toBe(1);
        });
    });
});
