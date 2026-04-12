/**
 * Integration tests for NuGetSourceService.
 *
 * Tests source caching, invalidation, and getSources delegation.
 * NuGetConfigParser.getSources() calls `dotnet nuget list source` (CLI),
 * so we mock it for deterministic results and test service-layer behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NuGetConfigParser } from '../../services/NuGetConfigParser';
import { NuGetLogger } from '../../services/NuGetLogger';
import { NuGetSourceService } from '../../services/NuGetSourceService';
import type { NuGetSource } from '../../services/NuGetTypes';

const FIXTURE_SOURCES: NuGetSource[] = [
    { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
    { name: 'MyFeed', url: 'https://pkgs.dev.azure.com/myorg/_packaging/myfeed/nuget/v3/index.json', enabled: true },
    { name: 'LocalFeed', url: 'C:\\LocalPackages', enabled: false },
];

function createMockLogger() {
    const channel = {
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
    return new NuGetLogger(channel);
}

describe('NuGetSourceService Integration', () => {
    let sourceService: NuGetSourceService;
    let configParser: NuGetConfigParser;
    let logger: NuGetLogger;
    let getSourcesSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        configParser = new NuGetConfigParser();
        logger = createMockLogger();
        // Mock getSources since it calls dotnet CLI
        getSourcesSpy = vi.spyOn(configParser, 'getSources').mockResolvedValue(FIXTURE_SOURCES);
        sourceService = new NuGetSourceService(configParser, logger, vi.fn());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getSources delegation', () => {
        it('should return sources from configParser', async () => {
            const sources = await sourceService.getSources();

            expect(sources.length).toBe(3);

            const nugetOrg = sources.find((s) => s.name === 'nuget.org');
            expect(nugetOrg).toBeDefined();
            expect(nugetOrg!.url).toBe('https://api.nuget.org/v3/index.json');
            expect(nugetOrg!.enabled).toBe(true);
        });

        it('should detect disabled sources', async () => {
            const sources = await sourceService.getSources();

            const localFeed = sources.find((s) => s.name === 'LocalFeed');
            expect(localFeed).toBeDefined();
            expect(localFeed!.enabled).toBe(false);
        });

        it('should include multiple sources', async () => {
            const sources = await sourceService.getSources();

            const myFeed = sources.find((s) => s.name === 'MyFeed');
            expect(myFeed).toBeDefined();
            expect(myFeed!.url).toContain('dev.azure.com');
            expect(myFeed!.enabled).toBe(true);
        });
    });

    describe('source caching', () => {
        it('should cache sources and not re-fetch within TTL', async () => {
            await sourceService.getSources();
            await sourceService.getSources();

            // configParser.getSources should only be called once (cached)
            expect(getSourcesSpy).toHaveBeenCalledTimes(1);
        });

        it('should return empty array when configParser returns empty', async () => {
            getSourcesSpy.mockResolvedValue([]);

            sourceService.invalidateSourcesCache();
            const sources = await sourceService.getSources();
            expect(sources).toEqual([]);
        });
    });

    describe('sourceService cache invalidation', () => {
        it('should expose invalidateSourcesCache without throwing', () => {
            expect(() => sourceService.invalidateSourcesCache()).not.toThrow();
        });

        it('should re-fetch after invalidation', async () => {
            await sourceService.getSources();
            expect(getSourcesSpy).toHaveBeenCalledTimes(1);

            sourceService.invalidateSourcesCache();
            await sourceService.getSources();
            expect(getSourcesSpy).toHaveBeenCalledTimes(2);
        });
    });
});
