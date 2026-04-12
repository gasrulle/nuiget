/**
 * Integration tests for NuGetPanel message handling.
 *
 * Simulates webview message flows through a real NuGetService instance
 * with internal package service spied to avoid real HTTP/2 calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NuGetService } from '../../services/NuGetService';
import type { PackageMetadata, PackageSearchResult } from '../../services/NuGetTypes';

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
        description: 'Json.NET',
        authors: 'James Newton-King',
        totalDownloads: 3_500_000_000,
        verified: true,
        versions: [],
    },
];

const MOCK_METADATA: PackageMetadata = {
    id: 'Newtonsoft.Json',
    version: '13.0.3',
    authors: 'James Newton-King',
    description: 'Json.NET is a popular high-performance JSON framework for .NET',
    dependencyGroups: [],
};

describe('NuGetPanel Integration', () => {
    let service: NuGetService;

    beforeEach(() => {
        service = new NuGetService(createOutputChannel());
    });

    afterEach(() => {
        service.clearSourceErrors();
        vi.restoreAllMocks();
    });

    describe('message handler simulation', () => {
        it('should handle searchPackages flow end-to-end', async () => {
            // Spy on internal package service
            vi.spyOn(
                (service as unknown as { _packageService: { searchPackages: (...args: unknown[]) => Promise<PackageSearchResult[]> } })._packageService,
                'searchPackages',
            ).mockResolvedValue(MOCK_SEARCH_RESULTS);

            vi.spyOn(
                (service as unknown as { _packageService: { getPackageMetadata: (...args: unknown[]) => Promise<PackageMetadata | null> } })._packageService,
                'getPackageMetadata',
            ).mockResolvedValue(MOCK_METADATA);

            // Simulate what the panel does when handling a searchPackages message
            const results = await service.searchPackages(
                'Newtonsoft',
                ['https://api.nuget.org/v3/index.json'],
                false,
            );

            expect(results.length).toBeGreaterThan(0);

            // Then simulate getPackageMetadata for the first result
            if (results[0]) {
                const metadata = await service.getPackageMetadata(
                    results[0].id,
                    results[0].version,
                    'https://api.nuget.org/v3/index.json',
                );

                expect(metadata).not.toBeNull();
                expect(metadata!.id).toBe(results[0].id);
            }
        });

        it('should handle getPackageVersions flow', async () => {
            vi.spyOn(
                (service as unknown as { _packageService: { getPackageVersions: (...args: unknown[]) => Promise<string[]> } })._packageService,
                'getPackageVersions',
            ).mockResolvedValue(['13.0.3', '13.0.2', '13.0.1']);

            const versions = await service.getPackageVersions(
                'Newtonsoft.Json',
                'https://api.nuget.org/v3/index.json',
                false,
            );

            expect(Array.isArray(versions)).toBe(true);
            expect(versions.length).toBeGreaterThan(0);
        });

        it('should handle checkPackageUpdates flow', async () => {
            vi.spyOn(
                (service as unknown as { _packageService: { checkPackageUpdates: (...args: unknown[]) => Promise<unknown[]> } })._packageService,
                'checkPackageUpdates',
            ).mockResolvedValue([{ id: 'Newtonsoft.Json', currentVersion: '12.0.3', latestVersion: '13.0.3' }]);

            const installedPackages = [
                {
                    id: 'Newtonsoft.Json',
                    version: '12.0.3',
                    resolvedVersion: '12.0.3',
                    versionType: 'standard' as const,
                },
            ];

            const updates = await service.checkPackageUpdates(
                installedPackages,
                false,
            );

            expect(Array.isArray(updates)).toBe(true);
            expect(updates.length).toBeGreaterThan(0);
        });
    });

    describe('error resilience', () => {
        it('should not throw on concurrent searches', async () => {
            vi.spyOn(
                (service as unknown as { _packageService: { searchPackages: (...args: unknown[]) => Promise<PackageSearchResult[]> } })._packageService,
                'searchPackages',
            ).mockResolvedValue(MOCK_SEARCH_RESULTS);

            const queries = ['Newtonsoft', 'Serilog', 'nonexistent-pkg'];
            const sources = ['https://api.nuget.org/v3/index.json'];

            const results = await Promise.all(
                queries.map((q) => service.searchPackages(q, sources)),
            );

            expect(results).toHaveLength(3);
            results.forEach((r) => expect(Array.isArray(r)).toBe(true));
        });
    });
});
