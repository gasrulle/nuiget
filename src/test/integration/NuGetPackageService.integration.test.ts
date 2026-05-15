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
