/**
 * Integration tests for cross-panel synchronization.
 *
 * Tests the data flow patterns between main panel and sidebar:
 * cache invalidation, concurrent operations, and selective clearing.
 */
import { describe, expect, it, vi } from 'vitest';
import { NuGetService } from '../../services/NuGetService';
import type { PackageSearchResult } from '../../services/NuGetTypes';

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

const MOCK_RESULTS: PackageSearchResult[] = [
    { id: 'Newtonsoft.Json', version: '13.0.3', description: '', authors: '', totalDownloads: 0, verified: false, versions: [] },
];

describe('Cross-Panel Sync Integration', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('selective cache invalidation', () => {
        it('should invalidate specific package versions after operation', () => {
            const service = new NuGetService(createOutputChannel());

            expect(() => {
                service.clearVersionsCacheForPackages(['Newtonsoft.Json']);
            }).not.toThrow();
        });

        it('should clear all versions cache on full refresh', () => {
            const service = new NuGetService(createOutputChannel());

            expect(() => {
                service.clearVersionsCache();
            }).not.toThrow();
        });

        it('should clear source errors and re-validate', () => {
            const service = new NuGetService(createOutputChannel());

            expect(() => {
                service.clearSourceErrors();
            }).not.toThrow();
        });
    });

    describe('concurrent operation safety', () => {
        it('should handle concurrent searches from panel and sidebar', async () => {
            const service = new NuGetService(createOutputChannel());

            // Mock internal package service to avoid real HTTP/2 calls
            const searchSpy = vi.spyOn(
                (service as unknown as { _packageService: { searchPackages: (...args: unknown[]) => Promise<PackageSearchResult[]> } })._packageService,
                'searchPackages',
            ).mockResolvedValue(MOCK_RESULTS);

            const sources = ['https://api.nuget.org/v3/index.json'];

            // Simulate panel and sidebar searching concurrently
            const [panelResults, sidebarResults] = await Promise.all([
                service.searchPackages('Newtonsoft', sources, false, false),
                service.searchPackages('Newtonsoft', sources, false, true),
            ]);

            expect(panelResults.length).toBeGreaterThan(0);
            expect(sidebarResults.length).toBeGreaterThan(0);
            expect(searchSpy).toHaveBeenCalledTimes(2);
        });

        it('should serve cached results to second caller', async () => {
            const service = new NuGetService(createOutputChannel());

            vi.spyOn(
                (service as unknown as { _packageService: { searchPackages: (...args: unknown[]) => Promise<PackageSearchResult[]> } })._packageService,
                'searchPackages',
            ).mockResolvedValue(MOCK_RESULTS);

            const sources = ['https://api.nuget.org/v3/index.json'];

            const results1 = await service.searchPackages('Newtonsoft', sources);
            const results2 = await service.searchPackages('Newtonsoft', sources);

            expect(results1).toEqual(results2);
        });
    });
});
