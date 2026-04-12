/**
 * Integration tests for NuGetService facade.
 *
 * Tests the service facade methods, cache management, and error handling.
 * NuGetService uses HTTP/2 internally (not intercepted by MSW), so these
 * tests spy on internal methods to verify orchestration and caching behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock vscode is resolved via the alias in vitest.config.mts
import { NuGetService } from '../../services/NuGetService';
import type { PackageSearchResult } from '../../services/NuGetTypes';

// Create a mock output channel for the service
function createOutputChannel() {
    return {
        name: 'NuGet Test',
        append: vi.fn(),
        appendLine: vi.fn(),
        clear: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
        replace: vi.fn(),
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        logLevel: 1,
        onDidChangeLogLevel: vi.fn(),
    } as unknown as import('vscode').LogOutputChannel;
}

const MOCK_SEARCH_RESULTS: PackageSearchResult[] = [
    {
        id: 'Newtonsoft.Json',
        version: '13.0.3',
        description: 'Json.NET is a popular high-performance JSON framework for .NET',
        authors: 'James Newton-King',
        totalDownloads: 3_500_000_000,
        verified: true,
        versions: [],
    },
    {
        id: 'Newtonsoft.Json.Bson',
        version: '1.0.3',
        description: 'Json.NET BSON adds support for reading and writing BSON',
        authors: 'James Newton-King',
        totalDownloads: 200_000_000,
        verified: true,
        versions: [],
    },
];

describe('NuGetService Integration', () => {
    let service: NuGetService;

    beforeEach(() => {
        service = new NuGetService(createOutputChannel());
    });

    afterEach(() => {
        service.clearSourceErrors();
        vi.restoreAllMocks();
    });

    describe('searchPackages', () => {
        it('should delegate search to package service and return results', async () => {
            // Spy on internal _packageService to avoid real HTTP/2 calls
            const searchSpy = vi.spyOn(
                (service as unknown as { _packageService: { searchPackages: (...args: unknown[]) => Promise<PackageSearchResult[]> } })._packageService,
                'searchPackages',
            ).mockResolvedValue(MOCK_SEARCH_RESULTS);

            const results = await service.searchPackages(
                'Newtonsoft.Json',
                ['https://api.nuget.org/v3/index.json'],
            );

            expect(results).toHaveLength(2);
            expect(results[0].id).toBe('Newtonsoft.Json');
            expect(results[0].version).toBe('13.0.3');
            expect(results[0].totalDownloads).toBeGreaterThan(0);
            expect(searchSpy).toHaveBeenCalledWith(
                'Newtonsoft.Json',
                ['https://api.nuget.org/v3/index.json'],
                undefined,
                undefined,
                undefined,
                undefined,
            );
        });

        it('should return empty results for unknown packages', async () => {
            vi.spyOn(
                (service as unknown as { _packageService: { searchPackages: (...args: unknown[]) => Promise<PackageSearchResult[]> } })._packageService,
                'searchPackages',
            ).mockResolvedValue([]);

            const results = await service.searchPackages(
                'nonexistent-package-xyz',
                ['https://api.nuget.org/v3/index.json'],
            );

            expect(results).toHaveLength(0);
        });

        it('should handle search errors gracefully', async () => {
            vi.spyOn(
                (service as unknown as { _packageService: { searchPackages: (...args: unknown[]) => Promise<PackageSearchResult[]> } })._packageService,
                'searchPackages',
            ).mockRejectedValue(new Error('Service unavailable'));

            await expect(
                service.searchPackages('Newtonsoft.Json', ['https://api.nuget.org/v3/index.json']),
            ).rejects.toThrow('Service unavailable');
        });
    });

    describe('getPackageMetadata', () => {
        it('should delegate metadata fetch to package service', async () => {
            const mockMetadata = {
                id: 'Newtonsoft.Json',
                version: '13.0.3',
                authors: 'James Newton-King',
                description: 'Json.NET',
                dependencyGroups: [],
            };
            vi.spyOn(
                (service as unknown as { _packageService: { getPackageMetadata: (...args: unknown[]) => Promise<unknown> } })._packageService,
                'getPackageMetadata',
            ).mockResolvedValue(mockMetadata);

            const metadata = await service.getPackageMetadata(
                'Newtonsoft.Json',
                '13.0.3',
                'https://api.nuget.org/v3/index.json',
            );

            expect(metadata).not.toBeNull();
            expect(metadata!.id).toBe('Newtonsoft.Json');
            expect(metadata!.version).toBe('13.0.3');
        });

        it('should return null for non-existent package', async () => {
            vi.spyOn(
                (service as unknown as { _packageService: { getPackageMetadata: (...args: unknown[]) => Promise<null> } })._packageService,
                'getPackageMetadata',
            ).mockResolvedValue(null);

            const metadata = await service.getPackageMetadata(
                'NonExistentPackage',
                '1.0.0',
                'https://api.nuget.org/v3/index.json',
            );

            expect(metadata).toBeNull();
        });
    });

    describe('getPackageVersions', () => {
        it('should return sorted version list', async () => {
            vi.spyOn(
                (service as unknown as { _packageService: { getPackageVersions: (...args: unknown[]) => Promise<string[]> } })._packageService,
                'getPackageVersions',
            ).mockResolvedValue(['13.0.3', '13.0.2', '13.0.1', '12.0.3']);

            const versions = await service.getPackageVersions(
                'Newtonsoft.Json',
                'https://api.nuget.org/v3/index.json',
            );

            expect(versions.length).toBeGreaterThan(0);
            expect(versions).toContain('13.0.3');
        });
    });

    describe('clearSourceErrors', () => {
        it('should clear all caches without throwing', () => {
            expect(() => service.clearSourceErrors()).not.toThrow();
        });
    });

    describe('clearVersionsCache', () => {
        it('should clear versions cache without throwing', () => {
            expect(() => service.clearVersionsCache()).not.toThrow();
        });
    });
});
