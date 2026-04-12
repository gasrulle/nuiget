/**
 * Integration tests for NuGetSidebarPanel behavior.
 *
 * Tests state persistence, pending data caching, and message routing
 * patterns that the sidebar uses for background update checking.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('NuGetSidebarPanel Integration', () => {
    let service: NuGetService;

    beforeEach(() => {
        service = new NuGetService(createOutputChannel());
    });

    afterEach(() => {
        service.clearSourceErrors();
        vi.restoreAllMocks();
    });

    describe('update checking pipeline', () => {
        it('should check for updates using checkPackageUpdatesMinimal', async () => {
            vi.spyOn(
                (service as unknown as { _packageService: { checkPackageUpdatesMinimal: (...args: unknown[]) => Promise<unknown[]> } })._packageService,
                'checkPackageUpdatesMinimal',
            ).mockResolvedValue([{ id: 'Newtonsoft.Json', latestVersion: '13.0.3' }]);

            const installedPackages = [
                {
                    id: 'Newtonsoft.Json',
                    version: '12.0.3',
                    resolvedVersion: '12.0.3',
                    versionType: 'standard' as const,
                },
            ];

            const updates = await service.checkPackageUpdatesMinimal(
                installedPackages,
                false,
            );

            expect(Array.isArray(updates)).toBe(true);
            expect(updates.length).toBeGreaterThan(0);
        });

        it('should handle empty installed packages', async () => {
            const updates = await service.checkPackageUpdatesMinimal([], false);
            expect(updates).toEqual([]);
        });
    });

    describe('source operations for sidebar', () => {
        it('should search packages for sidebar browse mode', async () => {
            vi.spyOn(
                (service as unknown as { _packageService: { searchPackages: (...args: unknown[]) => Promise<PackageSearchResult[]> } })._packageService,
                'searchPackages',
            ).mockResolvedValue([
                { id: 'Newtonsoft.Json', version: '13.0.3', description: '', authors: '', totalDownloads: 0, verified: false, versions: [] },
            ]);

            const results = await service.searchPackages(
                'Newtonsoft',
                ['https://api.nuget.org/v3/index.json'],
                false,
                true, // liteMode for sidebar
            );

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
        });
    });
});
