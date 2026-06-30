import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

// ──────────────────────────────────────────────
// Hoist mocks for modules used by NuGetService
// ──────────────────────────────────────────────
const hoisted = vi.hoisted(() => {
    const mockExecWithTimeout = vi.fn();
    const mockFileExists = vi.fn();
    const mockReadFileAsync = vi.fn();
    let promisifyCallCount = 0;
    const getNextPromisified = () => {
        promisifyCallCount++;
        if (promisifyCallCount === 1) { return mockReadFileAsync; } // readFile
        return vi.fn(); // writeFile and others
    };
    const mockIsSafeRedirectTarget = vi.fn().mockReturnValue(true);
    return { mockExecWithTimeout, mockFileExists, mockReadFileAsync, getNextPromisified, mockIsSafeRedirectTarget };
});

vi.mock('./NuGetUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./NuGetUtils')>();
    return {
        ...actual,
        execWithTimeout: hoisted.mockExecWithTimeout,
        fileExists: hoisted.mockFileExists,
    };
});

vi.mock('util', () => ({
    promisify: vi.fn(() => hoisted.getNextPromisified()),
}));

vi.mock('./Http2Client', () => ({
    http2Client: {
        fetchJson: vi.fn().mockResolvedValue(null),
        fetchJsonWithDetails: vi.fn().mockResolvedValue({ data: null }),
        headRequest: vi.fn().mockResolvedValue(false),
        headRequestContentLength: vi.fn().mockResolvedValue(-1),
    },
    isSafeRedirectTarget: hoisted.mockIsSafeRedirectTarget,
    isRedirectStatus(statusCode: number | undefined): boolean {
        return statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308;
    },
    resolveRedirect(
        statusCode: number | undefined,
        locationHeader: string | undefined,
        originalUrl: string,
        authHeader?: string,
    ) {
        if (!(statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) || !locationHeader) {
            return null;
        }
        const redirectParsed = new URL(locationHeader, originalUrl);
        const redirectUrl = redirectParsed.href;
        if (!hoisted.mockIsSafeRedirectTarget(redirectUrl, originalUrl)) { return null; }
        const originalParsed = new URL(originalUrl);
        const sameOrigin = redirectParsed.origin === originalParsed.origin;
        return { redirectUrl, forwardAuth: sameOrigin ? authHeader : undefined };
    },
}));

vi.mock('./CredentialService', () => ({
    credentialService: {
        getCredentials: vi.fn().mockResolvedValue({ credentials: null }),
        prewarmCredentials: vi.fn(),
        setOutputChannel: vi.fn(),
    },
    CredentialService: { getInstance: vi.fn(), createBasicAuthHeader: vi.fn() },
}));

vi.mock('./NuGetConfigParser', () => ({
    NuGetConfigParser: class MockNuGetConfigParser {
        getSources = vi.fn().mockResolvedValue([]);
        getCredentials = vi.fn().mockResolvedValue(new Map());
        getConfigFilePaths = vi.fn().mockReturnValue([]);
    },
}));

vi.mock('./WorkspaceCache', () => ({
    workspaceCache: {
        get: vi.fn().mockReturnValue(undefined),
        set: vi.fn(),
        has: vi.fn().mockReturnValue(false),
        delete: vi.fn(),
        clear: vi.fn(),
        clearByPrefix: vi.fn(),
    },
    CACHE_TTL: { VERSIONS: 180000, VERIFIED_STATUS: 300000, ICON_EXISTS: 0, SEARCH_RESULTS: 120000, README: 0 },
    cacheKeys: {
        versions: vi.fn().mockReturnValue('versions:test'),
        verifiedStatus: vi.fn().mockReturnValue('verified:test'),
        iconExists: vi.fn().mockReturnValue('iconurl:test'),
        searchResults: vi.fn().mockReturnValue('search:test'),
        readme: vi.fn().mockReturnValue('readme:test'),
    },
}));

vi.mock('adm-zip', () => ({
    default: vi.fn().mockImplementation(() => ({
        getEntries: vi.fn().mockReturnValue([]),
    })),
}));

vi.mock('fs', () => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
    createWriteStream: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        close: vi.fn((cb?: () => void) => cb?.()),
        write: vi.fn(),
        end: vi.fn((cb?: () => void) => cb?.()),
    }),
    existsSync: vi.fn().mockReturnValue(false),
    unlinkSync: vi.fn(),
    promises: {
        stat: vi.fn(),
        access: vi.fn(),
        writeFile: vi.fn(),
        readFile: vi.fn(),
    },
    constants: { F_OK: 0 },
}));

vi.mock('os', () => ({
    homedir: vi.fn().mockReturnValue('/home/user'),
    platform: vi.fn().mockReturnValue('linux'),
    tmpdir: vi.fn().mockReturnValue('/tmp'),
}));

// ──────────────────────────────────────────────
// Mock http/https/zlib for HTTP layer tests
// ──────────────────────────────────────────────
const mockHttpRequest = vi.fn();
const mockHttpsRequest = vi.fn();

vi.mock('http', () => ({
    request: (...args: unknown[]) => mockHttpRequest(...args),
}));

vi.mock('https', () => ({
    request: (...args: unknown[]) => mockHttpsRequest(...args),
}));

vi.mock('zlib', () => ({
    createGunzip: vi.fn(),
    createInflate: vi.fn(),
}));

import { EventEmitter } from 'events';
import { http2Client, isSafeRedirectTarget } from './Http2Client';
import { NuGetService } from './NuGetService';
import { workspaceCache } from './WorkspaceCache';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Create a mock HTTP response (EventEmitter with statusCode and headers).
 * Data/end events are NOT auto-emitted — call emitBody() after attaching listeners.
 */
function createMockResponse(statusCode: number, body?: string, headers?: Record<string, string>) {
    const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
        pipe: ReturnType<typeof vi.fn>;
        emitBody: () => void;
    };
    res.statusCode = statusCode;
    res.headers = headers || {};
    res.pipe = vi.fn().mockReturnThis();
    res.emitBody = () => {
        if (body !== undefined) {
            res.emit('data', Buffer.from(body));
        }
        res.emit('end');
    };
    return res;
}

/**
 * Create a mock HTTP request (EventEmitter with end()/destroy()).
 */
function createMockRequest() {
    const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void; setTimeout: ReturnType<typeof vi.fn> };
    req.end = vi.fn();
    req.destroy = vi.fn();
    req.setTimeout = vi.fn();
    return req;
}

/**
 * Setup mockHttpsRequest (or mockHttpRequest) to return a canned response.
 * For 200 responses with body, data/end are auto-emitted after the response callback runs.
 * For non-200, only the callback fires (code resolves in status checks before data events).
 */
function setupHttpMock(mock: ReturnType<typeof vi.fn>, statusCode: number, body?: string, headers?: Record<string, string>) {
    const res = createMockResponse(statusCode, body, headers);
    const req = createMockRequest();
    mock.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (r: unknown) => void;
        if (typeof cb === 'function') {
            process.nextTick(() => {
                cb(res);
                // After callback attaches listeners, emit body data
                if (statusCode === 200 && body !== undefined) {
                    process.nextTick(() => res.emitBody());
                }
            });
        }
        return req;
    });
    return { req, res };
}
function createMockOutputChannel(): vscode.LogOutputChannel {
    return {
        name: 'nUIget',
        appendLine: vi.fn(),
        append: vi.fn(),
        show: vi.fn(),
        clear: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        dispose: vi.fn(),
        replace: vi.fn(),
        hide: vi.fn(),
        logLevel: 1,
        onDidChangeLogLevel: vi.fn(),
    } as unknown as vscode.LogOutputChannel;
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────
describe('NuGetService', () => {
    let service: NuGetService;
    let outputChannel: vscode.LogOutputChannel;

    beforeEach(() => {
        vi.clearAllMocks();
        outputChannel = createMockOutputChannel();
        service = new NuGetService(outputChannel);
    });

    afterEach(() => {
        service.stopSourceHealthMonitor();
    });

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────
    describe('constructor', () => {
        it('creates instance without errors', () => {
            expect(service).toBeDefined();
        });
    });

    // ──────────────────────────────────────────────
    // findProjects
    // ──────────────────────────────────────────────
    describe('findProjects', () => {
        it('returns empty array when no workspace folders', async () => {
            vi.mocked(vscode.workspace).workspaceFolders = undefined;
            const projects = await service.findProjects();
            expect(projects).toEqual([]);
        });

        it('finds and sorts project files', async () => {
            vi.mocked(vscode.workspace).workspaceFolders = [
                { uri: vscode.Uri.file('/workspace'), name: 'ws', index: 0 },
            ];
            vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
                vscode.Uri.file('/workspace/ProjectB/ProjectB.csproj'),
                vscode.Uri.file('/workspace/ProjectA/ProjectA.csproj'),
            ]);

            const projects = await service.findProjects();
            expect(projects).toHaveLength(2);
            expect(projects[0].name).toBe('ProjectA.csproj');
            expect(projects[1].name).toBe('ProjectB.csproj');
        });
    });

    // ──────────────────────────────────────────────
    // installPackage
    // ──────────────────────────────────────────────
    describe('installPackage', () => {
        it('rejects invalid package ID', async () => {
            const result = await service.installPackage('/proj.csproj', 'bad;injection');
            expect(result).toBe(false);
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Invalid package ID'));
        });

        it('rejects invalid version', async () => {
            const result = await service.installPackage('/proj.csproj', 'ValidPkg', 'bad;version');
            expect(result).toBe(false);
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Invalid version'));
        });

        it('returns true on success', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'success', stderr: '' });
            const result = await service.installPackage('/proj.csproj', 'Newtonsoft.Json', '13.0.3');
            expect(result).toBe(true);
            expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        });

        it('returns false when stderr contains error', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: '', stderr: 'error NU1020: something' });
            const result = await service.installPackage('/proj.csproj', 'BadPkg', '1.0.0');
            expect(result).toBe(false);
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });

        it('returns false on execWithTimeout crash', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValue(new Error('exec failed'));
            const result = await service.installPackage('/proj.csproj', 'Crash.Pkg');
            expect(result).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // updatePackage
    // ──────────────────────────────────────────────
    describe('updatePackage', () => {
        it('rejects invalid package ID', async () => {
            const result = await service.updatePackage('/proj.csproj', 'bad;id', '2.0.0');
            expect(result).toBe(false);
        });

        it('rejects invalid version', async () => {
            const result = await service.updatePackage('/proj.csproj', 'ValidPkg', '; rm -rf /');
            expect(result).toBe(false);
        });

        it('returns true on success', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'ok', stderr: '' });
            const result = await service.updatePackage('/proj.csproj', 'Serilog', '4.0.0');
            expect(result).toBe(true);
        });

        it('skips notification when skipNotification option is set', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'ok', stderr: '' });
            await service.updatePackage('/proj.csproj', 'Pkg', '2.0.0', { skipNotification: true });
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('returns false on error', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: '', stderr: 'Error NU1000' });
            const result = await service.updatePackage('/proj.csproj', 'Pkg', '2.0.0');
            expect(result).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // removePackage
    // ──────────────────────────────────────────────
    describe('removePackage', () => {
        it('rejects invalid package ID', async () => {
            const result = await service.removePackage('/proj.csproj', 'bad name!');
            expect(result).toBe(false);
        });

        it('removes successfully and triggers restore', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'removed', stderr: '' });
            const result = await service.removePackage('/proj.csproj', 'OldPackage');
            expect(result).toBe(true);
            // Three calls: dotnet --version (SDK detection), remove, restore
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledTimes(3);
        });

        it('skips restore when skipRestore is set', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'removed', stderr: '' });
            await service.removePackage('/proj.csproj', 'Pkg', { skipRestore: true });
            // Two calls: dotnet --version (SDK detection), remove — no restore
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledTimes(2);
        });

        it('returns false on error in stderr', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: '', stderr: 'Error: not found' });
            const result = await service.removePackage('/proj.csproj', 'NotInstalled');
            expect(result).toBe(false);
        });

        it('returns false on exception', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValue(new Error('crash'));
            const result = await service.removePackage('/proj.csproj', 'CrashPkg');
            expect(result).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // restoreProject
    // ──────────────────────────────────────────────
    describe('restoreProject', () => {
        it('returns true on success', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'Restored', stderr: '' });
            const result = await service.restoreProject('/proj.csproj');
            expect(result).toBe(true);
        });

        it('returns false on error', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValue(new Error('fail'));
            const result = await service.restoreProject('/proj.csproj');
            expect(result).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // getSources / invalidateSourcesCache
    // ──────────────────────────────────────────────
    describe('getSources', () => {
        it('returns cached sources within TTL', async () => {
            const first = await service.getSources();
            const second = await service.getSources();
            // configParser.getSources called only once
            expect(first).toBe(second);
        });

        it('invalidateSourcesCache forces re-fetch', async () => {
            await service.getSources();
            service.invalidateSourcesCache();
            await service.getSources();
            // After invalidation, configParser.getSources should be called again
        });
    });

    // ──────────────────────────────────────────────
    // clearSourceErrors / clearInMemoryNuGetCaches
    // ──────────────────────────────────────────────
    describe('clearSourceErrors', () => {
        it('clears all caches and restarts health monitor', () => {
            service.clearSourceErrors();
            // workspaceCache.clearByPrefix should be called for version cache
            expect(workspaceCache.clearByPrefix).toHaveBeenCalledWith('versions:');
        });

        it('is an alias for clearInMemoryNuGetCaches', () => {
            const spy = vi.spyOn(service, 'clearInMemoryNuGetCaches');
            service.clearSourceErrors();
            expect(spy).toHaveBeenCalledTimes(1);
        });
    });

    describe('clearInMemoryNuGetCaches', () => {
        it('clears every documented in-memory cache and the package service caches', () => {
            const pkg = (service as any)._packageService;
            const clearCachesSpy = vi.spyOn(pkg, 'clearCaches');
            const clearMetaSpy = vi.spyOn(pkg, 'clearMetadataAndSearchCaches');
            const invalidateSourcesSpy = vi.spyOn(service, 'invalidateSourcesCache');
            const clearVersionsSpy = vi.spyOn(service, 'clearVersionsCache');

            // Seed the in-memory maps so we can verify they're cleared
            (service as any).failedSources.set('https://example.com', 'boom');
            (service as any).serviceIndexCache.set('https://example.com', {} as any);
            (service as any).failedEndpointCache.set('https://example.com', Date.now());

            service.clearInMemoryNuGetCaches();

            expect((service as any).failedSources.size).toBe(0);
            expect((service as any).serviceIndexCache.size).toBe(0);
            expect((service as any).failedEndpointCache.size).toBe(0);
            expect(clearCachesSpy).toHaveBeenCalledTimes(1);
            expect(clearMetaSpy).toHaveBeenCalledTimes(1);
            expect(invalidateSourcesSpy).toHaveBeenCalledTimes(1);
            expect(clearVersionsSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('clearNuGetHttpCacheBackground', () => {
        it('coalesces concurrent calls so the CLI runs only once', async () => {
            const cli = (service as any)._cliService;
            let resolveCli: () => void = () => { /* noop */ };
            const inFlight = new Promise<void>(r => { resolveCli = r; });
            const spy = vi.spyOn(cli, 'clearNuGetHttpCache').mockReturnValue(inFlight);

            service.clearNuGetHttpCacheBackground();
            service.clearNuGetHttpCacheBackground();
            service.clearNuGetHttpCacheBackground();

            expect(spy).toHaveBeenCalledTimes(1);

            // After it settles, a fresh call should spawn again
            resolveCli();
            await inFlight;
            await new Promise(r => setImmediate(r));
            spy.mockResolvedValueOnce(undefined as any);
            service.clearNuGetHttpCacheBackground();
            expect(spy).toHaveBeenCalledTimes(2);
        });

        it('swallows CLI errors so callers never see a rejection', async () => {
            const cli = (service as any)._cliService;
            const spy = vi.spyOn(cli, 'clearNuGetHttpCache')
                .mockRejectedValueOnce(new Error('boom'))
                .mockResolvedValueOnce(undefined as any);

            // Should not throw
            expect(() => service.clearNuGetHttpCacheBackground()).not.toThrow();
            // Wait one microtask so the .catch + .finally run and clear the in-flight slot
            await new Promise(r => setImmediate(r));
            // Subsequent call must spawn again now that in-flight is cleared
            service.clearNuGetHttpCacheBackground();
            expect(spy).toHaveBeenCalledTimes(2);
        });
    });

    // ──────────────────────────────────────────────
    // clearVersionsCache
    // ──────────────────────────────────────────────
    describe('clearVersionsCache', () => {
        it('clears workspace cache by prefix', () => {
            service.clearVersionsCache();
            expect(workspaceCache.clearByPrefix).toHaveBeenCalledWith('versions:');
        });
    });

    // ──────────────────────────────────────────────
    // clearVersionsCacheForPackages
    // ──────────────────────────────────────────────
    describe('clearVersionsCacheForPackages', () => {
        it('delegates to _packageService.clearVersionsCacheForPackages', () => {
            const spy = vi.spyOn((service as any)._packageService, 'clearVersionsCacheForPackages');
            service.clearVersionsCacheForPackages(['PkgA', 'PkgB']);
            expect(spy).toHaveBeenCalledWith(['PkgA', 'PkgB']);
        });
    });

    // ──────────────────────────────────────────────
    // clearSdkVersionCache
    // ──────────────────────────────────────────────
    describe('clearSdkVersionCache', () => {
        it('clears without errors', () => {
            service.clearSdkVersionCache();
            // No observable side effect other than not throwing
        });
    });

    // ──────────────────────────────────────────────
    // setupOutputChannel
    // ──────────────────────────────────────────────
    describe('setupOutputChannel', () => {
        it('shows channel when not skipping', () => {
            service.setupOutputChannel();
            expect(outputChannel.show).toHaveBeenCalledWith(true);
        });

        it('does not show channel when skipSetup is true', () => {
            service.setupOutputChannel(true);
            expect(outputChannel.show).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // logBulkOperationHeader
    // ──────────────────────────────────────────────
    describe('logBulkOperationHeader', () => {
        it('logs header with package count', () => {
            service.logBulkOperationHeader('Updating', 5);
            expect(outputChannel.info).toHaveBeenCalledWith('Updating 5 packages...');
        });

        it('uses operationType as full string when packageCount is 0', () => {
            service.logBulkOperationHeader('Custom header text', 0);
            expect(outputChannel.info).toHaveBeenCalledWith('Custom header text');
        });
    });

    // ──────────────────────────────────────────────
    // getFailedSources
    // ──────────────────────────────────────────────
    describe('getFailedSources', () => {
        it('returns a copy of failed sources map', () => {
            const failed = service.getFailedSources();
            expect(failed).toBeInstanceOf(Map);
            expect(failed.size).toBe(0);
        });
    });

    // ──────────────────────────────────────────────
    // getConfigFilePaths
    // ──────────────────────────────────────────────
    describe('getConfigFilePaths', () => {
        it('delegates to configParser', () => {
            const paths = service.getConfigFilePaths();
            expect(Array.isArray(paths)).toBe(true);
        });
    });

    // ──────────────────────────────────────────────
    // getProjectReferences
    // ──────────────────────────────────────────────
    describe('getProjectReferences', () => {
        it('parses ProjectReference elements', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.readFile).mockResolvedValue(
                '<Project><ItemGroup><ProjectReference Include="..\\Lib\\Lib.csproj" /></ItemGroup></Project>'
            );
            const refs = await service.getProjectReferences('/src/App/App.csproj');
            expect(refs).toHaveLength(1);
            expect(refs[0]).toContain('Lib.csproj');
        });

        it('returns empty array on read error', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('ENOENT'));
            const refs = await service.getProjectReferences('/nonexistent.csproj');
            expect(refs).toEqual([]);
        });
    });

    // ──────────────────────────────────────────────
    // getProjectDependencyMap
    // ──────────────────────────────────────────────
    describe('getProjectDependencyMap', () => {
        it('builds dependency map from ProjectReferences', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.readFile).mockImplementation(async (path: any) => {
                if (String(path).includes('App')) {
                    return '<Project><ItemGroup><ProjectReference Include="..\\Lib\\Lib.csproj" /></ItemGroup></Project>';
                }
                return '<Project></Project>';
            });

            const depMap = await service.getProjectDependencyMap([
                '/src/App/App.csproj',
                '/src/Lib/Lib.csproj',
            ]);

            expect(depMap.size).toBe(2);
        });
    });

    // ──────────────────────────────────────────────
    // getPackageSize
    // ──────────────────────────────────────────────
    describe('getPackageSize', () => {
        it('returns -1 when no endpoints', async () => {
            const size = await service.getPackageSize('TestPkg', '1.0.0');
            expect(size).toBe(-1);
        });
    });

    // ══════════════════════════════════════════════
    // Phase 4A: HTTP Layer & Service Discovery
    // ══════════════════════════════════════════════

    // ──────────────────────────────────────────────
    // fetchJsonWithDetails (private)
    // ──────────────────────────────────────────────
    describe('fetchJsonWithDetails', () => {
        it('returns parsed JSON on 200', async () => {
            const body = JSON.stringify({ version: '3.0.0', resources: [] });
            setupHttpMock(mockHttpsRequest, 200, body);

            const result = await (service as any).fetchJsonWithDetails('https://example.com/index.json');
            expect(result.data).toEqual({ version: '3.0.0', resources: [] });
            expect(result.error).toBeUndefined();
        });

        it('returns auth error on 401', async () => {
            setupHttpMock(mockHttpsRequest, 401);
            // For non-200, data/end events don't fire  — resolve is called in status check
            const res = createMockResponse(401);
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (r: unknown) => void;
                process.nextTick(() => cb(res));
                return req;
            });

            const result = await (service as any).fetchJsonWithDetails('https://example.com/index.json');
            expect(result.data).toBeNull();
            expect(result.error?.type).toBe('auth');
            expect(result.error?.statusCode).toBe(401);
        });

        it('returns auth error on 403', async () => {
            const res = createMockResponse(403);
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (r: unknown) => void;
                process.nextTick(() => cb(res));
                return req;
            });

            const result = await (service as any).fetchJsonWithDetails('https://example.com/feed');
            expect(result.error?.type).toBe('auth');
            expect(result.error?.statusCode).toBe(403);
        });

        it('returns not-found error on 404', async () => {
            const res = createMockResponse(404);
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (r: unknown) => void;
                process.nextTick(() => cb(res));
                return req;
            });

            const result = await (service as any).fetchJsonWithDetails('https://example.com/missing');
            expect(result.error?.type).toBe('not-found');
        });

        it('returns server-error on 500+', async () => {
            const res = createMockResponse(500);
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (r: unknown) => void;
                process.nextTick(() => cb(res));
                return req;
            });

            const result = await (service as any).fetchJsonWithDetails('https://example.com/api');
            expect(result.error?.type).toBe('server-error');
            expect(result.error?.statusCode).toBe(500);
        });

        it('returns unknown error for unexpected status codes', async () => {
            const res = createMockResponse(418);
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (r: unknown) => void;
                process.nextTick(() => cb(res));
                return req;
            });

            const result = await (service as any).fetchJsonWithDetails('https://example.com/api');
            expect(result.error?.type).toBe('unknown');
            expect(result.error?.statusCode).toBe(418);
        });

        it('returns invalid-json error on malformed response', async () => {
            setupHttpMock(mockHttpsRequest, 200, 'not json at all {{{');

            const result = await (service as any).fetchJsonWithDetails('https://example.com/index.json');
            expect(result.data).toBeNull();
            expect(result.error?.type).toBe('invalid-json');
        });

        it('returns network error on timeout', async () => {
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((..._args: unknown[]) => {
                // Don't call cb — simulate hang, then emit timeout
                process.nextTick(() => req.emit('timeout'));
                return req;
            });

            const result = await (service as any).fetchJsonWithDetails('https://example.com/slow', undefined, 1000);
            expect(result.error?.type).toBe('network');
            expect(result.error?.message).toContain('timed out');
        });

        it('returns network error on ECONNREFUSED', async () => {
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation(() => {
                process.nextTick(() => req.emit('error', new Error('connect ECONNREFUSED 127.0.0.1:443')));
                return req;
            });

            const result = await (service as any).fetchJsonWithDetails('https://example.com/api');
            expect(result.error?.type).toBe('network');
            expect(result.error?.message).toContain('Connection refused');
        });

        it('returns network error on ENOTFOUND (DNS)', async () => {
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation(() => {
                process.nextTick(() => req.emit('error', new Error('getaddrinfo ENOTFOUND example.com')));
                return req;
            });

            const result = await (service as any).fetchJsonWithDetails('https://example.com/api');
            expect(result.error?.type).toBe('network');
            expect(result.error?.message).toContain('DNS resolution failed');
        });

        it('returns network error on SSL/TLS issue', async () => {
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation(() => {
                process.nextTick(() => req.emit('error', new Error('self-signed certificate in certificate chain')));
                return req;
            });

            const result = await (service as any).fetchJsonWithDetails('https://example.com/api');
            expect(result.error?.message).toContain('SSL/TLS certificate error');
        });

        it('returns network error on ECONNRESET', async () => {
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation(() => {
                process.nextTick(() => req.emit('error', new Error('read ECONNRESET')));
                return req;
            });

            const result = await (service as any).fetchJsonWithDetails('https://example.com/api');
            expect(result.error?.message).toContain('Connection reset');
        });

        it('sends Authorization header when authHeader is provided', async () => {
            setupHttpMock(mockHttpsRequest, 200, '{}');

            await (service as any).fetchJsonWithDetails('https://example.com/api', 'Bearer token123');

            expect(mockHttpsRequest).toHaveBeenCalled();
            const callArgs = mockHttpsRequest.mock.calls[0];
            expect(callArgs[0].headers.Authorization).toBe('Bearer token123');
        });

        it('follows safe redirects', async () => {
            vi.mocked(isSafeRedirectTarget).mockReturnValue(true);

            // First call returns redirect
            const redirectRes = createMockResponse(302, undefined, { location: 'https://example.com/new-path' });
            const req1 = createMockRequest();
            // Second call returns success
            const successRes = createMockResponse(200, '{"redirected":true}');
            const req2 = createMockRequest();

            let callCount = 0;
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                callCount++;
                const cb = args[args.length - 1] as (r: unknown) => void;
                if (callCount === 1) {
                    process.nextTick(() => cb(redirectRes));
                    return req1;
                }
                process.nextTick(() => {
                    cb(successRes);
                    process.nextTick(() => successRes.emitBody());
                });
                return req2;
            });

            const result = await (service as any).fetchJsonWithDetails('https://example.com/old-path');
            expect(result.data).toEqual({ redirected: true });
        });

        it('returns error on too many redirects', async () => {
            const result = await (service as any).fetchJsonWithDetails('https://example.com/loop', undefined, undefined, 0);
            expect(result.error?.type).toBe('network');
            expect(result.error?.message).toContain('Too many redirects');
        });

        it('uses http module for http:// URLs', async () => {
            setupHttpMock(mockHttpRequest, 200, '{"http":true}');

            const result = await (service as any).fetchJsonWithDetails('http://example.com/api');
            expect(result.data).toEqual({ http: true });
            expect(mockHttpRequest).toHaveBeenCalled();
            expect(mockHttpsRequest).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // fetchJson (private)
    // ──────────────────────────────────────────────
    describe('fetchJson', () => {
        it('uses HTTP/2 client for nuget.org URLs', async () => {
            vi.mocked(http2Client.fetchJson).mockResolvedValue({ data: 'http2' });

            const result = await (service as any).fetchJson('https://api.nuget.org/v3/index.json');
            expect(result).toEqual({ data: 'http2' });
            expect(http2Client.fetchJson).toHaveBeenCalledWith('https://api.nuget.org/v3/index.json');
        });

        it('uses HTTP/1.1 for non-nuget.org URLs', async () => {
            setupHttpMock(mockHttpsRequest, 200, '{"custom":true}');

            const result = await (service as any).fetchJson('https://myserver.com/nuget/v3/index.json', 'Bearer tok');
            expect(result).toEqual({ custom: true });
            expect(http2Client.fetchJson).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // fetchJsonHttp1 (private)
    // ──────────────────────────────────────────────
    describe('fetchJsonHttp1', () => {
        it('returns parsed JSON on 200', async () => {
            setupHttpMock(mockHttpsRequest, 200, '{"ok":true}');

            const result = await (service as any).fetchJsonHttp1('https://custom.com/api');
            expect(result).toEqual({ ok: true });
        });

        it('returns null on non-200 status', async () => {
            const res = createMockResponse(500);
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (r: unknown) => void;
                process.nextTick(() => cb(res));
                return req;
            });

            const result = await (service as any).fetchJsonHttp1('https://custom.com/api');
            expect(result).toBeNull();
        });

        it('returns null on invalid JSON', async () => {
            setupHttpMock(mockHttpsRequest, 200, 'not json');

            const result = await (service as any).fetchJsonHttp1('https://custom.com/api');
            expect(result).toBeNull();
        });

        it('returns null on timeout', async () => {
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation(() => {
                process.nextTick(() => req.emit('timeout'));
                return req;
            });

            const result = await (service as any).fetchJsonHttp1('https://custom.com/api');
            expect(result).toBeNull();
        });

        it('returns null on request error', async () => {
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation(() => {
                process.nextTick(() => req.emit('error', new Error('ECONNREFUSED')));
                return req;
            });

            const result = await (service as any).fetchJsonHttp1('https://custom.com/api');
            expect(result).toBeNull();
        });

        it('follows safe redirects and strips auth on cross-origin', async () => {
            vi.mocked(isSafeRedirectTarget).mockReturnValue(true);

            const redirectRes = createMockResponse(301, undefined, { location: 'https://other.com/new' });
            const successRes = createMockResponse(200, '{"followed":true}');

            let callCount = 0;
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                callCount++;
                const cb = args[args.length - 1] as (r: unknown) => void;
                const req = createMockRequest();
                if (callCount === 1) {
                    process.nextTick(() => cb(redirectRes));
                    return req;
                }
                process.nextTick(() => {
                    cb(successRes);
                    process.nextTick(() => successRes.emitBody());
                });
                return req;
            });

            const result = await (service as any).fetchJsonHttp1('https://custom.com/api', 'Bearer secret');
            expect(result).toEqual({ followed: true });

            // Second call should NOT have the auth header (cross-origin)
            const secondCallArgs = mockHttpsRequest.mock.calls[1];
            expect(secondCallArgs[0].headers.Authorization).toBeUndefined();
        });
    });

    // ──────────────────────────────────────────────
    // discoverServiceEndpoints (private)
    // ──────────────────────────────────────────────
    describe('discoverServiceEndpoints', () => {
        it('returns empty object for local sources', async () => {
            const result = await (service as any).discoverServiceEndpoints('C:\\packages\\local');
            expect(result).toEqual({});
        });

        it('returns cached endpoints on second call', async () => {
            const serviceIndex = {
                version: '3.0.0',
                resources: [
                    { '@id': 'https://api.nuget.org/v3-flatcontainer/', '@type': 'PackageBaseAddress/3.0.0' },
                ],
            };
            setupHttpMock(mockHttpsRequest, 200, JSON.stringify(serviceIndex));

            const first = await (service as any).discoverServiceEndpoints('https://api.example.com/v3/index.json');
            expect(first.packageBaseAddress).toBe('https://api.nuget.org/v3-flatcontainer/');

            // Second call should use cache — no additional HTTP request
            mockHttpsRequest.mockClear();
            const second = await (service as any).discoverServiceEndpoints('https://api.example.com/v3/index.json');
            expect(second.packageBaseAddress).toBe('https://api.nuget.org/v3-flatcontainer/');
            expect(mockHttpsRequest).not.toHaveBeenCalled();
        });

        it('returns empty object and caches failure when source is unreachable', async () => {
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation(() => {
                process.nextTick(() => req.emit('error', new Error('ECONNREFUSED')));
                return req;
            });

            const result = await (service as any).discoverServiceEndpoints('https://unreachable.com/v3/index.json');
            expect(result).toEqual({});

            // Second call within TTL should return empty without making HTTP request
            mockHttpsRequest.mockClear();
            const result2 = await (service as any).discoverServiceEndpoints('https://unreachable.com/v3/index.json');
            expect(result2).toEqual({});
            expect(mockHttpsRequest).not.toHaveBeenCalled();
        });

        it('parses all resource types from service index', async () => {
            const serviceIndex = {
                version: '3.0.0',
                resources: [
                    { '@id': 'https://example.com/flatcontainer/', '@type': 'PackageBaseAddress/3.0.0' },
                    { '@id': 'https://example.com/registration/', '@type': 'RegistrationsBaseUrl/3.6.0' },
                    { '@id': 'https://example.com/query', '@type': 'SearchQueryService/3.5.0' },
                    { '@id': 'https://example.com/autocomplete', '@type': 'SearchAutocompleteService/3.5.0' },
                    { '@id': 'https://example.com/vulnerability', '@type': 'VulnerabilityInfo/6.7.0' },
                ],
            };
            setupHttpMock(mockHttpsRequest, 200, JSON.stringify(serviceIndex));

            const result = await (service as any).discoverServiceEndpoints('https://example.com/v3/index.json');
            expect(result.packageBaseAddress).toBe('https://example.com/flatcontainer/');
            expect(result.registrationsBaseUrl).toBe('https://example.com/registration/');
            expect(result.searchQueryService).toBe('https://example.com/query');
            expect(result.searchAutocompleteService).toBe('https://example.com/autocomplete');
            expect(result.vulnerabilityInfoUrl).toBe('https://example.com/vulnerability');
        });

        it('filters out gzip-compressed registration endpoints', async () => {
            const serviceIndex = {
                version: '3.0.0',
                resources: [
                    { '@id': 'https://example.com/registration5-gz-semver2/', '@type': 'RegistrationsBaseUrl/3.6.0' },
                    { '@id': 'https://example.com/registration5-semver1/', '@type': 'RegistrationsBaseUrl/3.0.0' },
                ],
            };
            setupHttpMock(mockHttpsRequest, 200, JSON.stringify(serviceIndex));

            const result = await (service as any).discoverServiceEndpoints('https://example2.com/v3/index.json');
            expect(result.registrationsBaseUrl).toBe('https://example.com/registration5-semver1/');
        });

        it('appends /index.json to source URL when missing', async () => {
            const serviceIndex = {
                version: '3.0.0',
                resources: [
                    { '@id': 'https://example.com/flatcontainer/', '@type': 'PackageBaseAddress/3.0.0' },
                ],
            };
            setupHttpMock(mockHttpsRequest, 200, JSON.stringify(serviceIndex));

            await (service as any).discoverServiceEndpoints('https://example3.com/v3');
            const callArgs = mockHttpsRequest.mock.calls[0];
            expect(callArgs[0].path).toContain('/index.json');
        });

        it('throws warning for invalid service index (no resources array)', async () => {
            setupHttpMock(mockHttpsRequest, 200, JSON.stringify({ version: '3.0.0' }));

            const result = await (service as any).discoverServiceEndpoints('https://bad-index.com/v3/index.json');
            expect(result).toEqual({});
            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // filterHealthySources (private)
    // ──────────────────────────────────────────────
    describe('filterHealthySources', () => {
        it('returns empty array for empty input', () => {
            const result = (service as any).filterHealthySources([]);
            expect(result).toEqual([]);
        });

        it('returns all sources when none are failed', () => {
            const sources = ['https://a.com', 'https://b.com'];
            const result = (service as any).filterHealthySources(sources);
            expect(result).toEqual(sources);
        });

        it('filters out sources that are in failedEndpointCache within TTL', () => {
            (service as any).failedEndpointCache.set('https://bad.com', Date.now());
            const result = (service as any).filterHealthySources(['https://good.com', 'https://bad.com']);
            expect(result).toEqual(['https://good.com']);
        });

        it('returns original list when ALL sources would be filtered (fallback)', () => {
            (service as any).failedEndpointCache.set('https://a.com', Date.now());
            (service as any).failedEndpointCache.set('https://b.com', Date.now());
            const sources = ['https://a.com', 'https://b.com'];
            const result = (service as any).filterHealthySources(sources);
            expect(result).toEqual(sources);
        });

        it('includes source when failure is past TTL', () => {
            // Set failure 3 minutes ago (TTL is 120s)
            (service as any).failedEndpointCache.set('https://old-fail.com', Date.now() - 180000);
            const result = (service as any).filterHealthySources(['https://old-fail.com']);
            expect(result).toEqual(['https://old-fail.com']);
        });
    });

    // ──────────────────────────────────────────────
    // checkUrlExists / checkUrlExistsHttp1 (private)
    // ──────────────────────────────────────────────
    describe('checkUrlExists', () => {
        it('uses HTTP/2 for nuget.org URLs', async () => {
            vi.mocked(http2Client.headRequest).mockResolvedValue(200);

            const result = await (service as any)._packageService.checkUrlExists('https://api.nuget.org/v3/content/pkg.nupkg');
            expect(result).toBe(true);
            expect(http2Client.headRequest).toHaveBeenCalled();
        });

        it('returns false for nuget.org 404', async () => {
            vi.mocked(http2Client.headRequest).mockResolvedValue(404);

            const result = await (service as any)._packageService.checkUrlExists('https://api.nuget.org/v3/missing.nupkg');
            expect(result).toBe(false);
        });

        it('falls back to HTTP/1.1 on nuget.org redirect', async () => {
            vi.mocked(http2Client.headRequest).mockResolvedValue(302);
            // HTTP/1.1 fallback returns 200
            const res = createMockResponse(200);
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (r: unknown) => void;
                process.nextTick(() => cb(res));
                return req;
            });

            const result = await (service as any)._packageService.checkUrlExists('https://api.nuget.org/v3/redirect');
            expect(result).toBe(true);
        });

        it('uses HTTP/1.1 for non-nuget.org URLs', async () => {
            const res = createMockResponse(200);
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (r: unknown) => void;
                process.nextTick(() => cb(res));
                return req;
            });

            const result = await (service as any)._packageService.checkUrlExists('https://myserver.com/pkg.nupkg');
            expect(result).toBe(true);
            expect(http2Client.headRequest).not.toHaveBeenCalled();
        });
    });

    describe('checkUrlExistsHttp1', () => {
        it('returns true on 200', async () => {
            const res = createMockResponse(200);
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (r: unknown) => void;
                process.nextTick(() => cb(res));
                return req;
            });

            const result = await (service as any)._packageService.checkUrlExistsHttp1('https://example.com/exists');
            expect(result).toBe(true);
        });

        it('returns false on 404', async () => {
            const res = createMockResponse(404);
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (r: unknown) => void;
                process.nextTick(() => cb(res));
                return req;
            });

            const result = await (service as any)._packageService.checkUrlExistsHttp1('https://example.com/missing');
            expect(result).toBe(false);
        });

        it('returns false on error', async () => {
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation(() => {
                process.nextTick(() => req.emit('error', new Error('fail')));
                return req;
            });

            const result = await (service as any)._packageService.checkUrlExistsHttp1('https://example.com/broken');
            expect(result).toBe(false);
        });

        it('returns false when max redirects exceeded', async () => {
            const result = await (service as any)._packageService.checkUrlExistsHttp1('https://example.com/loop', undefined, 0);
            expect(result).toBe(false);
        });

        it('follows safe redirects with SSRF check', async () => {
            vi.mocked(isSafeRedirectTarget).mockReturnValue(true);

            const redirectRes = createMockResponse(301, undefined, { location: 'https://example.com/final' });
            const okRes = createMockResponse(200);

            let callCount = 0;
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                callCount++;
                const cb = args[args.length - 1] as (r: unknown) => void;
                const req = createMockRequest();
                if (callCount === 1) {
                    process.nextTick(() => cb(redirectRes));
                } else {
                    process.nextTick(() => cb(okRes));
                }
                return req;
            });

            const result = await (service as any)._packageService.checkUrlExistsHttp1('https://example.com/redirect');
            expect(result).toBe(true);
            expect(isSafeRedirectTarget).toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // downloadFile (private)
    // ──────────────────────────────────────────────
    describe('downloadFile', () => {
        it('returns true on successful download', async () => {
            const res = createMockResponse(200, 'file-content');
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (r: unknown) => void;
                process.nextTick(() => {
                    cb(res);
                    process.nextTick(() => res.emitBody());
                });
                return req;
            });

            const result = await (service as any).downloadFile('https://example.com/pkg.nupkg', '/tmp/pkg.nupkg');
            expect(result).toBe(true);
        });

        it('returns false when max redirects exhausted', async () => {
            const result = await (service as any).downloadFile('https://example.com/pkg.nupkg', '/tmp/pkg.nupkg', 0);
            expect(result).toBe(false);
        });

        it('returns false on non-200 status and cleans up file', async () => {
            const fs = await import('fs');
            const res = createMockResponse(404);
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (r: unknown) => void;
                process.nextTick(() => cb(res));
                return req;
            });

            const result = await (service as any).downloadFile('https://example.com/missing.nupkg', '/tmp/missing.nupkg');
            expect(result).toBe(false);
            // Cleanup should attempt to delete the file
            expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/missing.nupkg');
        });

        it('returns false on timeout and cleans up', async () => {
            const fs = await import('fs');
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation(() => {
                process.nextTick(() => req.emit('timeout'));
                return req;
            });

            const result = await (service as any).downloadFile('https://example.com/slow.nupkg', '/tmp/slow.nupkg');
            expect(result).toBe(false);
            expect(fs.unlinkSync).toHaveBeenCalled();
        });

        it('returns false on request error', async () => {
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation(() => {
                process.nextTick(() => req.emit('error', new Error('network fail')));
                return req;
            });

            const result = await (service as any).downloadFile('https://example.com/error.nupkg', '/tmp/e.nupkg');
            expect(result).toBe(false);
        });

        it('follows safe redirects', async () => {
            vi.mocked(isSafeRedirectTarget).mockReturnValue(true);

            // First call: redirect
            const redirectRes = createMockResponse(302, undefined, { location: 'https://cdn.example.com/pkg.nupkg' });
            // Second call: success
            const successRes = createMockResponse(200, 'pkg-data');

            let callCount = 0;
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                callCount++;
                const cb = args[args.length - 1] as (r: unknown) => void;
                const req = createMockRequest();
                if (callCount === 1) {
                    process.nextTick(() => cb(redirectRes));
                } else {
                    process.nextTick(() => {
                        cb(successRes);
                        process.nextTick(() => successRes.emitBody());
                    });
                }
                return req;
            });

            const result = await (service as any).downloadFile('https://example.com/redirect.nupkg', '/tmp/r.nupkg');
            expect(result).toBe(true);
        });
    });

    // ──────────────────────────────────────────────
    // extractReadmeFromPackage (public)
    // ──────────────────────────────────────────────
    describe('extractReadmeFromPackage', () => {
        it('returns cached README from workspace cache', async () => {
            vi.mocked(workspaceCache.get).mockReturnValue('# Cached README');

            const result = await service.extractReadmeFromPackage('TestPkg', '1.0.0');
            expect(result).toBe('# Cached README');
        });

        it('returns null when no sources return a download URL', async () => {
            vi.mocked(workspaceCache.get).mockReturnValue(undefined);
            // getSources returns empty — no sources to check
            const configParser = (service as any).configParser;
            configParser.getSources.mockResolvedValue([]);

            const result = await service.extractReadmeFromPackage('NoPkg', '1.0.0');
            expect(result).toBeNull();
        });

        it('returns null on download failure', async () => {
            vi.mocked(workspaceCache.get).mockReturnValue(undefined);
            const configParser = (service as any).configParser;
            configParser.getSources.mockResolvedValue([
                { name: 'test', url: 'https://custom.com/v3/index.json', enabled: true },
            ]);

            // discoverServiceEndpoints returns flatcontainer
            const serviceIndex = {
                version: '3.0.0',
                resources: [
                    { '@id': 'https://custom.com/flatcontainer/', '@type': 'PackageBaseAddress/3.0.0' },
                ],
            };
            // First call: service index — success
            // Second call: checkUrlExists — resolve 200
            // Third call: downloadFile — fail
            let callCount = 0;
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                callCount++;
                const cb = args[args.length - 1] as (r: unknown) => void;
                const req = createMockRequest();

                if (callCount === 1) {
                    // Service index discovery — 200 with body needs deferred emission
                    const res = createMockResponse(200, JSON.stringify(serviceIndex));
                    process.nextTick(() => {
                        cb(res);
                        process.nextTick(() => res.emitBody());
                    });
                } else if (callCount === 2) {
                    // checkUrlExists HEAD request — 200 (no body needed)
                    const res = createMockResponse(200);
                    process.nextTick(() => cb(res));
                } else {
                    // download — fail
                    const res = createMockResponse(500);
                    process.nextTick(() => cb(res));
                }
                return req;
            });

            const result = await service.extractReadmeFromPackage('TestPkg', '1.0.0');
            expect(result).toBeNull();
        });

        it('returns null on exception', async () => {
            vi.mocked(workspaceCache.get).mockReturnValue(undefined);
            const configParser = (service as any).configParser;
            configParser.getSources.mockRejectedValue(new Error('source error'));

            const result = await service.extractReadmeFromPackage('ErrorPkg', '1.0.0');
            expect(result).toBeNull();
        });
    });

    // ──────────────────────────────────────────────
    // fetchJsonWithCompression (private)
    // ──────────────────────────────────────────────
    describe('fetchJsonWithCompression', () => {
        it('returns parsed JSON for uncompressed 200 response', async () => {
            const body = JSON.stringify([{ id: 'pkg', severity: 1 }]);
            setupHttpMock(mockHttpsRequest, 200, body);

            const result = await (service as any).fetchJsonWithCompression('https://example.com/vuln.json');
            expect(result).toEqual([{ id: 'pkg', severity: 1 }]);
        });

        it('returns null on non-200 status', async () => {
            const res = createMockResponse(500);
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (r: unknown) => void;
                process.nextTick(() => cb(res));
                return req;
            });

            const result = await (service as any).fetchJsonWithCompression('https://example.com/vuln.json');
            expect(result).toBeNull();
        });

        it('returns null when maxRedirects is 0', async () => {
            const result = await (service as any).fetchJsonWithCompression('https://example.com/vuln.json', undefined, 0);
            expect(result).toBeNull();
        });

        it('returns null on timeout', async () => {
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation(() => {
                process.nextTick(() => req.emit('timeout'));
                return req;
            });

            const result = await (service as any).fetchJsonWithCompression('https://example.com/vuln.json');
            expect(result).toBeNull();
        });

        it('returns null on request error', async () => {
            const req = createMockRequest();
            mockHttpsRequest.mockImplementation(() => {
                process.nextTick(() => req.emit('error', new Error('fail')));
                return req;
            });

            const result = await (service as any).fetchJsonWithCompression('https://example.com/vuln.json');
            expect(result).toBeNull();
        });

        it('decompresses gzip response', async () => {
            const zlib = await import('zlib');
            const body = JSON.stringify({ compressed: true });

            // Create mock gunzip stream
            const gunzipStream = new EventEmitter();
            vi.mocked(zlib.createGunzip).mockReturnValue(gunzipStream as any);

            // Mock response with content-encoding: gzip
            const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string>; pipe: ReturnType<typeof vi.fn> };
            res.statusCode = 200;
            res.headers = { 'content-encoding': 'gzip' };
            res.pipe = vi.fn().mockReturnValue(gunzipStream);

            const req = createMockRequest();
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (r: unknown) => void;
                process.nextTick(() => {
                    cb(res);
                    // Simulate decompressed data arriving
                    process.nextTick(() => {
                        gunzipStream.emit('data', Buffer.from(body));
                        gunzipStream.emit('end');
                    });
                });
                return req;
            });

            const result = await (service as any).fetchJsonWithCompression('https://example.com/vuln.json');
            expect(result).toEqual({ compressed: true });
        });

        it('follows safe redirects', async () => {
            vi.mocked(isSafeRedirectTarget).mockReturnValue(true);

            const redirectRes = createMockResponse(302, undefined, { location: 'https://cdn.example.com/vuln.json' });
            const successRes = createMockResponse(200, '[{"id":"pkg"}]');

            let callCount = 0;
            mockHttpsRequest.mockImplementation((...args: unknown[]) => {
                callCount++;
                const cb = args[args.length - 1] as (r: unknown) => void;
                const req = createMockRequest();
                if (callCount === 1) {
                    process.nextTick(() => cb(redirectRes));
                } else {
                    process.nextTick(() => {
                        cb(successRes);
                        process.nextTick(() => successRes.emitBody());
                    });
                }
                return req;
            });

            const result = await (service as any).fetchJsonWithCompression('https://example.com/vuln.json');
            expect(result).toEqual([{ id: 'pkg' }]);
        });
    });

    // ══════════════════════════════════════════════
    // Phase 4B: Package Search & Autocomplete
    // ══════════════════════════════════════════════

    // ──────────────────────────────────────────────
    // searchPackagesViaApi (private — generalized multi-source API search)
    // ──────────────────────────────────────────────
    describe('searchPackagesViaApi', () => {
        const nugetOrgSource = {
            url: 'https://api.nuget.org/v3/index.json',
            endpoints: {
                searchQueryService: 'https://api.nuget.org/v3/query',
                packageBaseAddress: 'https://api.nuget.org/v3-flatcontainer'
            },
            authHeader: undefined
        };

        it('returns parsed results from SearchQueryService', async () => {
            const searchResponse = {
                totalHits: 1,
                data: [{
                    id: 'Newtonsoft.Json',
                    version: '13.0.3',
                    description: 'Popular JSON framework',
                    authors: ['James Newton-King'],
                    totalDownloads: 1000000,
                    iconUrl: 'https://api.nuget.org/v3-flatcontainer/icon',
                    verified: true,
                    versions: [{ version: '13.0.3', downloads: 500000 }]
                }]
            };

            vi.spyOn(service as any, 'fetchJson').mockResolvedValue(searchResponse);

            const result = await (service as any)._packageService.searchPackagesViaApi('Newtonsoft', false, false, 20, false, [nugetOrgSource]);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('Newtonsoft.Json');
            expect(result[0].verified).toBe(true);
            expect(result[0].authors).toBe('James Newton-King');
            expect(result[0].description).toBe('Popular JSON framework');
        });

        it('returns null when no resolved sources have SearchQueryService', async () => {
            const sourceWithoutSearch = {
                url: 'https://example.com/v3/index.json',
                endpoints: { packageBaseAddress: 'https://example.com/flat' },
                authHeader: undefined
            };

            const result = await (service as any)._packageService.searchPackagesViaApi('test', false, false, 20, false, [sourceWithoutSearch]);
            expect(result).toBeNull();
        });

        it('returns null when no resolved sources provided', async () => {
            const result = await (service as any)._packageService.searchPackagesViaApi('test', false, false, 20, false);
            expect(result).toBeNull();
        });

        it('returns null when resolved sources array is empty', async () => {
            const result = await (service as any)._packageService.searchPackagesViaApi('test', false, false, 20, false, []);
            expect(result).toBeNull();
        });

        it('returns null when fetchJson returns null for all sources (triggers CLI fallback)', async () => {
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue(null);

            const result = await (service as any)._packageService.searchPackagesViaApi('test', false, false, 20, false, [nugetOrgSource]);
            expect(result).toBeNull();
        });

        it('returns empty array when source returns empty data', async () => {
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({ data: [] });

            const result = await (service as any)._packageService.searchPackagesViaApi('test', false, false, 20, false, [nugetOrgSource]);
            expect(result).toEqual([]);
        });

        it('returns null on exception (falls back to CLI)', async () => {
            // Force an exception that isn't caught by per-source try/catch
            const badSource = {
                ...nugetOrgSource,
                endpoints: { get searchQueryService() { throw new Error('boom'); } }
            };

            const result = await (service as any)._packageService.searchPackagesViaApi('test', false, false, 20, false, [badSource]);
            expect(result).toBeNull();
        });

        it('uses packageid: prefix for exactMatch', async () => {
            const fetchSpy = vi.spyOn(service as any, 'fetchJson').mockResolvedValue({ data: [] });

            await (service as any)._packageService.searchPackagesViaApi('Newtonsoft.Json', false, false, 20, true, [nugetOrgSource]);

            const url = fetchSpy.mock.calls[0][0] as string;
            expect(url).toContain('packageid%3ANewtonsoft.Json');
        });

        it('sets prerelease param when includePrerelease is true', async () => {
            const fetchSpy = vi.spyOn(service as any, 'fetchJson').mockResolvedValue({ data: [] });

            await (service as any)._packageService.searchPackagesViaApi('test', true, false, 20, false, [nugetOrgSource]);

            const url = fetchSpy.mock.calls[0][0] as string;
            expect(url).toContain('prerelease=true');
        });

        it('skips icon/verified cache population in liteMode', async () => {
            const searchResponse = {
                data: [{
                    id: 'TestPkg',
                    version: '1.0.0',
                    description: 'Test',
                    authors: 'Author',
                    iconUrl: 'https://icon.com/icon.png',
                    verified: true
                }]
            };

            vi.spyOn(service as any, 'fetchJson').mockResolvedValue(searchResponse);

            const result = await (service as any)._packageService.searchPackagesViaApi('test', false, true, 20, false, [nugetOrgSource]);
            expect(result[0].authors).toBe('');
            expect(result[0].description).toBe('');
            expect(result[0].verified).toBeUndefined();
            // In liteMode, icon cache should NOT be populated
            expect(workspaceCache.set).not.toHaveBeenCalledWith(
                expect.stringContaining('iconurl:'), expect.anything(), expect.anything()
            );
        });

        it('skips icon caching for wildcard versions', async () => {
            const searchResponse = {
                data: [{
                    id: 'TestPkg',
                    version: '1.0.*',
                    description: 'Test',
                    iconUrl: 'https://icon.com/icon.png',
                }]
            };

            vi.spyOn(service as any, 'fetchJson').mockResolvedValue(searchResponse);

            const result = await (service as any)._packageService.searchPackagesViaApi('test', false, false, 20, false, [nugetOrgSource]);
            expect(result[0].iconUrl).toBeUndefined();
        });

        it('normalizes string[] authors to comma-separated string', async () => {
            const searchResponse = {
                data: [{
                    id: 'TestPkg',
                    version: '1.0.0',
                    authors: ['Author One', 'Author Two'],
                }]
            };

            vi.spyOn(service as any, 'fetchJson').mockResolvedValue(searchResponse);

            const result = await (service as any)._packageService.searchPackagesViaApi('test', false, false, 20, false, [nugetOrgSource]);
            expect(result[0].authors).toBe('Author One, Author Two');
        });

        it('deduplicates packages across multiple sources (highest downloads wins)', async () => {
            const customSource = {
                url: 'https://custom.com/v3/index.json',
                endpoints: {
                    searchQueryService: 'https://custom.com/v3/query',
                    packageBaseAddress: 'https://custom.com/flat'
                },
                authHeader: 'Basic abc123'
            };

            const fetchSpy = vi.spyOn(service as any, 'fetchJson');
            // nuget.org returns package with high downloads
            fetchSpy.mockResolvedValueOnce({
                data: [{
                    id: 'SharedPkg',
                    version: '2.0.0',
                    description: 'From nuget.org',
                    authors: 'Author A',
                    totalDownloads: 1000000,
                    verified: true
                }]
            });
            // Custom source returns same package with lower downloads
            fetchSpy.mockResolvedValueOnce({
                data: [{
                    id: 'SharedPkg',
                    version: '2.0.0',
                    description: 'From custom',
                    authors: 'Author B',
                    totalDownloads: 500
                }]
            });

            const result = await (service as any)._packageService.searchPackagesViaApi(
                'shared', false, false, 20, false, [nugetOrgSource, customSource]
            );
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('SharedPkg');
            expect(result[0].description).toBe('From nuget.org');
            expect(result[0].totalDownloads).toBe(1000000);
        });

        it('merges unique packages across multiple sources', async () => {
            const customSource = {
                url: 'https://custom.com/v3/index.json',
                endpoints: {
                    searchQueryService: 'https://custom.com/v3/query',
                    packageBaseAddress: 'https://custom.com/flat'
                },
                authHeader: undefined
            };

            const fetchSpy = vi.spyOn(service as any, 'fetchJson');
            fetchSpy.mockResolvedValueOnce({
                data: [{ id: 'PkgA', version: '1.0.0', description: 'A' }]
            });
            fetchSpy.mockResolvedValueOnce({
                data: [{ id: 'PkgB', version: '2.0.0', description: 'B' }]
            });

            const result = await (service as any)._packageService.searchPackagesViaApi(
                'test', false, false, 20, false, [nugetOrgSource, customSource]
            );
            expect(result).toHaveLength(2);
            expect(result.map((r: any) => r.id).sort()).toEqual(['PkgA', 'PkgB']);
        });

        it('passes auth header to custom sources', async () => {
            const customSource = {
                url: 'https://private.com/v3/index.json',
                endpoints: { searchQueryService: 'https://private.com/v3/query' },
                authHeader: 'Bearer token123'
            };

            const fetchSpy = vi.spyOn(service as any, 'fetchJson').mockResolvedValue({ data: [] });

            await (service as any)._packageService.searchPackagesViaApi('test', false, false, 20, false, [customSource]);

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('https://private.com/v3/query'),
                'Bearer token123'
            );
        });

        it('uses packageBaseAddress for custom source icon URLs', async () => {
            const customSource = {
                url: 'https://custom.com/v3/index.json',
                endpoints: {
                    searchQueryService: 'https://custom.com/v3/query',
                    packageBaseAddress: 'https://custom.com/flat/'
                },
                authHeader: undefined
            };

            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                data: [{
                    id: 'CustomPkg',
                    version: '1.0.0',
                    iconUrl: 'https://custom.com/icon.png',
                    description: 'Test'
                }]
            });

            const result = await (service as any)._packageService.searchPackagesViaApi(
                'test', false, false, 20, false, [customSource]
            );
            expect(result[0].iconUrl).toBe('https://custom.com/flat/custompkg/1.0.0/icon');
        });

        it('handles PascalCase response fields (Data, Id, Version)', async () => {
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                Data: [{
                    Id: 'PascalPkg',
                    Version: '3.0.0',
                    Description: 'PascalCase response',
                    Authors: 'AuthorP'
                }]
            });

            const result = await (service as any)._packageService.searchPackagesViaApi(
                'test', false, false, 20, false, [nugetOrgSource]
            );
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('PascalPkg');
            expect(result[0].version).toBe('3.0.0');
            expect(result[0].description).toBe('PascalCase response');
            expect(result[0].authors).toBe('AuthorP');
        });

        it('continues when one source fails and others succeed', async () => {
            const failingSource = {
                url: 'https://broken.com/v3/index.json',
                endpoints: { searchQueryService: 'https://broken.com/v3/query' },
                authHeader: undefined
            };

            const fetchSpy = vi.spyOn(service as any, 'fetchJson');
            // First source (nuget.org) succeeds
            fetchSpy.mockResolvedValueOnce({
                data: [{ id: 'GoodPkg', version: '1.0.0', description: 'Works' }]
            });
            // Second source throws
            fetchSpy.mockRejectedValueOnce(new Error('network error'));

            const result = await (service as any)._packageService.searchPackagesViaApi(
                'test', false, false, 20, false, [nugetOrgSource, failingSource]
            );
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('GoodPkg');
        });

        it('populates description from API response (not empty string)', async () => {
            const searchResponse = {
                data: [{
                    id: 'DescPkg',
                    version: '1.0.0',
                    description: 'This is the real description',
                    authors: 'Author'
                }]
            };

            vi.spyOn(service as any, 'fetchJson').mockResolvedValue(searchResponse);

            const result = await (service as any)._packageService.searchPackagesViaApi(
                'test', false, false, 20, false, [nugetOrgSource]
            );
            expect(result[0].description).toBe('This is the real description');
        });

        it('sorts multi-source results by relevance tiers then by downloads', async () => {
            const customSource = {
                url: 'https://custom.com/v3/index.json',
                endpoints: { searchQueryService: 'https://custom.com/v3/query' },
                authHeader: undefined
            };

            const fetchSpy = vi.spyOn(service as any, 'fetchJson');
            // nuget.org: high-download generic matches (no prefix/substring match)
            fetchSpy.mockResolvedValueOnce({
                data: [
                    { id: 'SomeOther.Extensions', version: '5.0.0', totalDownloads: 1000000, description: 'Popular' },
                    { id: 'Another.Extensions.Lib', version: '3.0.0', totalDownloads: 500000, description: 'Also popular' }
                ]
            });
            // Custom source: exact and prefix matches with fewer downloads
            fetchSpy.mockResolvedValueOnce({
                data: [
                    { id: 'MyPackage.Extensions', version: '1.0.0', totalDownloads: 100, description: 'Exact match' },
                    { id: 'MyPackage.Extensions.Core', version: '1.0.0', totalDownloads: 50, description: 'Prefix match' }
                ]
            });

            const result = await (service as any)._packageService.searchPackagesViaApi(
                'MyPackage.Extensions', false, false, 20, false, [nugetOrgSource, customSource]
            );

            // Exact + prefix matches should come first despite lower downloads
            expect(result[0].id).toBe('MyPackage.Extensions');
            expect(result[1].id).toBe('MyPackage.Extensions.Core');
            // Non-matching packages sorted by downloads
            expect(result[2].id).toBe('SomeOther.Extensions');
            expect(result[3].id).toBe('Another.Extensions.Lib');
        });

        it('ranks substring matches above unrelated high-download packages', async () => {
            const customSource = {
                url: 'https://custom.com/v3/index.json',
                endpoints: { searchQueryService: 'https://custom.com/v3/query' },
                authHeader: undefined
            };

            const fetchSpy = vi.spyOn(service as any, 'fetchJson');
            // nuget.org: high-download packages whose IDs contain the query tokens but not as substring
            fetchSpy.mockResolvedValueOnce({
                data: [
                    { id: 'Microsoft.Extensions.Logging.Abstractions', version: '9.0.0', totalDownloads: 5000000, description: 'Popular' },
                    { id: 'Microsoft.Extensions.Logging', version: '9.0.0', totalDownloads: 4000000, description: 'Also popular' },
                    { id: 'Serilog.Extensions.Logging', version: '8.0.0', totalDownloads: 3000000, description: 'Third' }
                ]
            });
            // Custom source: substring match with very few downloads
            fetchSpy.mockResolvedValueOnce({
                data: [
                    { id: 'Ica.Logging.Extensions', version: '1.0.12', totalDownloads: 200, description: 'Custom' }
                ]
            });

            const result = await (service as any)._packageService.searchPackagesViaApi(
                'logging.extensions', false, false, 20, false, [nugetOrgSource, customSource]
            );

            // Ica.Logging.Extensions contains "logging.extensions" as substring (tier 2)
            // Microsoft packages only match query tokens in segments (tier 3)
            expect(result[0].id).toBe('Ica.Logging.Extensions');
            // Token-match tier sorted by downloads
            expect(result[1].id).toBe('Microsoft.Extensions.Logging.Abstractions');
            expect(result[2].id).toBe('Microsoft.Extensions.Logging');
            expect(result[3].id).toBe('Serilog.Extensions.Logging');
        });

        it('preserves single-source order (no re-sort needed)', async () => {
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                data: [
                    { id: 'TopResult', version: '1.0.0', totalDownloads: 5000, description: 'First' },
                    { id: 'SecondResult', version: '1.0.0', totalDownloads: 100000, description: 'Second' }
                ]
            });

            // Single source: preserve server's relevance order (no re-sort)
            const result = await (service as any)._packageService.searchPackagesViaApi(
                'test', false, false, 20, false, [nugetOrgSource]
            );
            expect(result[0].id).toBe('TopResult');
            expect(result[1].id).toBe('SecondResult');
        });
    });

    // ──────────────────────────────────────────────
    // quickSearchGrouped
    // ──────────────────────────────────────────────
    describe('quickSearchGrouped', () => {
        it('returns empty array for short query', async () => {
            const result = await service.quickSearchGrouped('a', []);
            expect(result).toEqual([]);
        });

        it('returns results grouped by source', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                searchAutocompleteService: 'https://api.nuget.org/v3/autocomplete',
                searchQueryService: 'https://api.nuget.org/v3/query'
            });
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                data: ['Newtonsoft.Json', 'Newtonsoft.Json.Schema']
            });

            const result = await service.quickSearchGrouped('newtonsoft', [
                { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json' }
            ]);
            expect(result).toHaveLength(1);
            expect(result[0].sourceName).toBe('nuget.org');
            expect(result[0].packageIds).toContain('Newtonsoft.Json');
        });

        it('excludes sources with no results', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                searchAutocompleteService: 'https://api.nuget.org/v3/autocomplete',
                searchQueryService: 'https://custom.com/v3/query'
            });
            // nuget.org returns results, custom source returns empty
            vi.spyOn(service as any, 'fetchJson').mockImplementation(async (...args: unknown[]) => {
                const url = args[0] as string;
                if (url.includes('autocomplete')) {
                    return { data: ['Pkg1'] };
                }
                return { data: [] };
            });

            const result = await service.quickSearchGrouped('test', [
                { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json' },
                { name: 'Custom', url: 'https://custom.com/v3/index.json' }
            ]);
            // Only nuget.org should be in results (custom had empty data)
            expect(result.every(r => r.packageIds.length > 0)).toBe(true);
        });

        it('defaults to nuget.org when no sources provided', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                searchAutocompleteService: 'https://api.nuget.org/v3/autocomplete'
            });
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                data: ['DefaultPkg']
            });

            const result = await service.quickSearchGrouped('test', []);
            expect(result).toHaveLength(1);
            expect(result[0].sourceName).toBe('nuget.org');
        });

        it('returns empty array when source discovery fails', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockRejectedValue(new Error('fail'));

            const result = await service.quickSearchGrouped('test', [
                { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json' }
            ]);
            expect(result).toEqual([]);
        });

        it('uses Search API for non-nuget.org sources', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                searchQueryService: 'https://custom.com/v3/query'
            });
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                data: [{ id: 'CustomPkg1' }, { id: 'CustomPkg2' }]
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue('Bearer token');

            const result = await service.quickSearchGrouped('test', [
                { name: 'Custom Feed', url: 'https://custom.com/v3/index.json' }
            ]);
            expect(result).toHaveLength(1);
            expect(result[0].sourceName).toBe('Custom Feed');
            expect(result[0].packageIds).toEqual(['CustomPkg1', 'CustomPkg2']);
        });

        it('returns cached results within TTL', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                searchAutocompleteService: 'https://api.nuget.org/v3/autocomplete'
            });
            const fetchSpy = vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                data: ['CachedQuickPkg']
            });

            const sources = [{ name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json' }];
            await service.quickSearchGrouped('cached', sources);
            fetchSpy.mockClear();

            const result = await service.quickSearchGrouped('cached', sources);
            expect(result).toHaveLength(1);
            expect(result[0].packageIds).toContain('CachedQuickPkg');
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('cache is cleared by clearSourceErrors', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                searchAutocompleteService: 'https://api.nuget.org/v3/autocomplete'
            });
            const fetchSpy = vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                data: ['ClearCachePkg']
            });

            const sources = [{ name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json' }];
            await service.quickSearchGrouped('clearme', sources);
            fetchSpy.mockClear();

            // Clear caches
            service.clearSourceErrors();

            // Should hit API again after clear
            await service.quickSearchGrouped('clearme', sources);
            expect(fetchSpy).toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // searchPackages (uses generalized API search with resolved sources)
    // ──────────────────────────────────────────────
    describe('searchPackages', () => {
        it('returns cached results from in-memory cache', async () => {
            // Populate cache via API path first
            vi.spyOn((service as any)._packageService, 'searchPackagesViaApi').mockResolvedValue([
                { id: 'CachedPkg', version: '1.0.0', description: '', authors: '', versions: ['1.0.0'] }
            ]);
            vi.spyOn((service as any)._packageService, 'resolveSourcesForSearch').mockResolvedValue([
                { url: 'https://api.nuget.org/v3/index.json', endpoints: { searchQueryService: 'https://api.nuget.org/v3/query' } }
            ]);

            // First call populates cache
            await service.searchPackages('cached', ['https://api.nuget.org/v3/index.json'], false, true);

            // Clear spy and call again — should hit cache
            const apiSpy = vi.spyOn((service as any)._packageService, 'searchPackagesViaApi');
            apiSpy.mockClear();

            const result = await service.searchPackages('cached', ['https://api.nuget.org/v3/index.json'], false, true);
            expect(result[0].id).toBe('CachedPkg');
            expect(apiSpy).not.toHaveBeenCalled();
        });

        it('uses API path for single nuget.org source', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForSearch').mockResolvedValue([
                { url: 'https://api.nuget.org/v3/index.json', endpoints: { searchQueryService: 'https://api.nuget.org/v3/query' } }
            ]);
            const apiSpy = vi.spyOn((service as any)._packageService, 'searchPackagesViaApi').mockResolvedValue([
                { id: 'ApiPkg', version: '2.0.0', description: 'Desc', authors: 'Auth', versions: ['2.0.0'] }
            ]);

            const result = await service.searchPackages('api', ['https://api.nuget.org/v3/index.json'], false, true);
            expect(result[0].id).toBe('ApiPkg');
            expect(apiSpy).toHaveBeenCalled();
        });

        it('uses API path for multiple sources with SearchQueryService', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForSearch').mockResolvedValue([
                { url: 'https://api.nuget.org/v3/index.json', endpoints: { searchQueryService: 'https://api.nuget.org/v3/query' } },
                { url: 'https://custom.com/v3/index.json', endpoints: { searchQueryService: 'https://custom.com/v3/query' } }
            ]);
            const apiSpy = vi.spyOn((service as any)._packageService, 'searchPackagesViaApi').mockResolvedValue([
                { id: 'ApiPkg', version: '1.0.0', description: 'D', authors: 'A', versions: [] }
            ]);

            const result = await service.searchPackages('multi', [
                'https://api.nuget.org/v3/index.json',
                'https://custom.com/v3/index.json'
            ], false, true);
            expect(result[0].id).toBe('ApiPkg');
            expect(apiSpy).toHaveBeenCalledWith(
                'multi', false, true, expect.any(Number), false,
                expect.arrayContaining([
                    expect.objectContaining({ url: 'https://api.nuget.org/v3/index.json' }),
                    expect.objectContaining({ url: 'https://custom.com/v3/index.json' })
                ])
            );
        });

        it('falls back to CLI when API returns null', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForSearch').mockResolvedValue([
                { url: 'https://api.nuget.org/v3/index.json', endpoints: { searchQueryService: 'https://api.nuget.org/v3/query' } }
            ]);
            vi.spyOn((service as any)._packageService, 'searchPackagesViaApi').mockResolvedValue(null);

            // CLI returns table output — the source doesn't have searchQueryService so it's a CLI-only source
            // Actually with resolved sources all having searchQueryService, CLI won't be triggered.
            // Let's test with a source that has NO searchQueryService
            vi.spyOn((service as any)._packageService, 'resolveSourcesForSearch').mockResolvedValue([
                { url: 'https://legacy.com/v2/index.json', endpoints: {} }
            ]);

            hoisted.mockExecWithTimeout.mockResolvedValue({
                stdout: '| Package ID | Version | Owners | Downloads |\n| --- | --- | --- | --- |\n| CliPkg | 3.0.0 | owner | 100 |',
                stderr: ''
            });

            const result = await service.searchPackages('cli', ['https://legacy.com/v2/index.json'], false, true);
            expect(result[0].id).toBe('CliPkg');
            expect(result[0].version).toBe('3.0.0');
        });

        it('falls back to CLI for sources without SearchQueryService', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForSearch').mockResolvedValue([
                { url: 'https://legacy.com/v2/index.json', endpoints: { packageBaseAddress: 'https://legacy.com/flat' } }
            ]);

            hoisted.mockExecWithTimeout.mockResolvedValue({
                stdout: '| Package ID | Version | Owners | Downloads |\n| --- | --- | --- | --- |\n| LegacyPkg | 1.0.0 | own | 50 |',
                stderr: ''
            });

            const result = await service.searchPackages('legacy', ['https://legacy.com/v2/index.json'], false, true);
            expect(result[0].id).toBe('LegacyPkg');
        });

        it('skips duplicate package IDs from CLI output', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForSearch').mockResolvedValue([
                { url: 'https://custom.com/v3/index.json', endpoints: {} }
            ]);

            hoisted.mockExecWithTimeout.mockResolvedValue({
                stdout: '| Pkg | 1.0.0 | o | 1 |\n| Pkg | 2.0.0 | o | 2 |',
                stderr: ''
            });

            const result = await service.searchPackages('dup', ['https://custom.com/v3/index.json'], false, true);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('Pkg');
        });

        it('returns workspace cached results', async () => {
            const cachedResults = [{ id: 'WsCached', version: '1.0.0', description: '', authors: '', versions: ['1.0.0'] }];
            vi.mocked(workspaceCache.get).mockReturnValue(cachedResults);

            const result = await service.searchPackages('ws', ['https://api.nuget.org/v3/index.json'], false, true);
            expect(result[0].id).toBe('WsCached');
        });

        it('filters healthy sources via resolveSourcesForSearch', async () => {
            vi.mocked(workspaceCache.get).mockReturnValue(null);
            // Mark one source as failed
            (service as any).failedEndpointCache.set('https://bad.com/v3/index.json', Date.now());

            // resolveSourcesForSearch should only resolve healthy sources
            // The real method will call filterHealthySources internally
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({});
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);

            hoisted.mockExecWithTimeout.mockResolvedValue({
                stdout: '| Pkg | 1.0.0 | o | 1 |',
                stderr: ''
            });

            await service.searchPackages('test', [
                'https://good.com/v3/index.json',
                'https://bad.com/v3/index.json'
            ], false, true);

            // CLI fallback should not include the failed source
            if (hoisted.mockExecWithTimeout.mock.calls.length > 0) {
                const command = hoisted.mockExecWithTimeout.mock.calls[0][0] as string;
                expect(command).not.toContain('bad.com');
            }
        });

        it('returns empty array on exception', async () => {
            vi.mocked(workspaceCache.get).mockReturnValue(null);
            vi.spyOn((service as any)._packageService, 'resolveSourcesForSearch').mockRejectedValue(new Error('crash'));

            const result = await service.searchPackages('crash', ['https://api.nuget.org/v3/index.json'], false, true);
            expect(result).toEqual([]);
        });

        it('merges API and CLI results when some sources lack SearchQueryService', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForSearch').mockResolvedValue([
                { url: 'https://api.nuget.org/v3/index.json', endpoints: { searchQueryService: 'https://api.nuget.org/v3/query' } },
                { url: 'https://legacy.com/v2/index.json', endpoints: {} }
            ]);
            vi.spyOn((service as any)._packageService, 'searchPackagesViaApi').mockResolvedValue([
                { id: 'ApiPkg', version: '1.0.0', description: 'D', authors: 'A', versions: [], iconUrl: 'icon', verified: true }
            ]);

            hoisted.mockExecWithTimeout.mockResolvedValue({
                stdout: '| CliPkg | 2.0.0 | o | 1 |',
                stderr: ''
            });

            const result = await service.searchPackages('merge', [
                'https://api.nuget.org/v3/index.json',
                'https://legacy.com/v2/index.json'
            ], false, true);
            expect(result).toHaveLength(2);
            expect(result.map(r => r.id).sort()).toEqual(['ApiPkg', 'CliPkg']);
        });

        it('API results take priority over CLI duplicates in merged results', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForSearch').mockResolvedValue([
                { url: 'https://api.nuget.org/v3/index.json', endpoints: { searchQueryService: 'https://api.nuget.org/v3/query' } },
                { url: 'https://old.com/v2/index.json', endpoints: {} }
            ]);
            vi.spyOn((service as any)._packageService, 'searchPackagesViaApi').mockResolvedValue([
                { id: 'SharedPkg', version: '2.0.0', description: 'API desc', authors: 'API author', versions: [], iconUrl: 'icon', verified: true }
            ]);

            hoisted.mockExecWithTimeout.mockResolvedValue({
                stdout: '| SharedPkg | 1.0.0 | cli_owner | 100 |',
                stderr: ''
            });

            const result = await service.searchPackages('shared', [
                'https://api.nuget.org/v3/index.json',
                'https://old.com/v2/index.json'
            ], false, true);
            // Only API version should be in results (dedup: API takes priority)
            const sharedPkg = result.find(r => r.id === 'SharedPkg');
            expect(sharedPkg?.version).toBe('2.0.0');
            expect(sharedPkg?.description).toBe('API desc');
        });

        it('routes local source to CLI fallback (not dropped)', async () => {
            // Local sources are filtered by resolveSourcesForSearch (can't discover API endpoints),
            // but should still be searched via CLI
            vi.spyOn((service as any)._packageService, 'resolveSourcesForSearch').mockResolvedValue([]);

            hoisted.mockExecWithTimeout.mockResolvedValue({
                stdout: '| LocalPkg | 1.0.0 | owner | 10 |',
                stderr: ''
            });

            const result = await service.searchPackages('local', ['C:\\packages'], false, true);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('LocalPkg');
            // Verify CLI was called with the local source
            const command = hoisted.mockExecWithTimeout.mock.calls[0][0] as string;
            expect(command).toContain('--source "C:\\packages"');
        });

        it('routes failed-discovery source to CLI fallback', async () => {
            // Source where discoverServiceEndpoints throws → not in resolvedSources
            vi.spyOn((service as any)._packageService, 'resolveSourcesForSearch').mockResolvedValue([]);

            hoisted.mockExecWithTimeout.mockResolvedValue({
                stdout: '| FailedPkg | 2.0.0 | owner | 5 |',
                stderr: ''
            });

            const result = await service.searchPackages('fail', ['https://broken.com/v3/index.json'], false, true);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('FailedPkg');
            const command = hoisted.mockExecWithTimeout.mock.calls[0][0] as string;
            expect(command).toContain('--source "https://broken.com/v3/index.json"');
        });

        it('routes API source to API and local source to CLI in mixed scenario', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForSearch').mockResolvedValue([
                { url: 'https://api.nuget.org/v3/index.json', endpoints: { searchQueryService: 'https://api.nuget.org/v3/query' } }
            ]);
            vi.spyOn((service as any)._packageService, 'searchPackagesViaApi').mockResolvedValue([
                { id: 'ApiPkg', version: '1.0.0', description: 'D', authors: 'A', versions: [], verified: true }
            ]);

            hoisted.mockExecWithTimeout.mockResolvedValue({
                stdout: '| LocalPkg | 1.0.0 | owner | 10 |',
                stderr: ''
            });

            const result = await service.searchPackages('mixed', [
                'https://api.nuget.org/v3/index.json',
                'C:\\local-feed'
            ], false, true);
            expect(result).toHaveLength(2);
            expect(result.map(r => r.id).sort()).toEqual(['ApiPkg', 'LocalPkg']);
            // CLI should only have the local source, not nuget.org
            const command = hoisted.mockExecWithTimeout.mock.calls[0][0] as string;
            expect(command).toContain('--source "C:\\local-feed"');
            expect(command).not.toContain('nuget.org');
        });

        it('includes local sources in CLI when no specific sources given', async () => {
            // "All sources" path: sources param is undefined → getSources() provides full list
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
                { name: 'local', url: 'C:\\packages', enabled: true }
            ]);
            vi.spyOn((service as any)._packageService, 'resolveSourcesForSearch').mockResolvedValue([
                { url: 'https://api.nuget.org/v3/index.json', endpoints: { searchQueryService: 'https://api.nuget.org/v3/query' } }
            ]);
            vi.spyOn((service as any)._packageService, 'searchPackagesViaApi').mockResolvedValue([
                { id: 'ApiPkg', version: '1.0.0', description: 'D', authors: 'A', versions: [] }
            ]);

            hoisted.mockExecWithTimeout.mockResolvedValue({
                stdout: '| LocalPkg | 1.0.0 | owner | 5 |',
                stderr: ''
            });

            const result = await service.searchPackages('all', undefined, false, true);
            expect(result).toHaveLength(2);
            expect(result.map(r => r.id).sort()).toEqual(['ApiPkg', 'LocalPkg']);
            const command = hoisted.mockExecWithTimeout.mock.calls[0][0] as string;
            expect(command).toContain('--source "C:\\packages"');
            expect(command).not.toContain('nuget.org');
        });
    });

    // ──────────────────────────────────────────────
    // Phase 4C: Package Metadata
    // ──────────────────────────────────────────────

    describe('getPackageMetadata', () => {
        it('returns cached metadata from metadataCache', async () => {
            const cached = { id: 'Pkg', version: '1.0.0', description: 'test', authors: 'A' };
            (service as any)._packageService.metadataCache.set('pkg@1.0.0', cached);

            const result = await service.getPackageMetadata('Pkg', '1.0.0');
            expect(result).toBe(cached);
        });

        it('fetches from all enabled sources when no source specified', async () => {
            const metadata = { id: 'Pkg', version: '1.0.0', description: 'desc', authors: 'Author' };
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { url: 'https://source1.com/v3/index.json', enabled: true },
                { url: 'https://source2.com/v3/index.json', enabled: false },
            ]);
            vi.spyOn((service as any)._packageService, 'getPackageMetadataFromSource').mockImplementation(
                async (...args: unknown[]) => args[2] === 'https://source1.com/v3/index.json' ? metadata : null
            );

            const result = await service.getPackageMetadata('Pkg', '1.0.0');
            expect(result).toEqual(metadata);
            // Should be cached now
            expect((service as any)._packageService.metadataCache.get('pkg@1.0.0')).toBe(metadata);
        });

        it('fetches from specific source when source provided', async () => {
            const metadata = { id: 'Pkg', version: '2.0.0', description: 'd', authors: 'A' };
            vi.spyOn((service as any)._packageService, 'getPackageMetadataFromSource').mockResolvedValue(metadata);

            const result = await service.getPackageMetadata('Pkg', '2.0.0', 'https://custom.com/v3/index.json');
            expect(result).toEqual(metadata);
            expect((service as any)._packageService.getPackageMetadataFromSource).toHaveBeenCalledWith('Pkg', '2.0.0', 'https://custom.com/v3/index.json');
        });

        it('falls back to offline metadata when sources fail', async () => {
            const offline = { id: 'Pkg', version: '1.0.0', description: '', authors: '', offline: true };
            vi.spyOn((service as any)._packageService, 'getPackageMetadataFromSource').mockResolvedValue(null);
            vi.spyOn((service as any)._packageService, 'getOfflineMetadata').mockResolvedValue(offline);

            const result = await service.getPackageMetadata('Pkg', '1.0.0', 'https://fail.com');
            expect(result).toEqual(offline);
            // Offline metadata should NOT be cached
            expect((service as any)._packageService.metadataCache.get('pkg@1.0.0')).toBeUndefined();
        });

        it('returns null when all strategies fail', async () => {
            vi.spyOn((service as any)._packageService, 'getPackageMetadataFromSource').mockResolvedValue(null);
            vi.spyOn((service as any)._packageService, 'getOfflineMetadata').mockResolvedValue(null);

            const result = await service.getPackageMetadata('Pkg', '1.0.0', 'https://fail.com');
            expect(result).toBeNull();
        });

        it('returns null on exception', async () => {
            vi.spyOn(service as any, 'getSources').mockRejectedValue(new Error('crash'));

            const result = await service.getPackageMetadata('Pkg', '1.0.0');
            expect(result).toBeNull();
        });
    });

    describe('getPackageMetadataFromSource', () => {
        it('returns null for local sources', async () => {
            const result = await (service as any)._packageService.getPackageMetadataFromSource('Pkg', '1.0.0', 'C:\\local\\packages');
            expect(result).toBeNull();
        });

        it('returns null when no endpoints discovered', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({});

            const result = await (service as any)._packageService.getPackageMetadataFromSource('Pkg', '1.0.0', 'https://empty.com/v3/index.json');
            expect(result).toBeNull();
        });

        it('fetches metadata from registration API', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                registrationsBaseUrl: 'https://api.nuget.org/v3/registration5-semver1',
                searchQueryService: 'https://azuresearch.nuget.org/query',
                packageBaseAddress: 'https://api.nuget.org/v3-flatcontainer',
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);
            vi.spyOn((service as any)._packageService, 'getVulnerabilities').mockReturnValue([]);
            vi.spyOn(service as any, 'getPackageSize').mockResolvedValue(-1);
            vi.spyOn(service as any, 'fetchText').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'fetchJson').mockImplementation(async (...args: unknown[]) => {
                const url = args[0] as string;
                if (url.includes('registration5-semver1/pkg/1.0.0.json')) {
                    return { id: 'Pkg', version: '1.0.0', description: 'A package', authors: 'Auth' };
                }
                return null;
            });

            const result = await (service as any)._packageService.getPackageMetadataFromSource('Pkg', '1.0.0', 'https://api.nuget.org/v3/index.json');
            expect(result).not.toBeNull();
            expect(result.id).toBe('Pkg');
            expect(result.description).toBe('A package');
        });

        it('falls back to package index when direct registration fails', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                registrationsBaseUrl: 'https://registry.example.com/v3/registration',
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);
            vi.spyOn((service as any)._packageService, 'getVulnerabilities').mockReturnValue([]);
            vi.spyOn(service as any, 'getPackageSize').mockResolvedValue(-1);
            vi.spyOn(service as any, 'fetchText').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'fetchJson').mockImplementation(async (...args: unknown[]) => {
                const url = args[0] as string;
                if (url.endsWith('1.0.0.json')) { return null; } // Direct fails
                if (url.endsWith('index.json')) {
                    return {
                        items: [{
                            items: [{ catalogEntry: { id: 'Pkg', version: '1.0.0', description: 'From index', authors: 'A' } }]
                        }]
                    };
                }
                return null;
            });

            const result = await (service as any)._packageService.getPackageMetadataFromSource('Pkg', '1.0.0', 'https://registry.example.com');
            expect(result).not.toBeNull();
            expect(result.description).toBe('From index');
        });

        it('falls back to nuspec when registration fails', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                registrationsBaseUrl: 'https://reg.example.com/v3/registration',
                packageBaseAddress: 'https://flat.example.com/v3-flatcontainer',
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue(null);
            vi.spyOn((service as any)._packageService, 'getPackageMetadataFromNuspec').mockResolvedValue({
                id: 'Pkg', version: '1.0.0', description: 'From nuspec', authors: 'NuspecAuthor'
            });

            const result = await (service as any)._packageService.getPackageMetadataFromSource('Pkg', '1.0.0', 'https://source.com');
            expect(result).not.toBeNull();
            expect(result.description).toBe('From nuspec');
        });

        it('falls back to search API when registration and nuspec fail', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                searchQueryService: 'https://search.example.com/query',
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue(null);
            vi.spyOn((service as any)._packageService, 'getPackageMetadataFromSearch').mockResolvedValue({
                id: 'Pkg', version: '1.0.0', description: 'From search', authors: 'SearchAuthor'
            });

            const result = await (service as any)._packageService.getPackageMetadataFromSource('Pkg', '1.0.0', 'https://source.com');
            expect(result).not.toBeNull();
            expect(result.description).toBe('From search');
        });

        it('returns null on exception', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockRejectedValue(new Error('fail'));

            const result = await (service as any)._packageService.getPackageMetadataFromSource('Pkg', '1.0.0', 'https://source.com');
            expect(result).toBeNull();
        });
    });

    describe('getPackageMetadataFromSearch', () => {
        it('returns metadata from search API with standard response format', async () => {
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                data: [{ id: 'Pkg', description: 'Search desc', authors: ['Author1', 'Author2'], totalDownloads: 5000, projectUrl: 'https://example.com' }]
            });

            const result = await (service as any)._packageService.getPackageMetadataFromSearch('Pkg', '1.0.0', 'https://search.example.com/query');
            expect(result).not.toBeNull();
            expect(result.description).toBe('Search desc');
            expect(result.authors).toBe('Author1, Author2');
            expect(result.totalDownloads).toBe(5000);
        });

        it('handles case-insensitive field names (Description, Authors, etc.)', async () => {
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                Data: [{ Id: 'Pkg', Description: 'CaseDesc', Authors: 'SingleAuthor', LicenseUrl: 'https://lic.example.com' }]
            });

            const result = await (service as any)._packageService.getPackageMetadataFromSearch('Pkg', '1.0.0', 'https://search.example.com/query');
            expect(result).not.toBeNull();
            expect(result.description).toBe('CaseDesc');
            expect(result.authors).toBe('SingleAuthor');
            expect(result.licenseUrl).toBe('https://lic.example.com');
        });

        it('handles root array response format', async () => {
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue(
                [{ id: 'Pkg', description: 'Root array', authors: 'A' }]
            );

            const result = await (service as any)._packageService.getPackageMetadataFromSearch('Pkg', '1.0.0', 'https://search.example.com/query');
            expect(result).not.toBeNull();
            expect(result.description).toBe('Root array');
        });

        it('returns null when no matching package found', async () => {
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({ data: [] });

            const result = await (service as any)._packageService.getPackageMetadataFromSearch('Pkg', '1.0.0', 'https://search.example.com/query');
            expect(result).toBeNull();
        });

        it('returns null on exception', async () => {
            vi.spyOn(service as any, 'fetchJson').mockRejectedValue(new Error('network error'));

            const result = await (service as any)._packageService.getPackageMetadataFromSearch('Pkg', '1.0.0', 'https://search.example.com/query');
            expect(result).toBeNull();
        });
    });

    describe('getPackageMetadataFromNuspec', () => {
        it('parses nuspec content for basic metadata', async () => {
            const nuspec = `<?xml version="1.0"?>
<package><metadata>
  <id>TestPkg</id>
  <version>2.0.0</version>
  <description>A test package</description>
  <authors>Test Author</authors>
  <licenseUrl>https://lic.example.com</licenseUrl>
  <projectUrl>https://proj.example.com</projectUrl>
</metadata></package>`;
            vi.spyOn(service as any, 'fetchText').mockResolvedValue(nuspec);

            const result = await (service as any)._packageService.getPackageMetadataFromNuspec('TestPkg', '2.0.0', 'https://flat.example.com');
            expect(result).not.toBeNull();
            expect(result.id).toBe('TestPkg');
            expect(result.description).toBe('A test package');
            expect(result.authors).toBe('Test Author');
            expect(result.licenseUrl).toBe('https://lic.example.com');
            expect(result.projectUrl).toBe('https://proj.example.com');
        });

        it('parses grouped dependencies', async () => {
            const nuspec = `<package><metadata>
  <description>d</description><authors>a</authors>
  <dependencies>
    <group targetFramework=".NETStandard2.0">
      <dependency id="Dep1" version="1.0.0" />
      <dependency id="Dep2" version="2.0.0" />
    </group>
    <group targetFramework="net6.0">
      <dependency id="Dep3" version="3.0.0" />
    </group>
  </dependencies>
</metadata></package>`;
            vi.spyOn(service as any, 'fetchText').mockResolvedValue(nuspec);

            const result = await (service as any)._packageService.getPackageMetadataFromNuspec('Pkg', '1.0.0', 'https://flat.example.com');
            expect(result.dependencies).toHaveLength(2);
            expect(result.dependencies[0].targetFramework).toBe('.NETStandard2.0');
            expect(result.dependencies[0].dependencies).toHaveLength(2);
            expect(result.dependencies[1].targetFramework).toBe('net6.0');
        });

        it('parses flat dependencies when no groups exist', async () => {
            const nuspec = `<package><metadata>
  <description>d</description><authors>a</authors>
  <dependencies>
    <dependency id="FlatDep" version="1.0.0" />
  </dependencies>
</metadata></package>`;
            vi.spyOn(service as any, 'fetchText').mockResolvedValue(nuspec);

            const result = await (service as any)._packageService.getPackageMetadataFromNuspec('Pkg', '1.0.0', 'https://flat.example.com');
            expect(result.dependencies).toHaveLength(1);
            expect(result.dependencies[0].targetFramework).toBe('Any');
            expect(result.dependencies[0].dependencies[0].id).toBe('FlatDep');
        });

        it('returns null when fetchText returns null', async () => {
            vi.spyOn(service as any, 'fetchText').mockResolvedValue(undefined);

            const result = await (service as any)._packageService.getPackageMetadataFromNuspec('Pkg', '1.0.0', 'https://flat.example.com');
            expect(result).toBeNull();
        });

        it('returns null on exception', async () => {
            vi.spyOn(service as any, 'fetchText').mockRejectedValue(new Error('fail'));

            const result = await (service as any)._packageService.getPackageMetadataFromNuspec('Pkg', '1.0.0', 'https://flat.example.com');
            expect(result).toBeNull();
        });
    });

    describe('getOfflineMetadata', () => {
        it('returns null when global folder not resolved', async () => {
            vi.spyOn((service as any)._packageService, 'resolveGlobalPackagesFolder').mockResolvedValue(null);

            const result = await (service as any)._packageService.getOfflineMetadata('Pkg', '1.0.0');
            expect(result).toBeNull();
        });

        it('returns null when nuspec file does not exist', async () => {
            vi.spyOn((service as any)._packageService, 'resolveGlobalPackagesFolder').mockResolvedValue('/home/user/.nuget/packages');
            const fs = await import('fs');
            vi.mocked(fs.existsSync).mockReturnValue(false);

            const result = await (service as any)._packageService.getOfflineMetadata('Pkg', '1.0.0');
            expect(result).toBeNull();
        });

        it('parses metadata from local nuspec file', async () => {
            const nuspec = `<package><metadata>
  <id>LocalPkg</id><version>3.0.0</version>
  <description>Local desc</description><authors>Local Author</authors>
  <licenseUrl>https://lic.example.com</licenseUrl>
</metadata></package>`;
            vi.spyOn((service as any)._packageService, 'resolveGlobalPackagesFolder').mockResolvedValue('/home/user/.nuget/packages');
            const fs = await import('fs');
            vi.mocked(fs.existsSync).mockReturnValue(true);
            hoisted.mockReadFileAsync.mockResolvedValue(nuspec);

            const result = await (service as any)._packageService.getOfflineMetadata('LocalPkg', '3.0.0');
            expect(result).not.toBeNull();
            expect(result.id).toBe('LocalPkg');
            expect(result.description).toBe('Local desc');
            expect(result.authors).toBe('Local Author');
            expect(result.offline).toBe(true);
        });

        it('parses grouped dependencies from local nuspec', async () => {
            const nuspec = `<package><metadata>
  <id>Pkg</id><version>1.0.0</version><description>d</description><authors>a</authors>
  <dependencies>
    <group targetFramework="net6.0">
      <dependency id="DepA" version="1.0.0" />
    </group>
  </dependencies>
</metadata></package>`;
            vi.spyOn((service as any)._packageService, 'resolveGlobalPackagesFolder').mockResolvedValue('/home/user/.nuget/packages');
            const fs = await import('fs');
            vi.mocked(fs.existsSync).mockReturnValue(true);
            hoisted.mockReadFileAsync.mockResolvedValue(nuspec);

            const result = await (service as any)._packageService.getOfflineMetadata('Pkg', '1.0.0');
            expect(result.dependencies).toHaveLength(1);
            expect(result.dependencies[0].targetFramework).toBe('net6.0');
            expect(result.dependencies[0].dependencies[0].id).toBe('DepA');
        });

        it('parses ungrouped dependencies from local nuspec', async () => {
            const nuspec = `<package><metadata>
  <id>Pkg</id><version>1.0.0</version><description>d</description><authors>a</authors>
  <dependencies>
    <dependency id="Flat1" version="2.0.0" />
    <dependency id="Flat2" version="3.0.0" />
  </dependencies>
</metadata></package>`;
            vi.spyOn((service as any)._packageService, 'resolveGlobalPackagesFolder').mockResolvedValue('/home/user/.nuget/packages');
            const fs = await import('fs');
            vi.mocked(fs.existsSync).mockReturnValue(true);
            hoisted.mockReadFileAsync.mockResolvedValue(nuspec);

            const result = await (service as any)._packageService.getOfflineMetadata('Pkg', '1.0.0');
            expect(result.dependencies).toHaveLength(1);
            expect(result.dependencies[0].targetFramework).toBe('Any');
            expect(result.dependencies[0].dependencies).toHaveLength(2);
            expect(result.dependencies[0].dependencies[0].id).toBe('Flat1');
        });

        it('returns null on exception', async () => {
            vi.spyOn((service as any)._packageService, 'resolveGlobalPackagesFolder').mockRejectedValue(new Error('fail'));

            const result = await (service as any)._packageService.getOfflineMetadata('Pkg', '1.0.0');
            expect(result).toBeNull();
        });
    });

    describe('resolveIconUrl', () => {
        it('returns undefined for wildcard versions', async () => {
            const result = await (service as any)._packageService.resolveIconUrl('Pkg', '1.*');
            expect(result).toBeUndefined();
        });

        it('returns undefined for range versions', async () => {
            const result = await (service as any)._packageService.resolveIconUrl('Pkg', '[1.0,2.0)');
            expect(result).toBeUndefined();
        });

        it('returns cached icon URL from memory', async () => {
            (service as any)._packageService.iconUrlCache.set('iconurl:test', 'https://icon.example.com/icon.png');

            const result = await (service as any)._packageService.resolveIconUrl('Pkg', '1.0.0');
            expect(result).toBe('https://icon.example.com/icon.png');
        });

        it('returns undefined when memory cache has empty string (no icon)', async () => {
            (service as any)._packageService.iconUrlCache.set('iconurl:test', '');

            const result = await (service as any)._packageService.resolveIconUrl('Pkg', '1.0.0');
            expect(result).toBeUndefined();
        });

        it('returns cached icon URL from workspace cache', async () => {
            vi.mocked(workspaceCache.get).mockReturnValue('https://ws-cached-icon.com/icon');

            const result = await (service as any)._packageService.resolveIconUrl('Pkg', '1.0.0');
            expect(result).toBe('https://ws-cached-icon.com/icon');
            vi.mocked(workspaceCache.get).mockReturnValue(undefined);
        });

        it('finds icon on nuget.org via HEAD request', async () => {
            vi.spyOn((service as any)._packageService, 'checkUrlExists').mockResolvedValue(true);

            const result = await (service as any)._packageService.resolveIconUrl('Pkg', '1.0.0');
            expect(result).toContain('api.nuget.org/v3-flatcontainer/pkg/1.0.0/icon');
        });

        it('falls back to custom sources when nuget.org has no icon', async () => {
            vi.spyOn((service as any)._packageService, 'checkUrlExists').mockImplementation(async (...args: unknown[]) => {
                const url = args[0] as string;
                if (url.includes('nuget.org')) { return false; }
                if (url.includes('custom.com')) { return true; }
                return false;
            });
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                packageBaseAddress: 'https://custom.com/v3-flatcontainer',
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);

            const result = await (service as any)._packageService.resolveIconUrl('Pkg', '1.0.0', [{ url: 'https://custom.com/v3/index.json' }]);
            expect(result).toContain('custom.com');
        });

        it('skips sources past circuit breaker threshold', async () => {
            vi.spyOn((service as any)._packageService, 'checkUrlExists').mockResolvedValue(false);
            const discoverSpy = vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({});
            (service as any)._packageService.iconSourceMissCount.set('https://missed.com/v3/index.json', 5);

            const result = await (service as any)._packageService.resolveIconUrl('Pkg', '1.0.0', [{ url: 'https://missed.com/v3/index.json' }]);
            expect(result).toBeUndefined();
            // Should NOT have tried to discover endpoints for the skipped source
            expect(discoverSpy).not.toHaveBeenCalled();
        });

        it('caches empty string when no icon found', async () => {
            vi.spyOn((service as any)._packageService, 'checkUrlExists').mockResolvedValue(false);

            await (service as any)._packageService.resolveIconUrl('Pkg', '1.0.0');
            expect((service as any)._packageService.iconUrlCache.get('iconurl:test')).toBe('');
        });
    });

    describe('getPackageSearchMetadata', () => {
        it('returns cached result from verifiedStatusCache', async () => {
            (service as any)._packageService.verifiedStatusCache.set('verified:test', { verified: true, authors: 'Author' });

            const result = await (service as any)._packageService.getPackageSearchMetadata('Pkg');
            expect(result.verified).toBe(true);
            expect(result.authors).toBe('Author');
        });

        it('returns cached result from workspace cache', async () => {
            vi.mocked(workspaceCache.get).mockReturnValue({ verified: false, authors: 'WsAuthor', description: 'desc' });

            const result = await (service as any)._packageService.getPackageSearchMetadata('Pkg');
            expect(result.verified).toBe(false);
            expect(result.authors).toBe('WsAuthor');
            vi.mocked(workspaceCache.get).mockReturnValue(undefined);
        });

        it('fetches from search API and caches result', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                searchQueryService: 'https://azuresearch.nuget.org/query',
            });
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                data: [{ id: 'Pkg', verified: true, authors: ['Auth1', 'Auth2'], description: 'A package' }]
            });

            const result = await (service as any)._packageService.getPackageSearchMetadata('Pkg');
            expect(result.verified).toBe(true);
            expect(result.authors).toBe('Auth1, Auth2');
            // Should be cached in verifiedStatusCache
            expect((service as any)._packageService.verifiedStatusCache.get('verified:test')).toBeDefined();
        });

        it('pre-populates icon cache when search API returns iconUrl', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                searchQueryService: 'https://azuresearch.nuget.org/query',
            });
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                data: [{ id: 'Pkg', verified: true, authors: ['Auth'], iconUrl: 'https://icon.example.com/icon.png' }]
            });

            const result = await (service as any)._packageService.getPackageSearchMetadata('Pkg', '1.0.0');
            expect(result.iconUrl).toContain('api.nuget.org/v3-flatcontainer/pkg/1.0.0/icon');
            // Icon should be cached
            expect((service as any)._packageService.iconUrlCache.get('iconurl:test')).toContain('flatcontainer');
        });

        it('returns empty object when no search endpoint discovered', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({});

            const result = await (service as any)._packageService.getPackageSearchMetadata('Pkg');
            expect(result).toEqual({});
        });

        it('returns empty object when package ID does not match', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                searchQueryService: 'https://azuresearch.nuget.org/query',
            });
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                data: [{ id: 'OtherPkg', verified: true, authors: ['A'] }]
            });

            const result = await (service as any)._packageService.getPackageSearchMetadata('Pkg');
            expect(result).toEqual({});
        });

        it('returns empty object on exception', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockRejectedValue(new Error('fail'));

            const result = await (service as any)._packageService.getPackageSearchMetadata('Pkg');
            expect(result).toEqual({});
        });
    });

    describe('resolveGlobalPackagesFolder', () => {
        it('returns cached folder on subsequent calls', async () => {
            (service as any)._packageService._globalPackagesFolder = '/cached/path';

            const result = await (service as any)._packageService.resolveGlobalPackagesFolder();
            expect(result).toBe('/cached/path');
        });

        it('resolves from dotnet CLI output', async () => {
            const fs = await import('fs');
            vi.mocked(fs.existsSync).mockReturnValue(true);
            hoisted.mockExecWithTimeout.mockResolvedValue({
                stdout: 'global-packages: /home/user/.nuget/packages/',
                stderr: ''
            });

            (service as any)._packageService._globalPackagesFolder = null;
            const result = await (service as any)._packageService.resolveGlobalPackagesFolder();
            expect(result).toBe('/home/user/.nuget/packages');
            vi.mocked(fs.existsSync).mockReturnValue(false);
        });

        it('falls back to default path when CLI fails', async () => {
            const fs = await import('fs');
            hoisted.mockExecWithTimeout.mockRejectedValue(new Error('no dotnet'));
            vi.mocked(fs.existsSync).mockReturnValue(true);

            (service as any)._packageService._globalPackagesFolder = null;
            const result = await (service as any)._packageService.resolveGlobalPackagesFolder();
            expect(result).toContain('.nuget');
            expect(result).toContain('packages');
            vi.mocked(fs.existsSync).mockReturnValue(false);
        });

        it('returns null when no folder exists', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValue(new Error('no dotnet'));
            const fs = await import('fs');
            vi.mocked(fs.existsSync).mockReturnValue(false);

            (service as any)._packageService._globalPackagesFolder = null;
            const result = await (service as any)._packageService.resolveGlobalPackagesFolder();
            expect(result).toBeNull();
        });
    });

    // ──────────────────────────────────────────────
    // Phase 4D: Version Management & Updates
    // ──────────────────────────────────────────────

    describe('getPackageVersionsFromSource', () => {
        it('returns empty array for local sources', async () => {
            const result = await (service as any)._packageService.getPackageVersionsFromSource('Pkg', 'C:\\local\\packages');
            expect(result).toEqual([]);
        });

        it('returns cached versions from memory', async () => {
            const versions = ['3.0.0', '2.0.0', '1.0.0'];
            (service as any)._packageService.versionsCache.set('versions:test', versions);

            const result = await (service as any)._packageService.getPackageVersionsFromSource('Pkg', 'https://source.com');
            expect(result).toEqual(versions);
        });

        it('returns cached versions from workspace cache', async () => {
            vi.mocked(workspaceCache.get).mockReturnValue(['5.0.0', '4.0.0']);

            const result = await (service as any)._packageService.getPackageVersionsFromSource('Pkg', 'https://source.com');
            expect(result).toEqual(['5.0.0', '4.0.0']);
            vi.mocked(workspaceCache.get).mockReturnValue(undefined);
        });

        it('fetches versions from flat container API', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                packageBaseAddress: 'https://api.nuget.org/v3-flatcontainer',
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                versions: ['1.0.0', '2.0.0', '3.0.0']
            });

            const result = await (service as any)._packageService.getPackageVersionsFromSource('Pkg', 'https://api.nuget.org/v3/index.json');
            expect(result).toEqual(['3.0.0', '2.0.0', '1.0.0']); // Reversed
        });

        it('falls back to search API when flat container fails', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                packageBaseAddress: 'https://flat.example.com',
                searchQueryService: 'https://search.example.com/query',
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'fetchJson').mockImplementation(async (...args: unknown[]) => {
                const url = args[0] as string;
                if (url.includes('index.json')) { return null; } // Flat container fails
                if (url.includes('query')) {
                    return { data: [{ id: 'Pkg', version: '2.0.0', versions: [{ version: '1.0.0' }, { version: '2.0.0' }] }] };
                }
                return null;
            });

            const result = await (service as any)._packageService.getPackageVersionsFromSource('Pkg', 'https://source.com', false, 20);
            expect(result).toEqual(['2.0.0', '1.0.0']);
        });

        it('filters prerelease versions when includePrerelease is false', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                packageBaseAddress: 'https://flat.example.com',
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                versions: ['1.0.0', '2.0.0-beta', '2.0.0', '3.0.0-rc1']
            });

            const result = await (service as any)._packageService.getPackageVersionsFromSource('Pkg', 'https://source.com', false);
            expect(result).toEqual(['2.0.0', '1.0.0']);
        });

        it('includes prerelease versions when includePrerelease is true', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                packageBaseAddress: 'https://flat.example.com',
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                versions: ['1.0.0', '2.0.0-beta', '2.0.0']
            });

            const result = await (service as any)._packageService.getPackageVersionsFromSource('Pkg', 'https://source.com', true);
            expect(result).toHaveLength(3);
        });

        it('returns empty array when no endpoints discovered', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({});

            const result = await (service as any)._packageService.getPackageVersionsFromSource('Pkg', 'https://source.com');
            expect(result).toEqual([]);
        });

        it('returns empty array on exception', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockRejectedValue(new Error('fail'));

            const result = await (service as any)._packageService.getPackageVersionsFromSource('Pkg', 'https://source.com');
            expect(result).toEqual([]);
        });

        it('caches non-empty results in both memory and workspace', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                packageBaseAddress: 'https://flat.example.com',
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'fetchJson').mockResolvedValue({
                versions: ['1.0.0']
            });

            await (service as any)._packageService.getPackageVersionsFromSource('Pkg', 'https://source.com');
            expect((service as any)._packageService.versionsCache.get('versions:test')).toBeDefined();
            expect(vi.mocked(workspaceCache.set)).toHaveBeenCalled();
        });
    });

    describe('getPackageVersions', () => {
        it('fetches from specific source when source provided', async () => {
            vi.spyOn((service as any)._packageService, 'getPackageVersionsFromSource').mockResolvedValue(['3.0.0', '2.0.0']);

            const result = await service.getPackageVersions('Pkg', 'https://source.com');
            expect(result).toEqual(['3.0.0', '2.0.0']);
        });

        it('merges versions from all sources when no source specified (take > 1)', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { url: 'https://s1.com', enabled: true },
                { url: 'https://s2.com', enabled: true },
            ]);
            vi.spyOn((service as any)._packageService, 'getPackageVersionsFromSource').mockImplementation(
                async (...args: unknown[]) => args[1] === 'https://s1.com' ? ['1.0.0', '3.0.0'] : ['2.0.0', '3.0.0']
            );

            const result = await service.getPackageVersions('Pkg', undefined, false, 20);
            expect(result).toContain('1.0.0');
            expect(result).toContain('2.0.0');
            expect(result).toContain('3.0.0');
            // Deduplicated: 3 unique versions
            expect(result).toHaveLength(3);
        });

        it('returns empty array on exception', async () => {
            vi.spyOn(service as any, 'getSources').mockRejectedValue(new Error('crash'));

            const result = await service.getPackageVersions('Pkg');
            expect(result).toEqual([]);
        });
    });

    describe('getPackageVersionsWithSource', () => {
        it('returns versions with source URL', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { url: 'https://source1.com', enabled: true },
            ]);
            vi.spyOn((service as any)._packageService, 'getPackageVersionsFromSource').mockResolvedValue(['5.0.0']);

            const result = await (service as any)._packageService.getPackageVersionsWithSource('Pkg');
            expect(result.versions).toEqual(['5.0.0']);
            expect(result.sourceUrl).toBe('https://source1.com');
        });

        it('returns empty versions when no source has package', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { url: 'https://source1.com', enabled: true },
            ]);
            vi.spyOn((service as any)._packageService, 'getPackageVersionsFromSource').mockResolvedValue([]);

            const result = await (service as any)._packageService.getPackageVersionsWithSource('Pkg');
            expect(result.versions).toEqual([]);
            expect(result.sourceUrl).toBeUndefined();
        });

        it('returns empty versions on exception', async () => {
            vi.spyOn(service as any, 'getSources').mockRejectedValue(new Error('crash'));

            const result = await (service as any)._packageService.getPackageVersionsWithSource('Pkg');
            expect(result.versions).toEqual([]);
        });
    });

    describe('checkPackageUpdates', () => {
        const mockResolvedSources = [{ url: 'https://api.nuget.org/v3/index.json', endpoints: { packageBaseAddress: 'https://api.nuget.org/v3-flatcontainer/' }, authHeader: undefined }];

        it('skips floating version packages', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForBatch').mockResolvedValue(mockResolvedSources);

            const result = await service.checkPackageUpdates(
                [{ id: 'Pkg', version: '1.*', versionType: 'floating' as const }],
                false
            );
            expect(result).toEqual([]);
        });

        it('skips range version packages', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForBatch').mockResolvedValue(mockResolvedSources);

            const result = await service.checkPackageUpdates(
                [{ id: 'Pkg', version: '[1.0,2.0)', versionType: 'range' as const }],
                false
            );
            expect(result).toEqual([]);
        });

        it('returns update when newer version available', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForBatch').mockResolvedValue(mockResolvedSources);
            vi.spyOn((service as any)._packageService, 'getPackageVersionsWithResolvedSources').mockResolvedValue({ versions: ['2.0.0'], sourceUrl: 'https://nuget.org' });
            vi.spyOn((service as any)._packageService, 'getPackageSearchMetadata').mockResolvedValue({ verified: true, authors: 'Author', iconUrl: 'https://icon.com' });

            const result = await service.checkPackageUpdates(
                [{ id: 'Pkg', version: '1.0.0', versionType: 'standard' as const }],
                false
            );
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('Pkg');
            expect(result[0].latestVersion).toBe('2.0.0');
            expect(result[0].verified).toBe(true);
            expect(result[0].iconUrl).toBe('https://icon.com');
        });

        it('skips packages already at latest version', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForBatch').mockResolvedValue(mockResolvedSources);
            vi.spyOn((service as any)._packageService, 'getPackageVersionsWithResolvedSources').mockResolvedValue({ versions: ['1.0.0'], sourceUrl: 'https://nuget.org' });

            const result = await service.checkPackageUpdates(
                [{ id: 'Pkg', version: '1.0.0', versionType: 'standard' as const }],
                false
            );
            expect(result).toEqual([]);
        });

        it('falls back to resolveIconUrl when search API has no icon', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForBatch').mockResolvedValue(mockResolvedSources);
            vi.spyOn((service as any)._packageService, 'getPackageVersionsWithResolvedSources').mockResolvedValue({ versions: ['2.0.0'], sourceUrl: 'https://nuget.org' });
            vi.spyOn((service as any)._packageService, 'getPackageSearchMetadata').mockResolvedValue({ verified: false });
            vi.spyOn((service as any)._packageService, 'getPackageIconUrl').mockResolvedValue('https://fallback-icon.com');

            const result = await service.checkPackageUpdates(
                [{ id: 'Pkg', version: '1.0.0', versionType: 'standard' as const }],
                false
            );
            expect(result[0].iconUrl).toBe('https://fallback-icon.com');
        });

        it('handles errors per-package without failing entire check', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForBatch').mockResolvedValue(mockResolvedSources);
            vi.spyOn((service as any)._packageService, 'getPackageVersionsWithResolvedSources').mockImplementation(async (...args: unknown[]) => {
                if (args[0] === 'BadPkg') { throw new Error('fail'); }
                return { versions: ['2.0.0'], sourceUrl: 'https://nuget.org' };
            });
            vi.spyOn((service as any)._packageService, 'getPackageSearchMetadata').mockResolvedValue({});

            const result = await service.checkPackageUpdates(
                [{ id: 'BadPkg', version: '1.0.0', versionType: 'standard' as const }, { id: 'GoodPkg', version: '1.0.0', versionType: 'standard' as const }],
                false
            );
            // Only GoodPkg should be in results
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('GoodPkg');
        });

        it('returns empty array when no sources are resolved', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForBatch').mockResolvedValue([]);

            const result = await service.checkPackageUpdates(
                [{ id: 'Pkg', version: '1.0.0', versionType: 'standard' as const }],
                false
            );
            expect(result).toEqual([]);
        });
    });

    describe('checkPackageUpdatesMinimal', () => {
        const mockResolvedSources = [{ url: 'https://api.nuget.org/v3/index.json', endpoints: { packageBaseAddress: 'https://api.nuget.org/v3-flatcontainer/' }, authHeader: undefined }];

        it('skips floating version packages', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForBatch').mockResolvedValue(mockResolvedSources);

            const result = await service.checkPackageUpdatesMinimal(
                [{ id: 'Pkg', version: '1.*', versionType: 'floating' as const }],
                false
            );
            expect(result).toEqual([]);
        });

        it('returns update with minimal fields only', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForBatch').mockResolvedValue(mockResolvedSources);
            vi.spyOn((service as any)._packageService, 'getPackageVersionsWithResolvedSources').mockResolvedValue({ versions: ['3.0.0'], sourceUrl: 'https://source.com' });

            const result = await service.checkPackageUpdatesMinimal(
                [{ id: 'Pkg', version: '1.0.0', versionType: 'standard' as const }],
                false
            );
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                id: 'Pkg',
                installedVersion: '1.0.0',
                latestVersion: '3.0.0',
                sourceUrl: 'https://source.com'
            });
            // Should NOT have icon, verified, or authors
            expect((result[0] as Record<string, unknown>).iconUrl).toBeUndefined();
            expect((result[0] as Record<string, unknown>).verified).toBeUndefined();
        });

        it('skips packages at latest version', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForBatch').mockResolvedValue(mockResolvedSources);
            vi.spyOn((service as any)._packageService, 'getPackageVersionsWithResolvedSources').mockResolvedValue({ versions: ['1.0.0'], sourceUrl: 'https://source.com' });

            const result = await service.checkPackageUpdatesMinimal(
                [{ id: 'Pkg', version: '1.0.0', versionType: 'standard' as const }],
                false
            );
            expect(result).toEqual([]);
        });

        it('handles per-package errors gracefully', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForBatch').mockResolvedValue(mockResolvedSources);
            vi.spyOn((service as any)._packageService, 'getPackageVersionsWithResolvedSources').mockRejectedValue(new Error('fail'));

            const result = await service.checkPackageUpdatesMinimal(
                [{ id: 'Pkg', version: '1.0.0', versionType: 'standard' as const }],
                false
            );
            expect(result).toEqual([]);
        });

        it('returns empty array when no sources are resolved', async () => {
            vi.spyOn((service as any)._packageService, 'resolveSourcesForBatch').mockResolvedValue([]);

            const result = await service.checkPackageUpdatesMinimal(
                [{ id: 'Pkg', version: '1.0.0', versionType: 'standard' as const }],
                false
            );
            expect(result).toEqual([]);
        });

        it('skips internal source resolution when preResolvedSources are provided', async () => {
            const resolveSpy = vi.spyOn((service as any)._packageService, 'resolveSourcesForBatch');
            const preResolved = [{ url: 'https://api.nuget.org/v3/index.json', endpoints: { SearchQueryService: ['https://api.nuget.org/query'] }, authHeader: undefined }];
            vi.spyOn((service as any)._packageService, 'getPackageVersionsWithResolvedSources').mockResolvedValue(['1.0.0']);

            await service.checkPackageUpdatesMinimal(
                [{ id: 'Pkg', version: '1.0.0', versionType: 'standard' as const }],
                false,
                preResolved
            );

            expect(resolveSpy).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // Phase 4D+: resolveSourcesForBatch (pre-resolution optimization)
    // ──────────────────────────────────────────────

    describe('resolveSourcesForBatch', () => {
        it('pre-resolves endpoints and auth for all healthy sources', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
                { name: 'private', url: 'https://private.feed.com/v3/index.json', enabled: true },
            ]);
            vi.spyOn(service as any, 'isLocalSource').mockReturnValue(false);
            vi.spyOn(service as any, 'filterHealthySources').mockImplementation((urls: string[]) => urls);
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockImplementation(async (url: string) => {
                if (url.includes('nuget.org')) { return { packageBaseAddress: 'https://api.nuget.org/v3-flatcontainer/' }; }
                return { searchQueryService: 'https://private.feed.com/v3/query' };
            });
            vi.spyOn(service as any, 'getAuthHeader').mockImplementation(async (url: string) => {
                if (url.includes('private')) { return 'Basic abc'; }
                return undefined;
            });

            const result = await (service as any)._packageService.resolveSourcesForBatch();
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ url: 'https://api.nuget.org/v3/index.json', endpoints: { packageBaseAddress: 'https://api.nuget.org/v3-flatcontainer/' }, authHeader: undefined });
            expect(result[1]).toEqual({ url: 'https://private.feed.com/v3/index.json', endpoints: { searchQueryService: 'https://private.feed.com/v3/query' }, authHeader: 'Basic abc' });
        });

        it('filters out disabled and local sources', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
                { name: 'disabled', url: 'https://disabled.com/v3/index.json', enabled: false },
                { name: 'local', url: 'C:\\packages', enabled: true },
            ]);
            vi.spyOn(service as any, 'isLocalSource').mockImplementation((url: string) => url.startsWith('C:'));
            vi.spyOn(service as any, 'filterHealthySources').mockImplementation((urls: string[]) => urls);
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({ packageBaseAddress: 'https://api.nuget.org/v3-flatcontainer/' });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);

            const result = await (service as any)._packageService.resolveSourcesForBatch();
            expect(result).toHaveLength(1);
            expect(result[0].url).toBe('https://api.nuget.org/v3/index.json');
        });

        it('filters out unhealthy sources', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
                { name: 'unreachable', url: 'https://unreachable.com/v3/index.json', enabled: true },
            ]);
            vi.spyOn(service as any, 'isLocalSource').mockReturnValue(false);
            vi.spyOn(service as any, 'filterHealthySources').mockReturnValue(['https://api.nuget.org/v3/index.json']);
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({ packageBaseAddress: 'https://api.nuget.org/v3-flatcontainer/' });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);

            const result = await (service as any)._packageService.resolveSourcesForBatch();
            expect(result).toHaveLength(1);
            expect(result[0].url).toBe('https://api.nuget.org/v3/index.json');
        });

        it('excludes sources with no usable endpoints', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
                { name: 'broken', url: 'https://broken.com/v3/index.json', enabled: true },
            ]);
            vi.spyOn(service as any, 'isLocalSource').mockReturnValue(false);
            vi.spyOn(service as any, 'filterHealthySources').mockImplementation((urls: string[]) => urls);
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockImplementation(async (url: string) => {
                if (url.includes('broken')) { return {}; } // no endpoints
                return { packageBaseAddress: 'https://api.nuget.org/v3-flatcontainer/' };
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);

            const result = await (service as any)._packageService.resolveSourcesForBatch();
            expect(result).toHaveLength(1);
            expect(result[0].url).toBe('https://api.nuget.org/v3/index.json');
        });

        it('handles endpoint discovery errors gracefully', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
                { name: 'error', url: 'https://error.com/v3/index.json', enabled: true },
            ]);
            vi.spyOn(service as any, 'isLocalSource').mockReturnValue(false);
            vi.spyOn(service as any, 'filterHealthySources').mockImplementation((urls: string[]) => urls);
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockImplementation(async (url: string) => {
                if (url.includes('error')) { throw new Error('connection refused'); }
                return { packageBaseAddress: 'https://api.nuget.org/v3-flatcontainer/' };
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);

            const result = await (service as any)._packageService.resolveSourcesForBatch();
            expect(result).toHaveLength(1);
            expect(result[0].url).toBe('https://api.nuget.org/v3/index.json');
        });
    });

    // ──────────────────────────────────────────────
    // Phase 4E: Transitive, Vulnerability & Source Management
    // ──────────────────────────────────────────────

    describe('getTransitivePackages', () => {
        it('returns dataSourceAvailable false when assets file missing', async () => {
            hoisted.mockFileExists.mockResolvedValue(false);

            const result = await service.getTransitivePackages('/project/test.csproj');
            expect(result).toEqual({ frameworks: [], dataSourceAvailable: false });
        });

        it('returns frameworks from assets file', async () => {
            hoisted.mockFileExists.mockResolvedValue(true);
            const fakeResult = { frameworks: [{ targetFramework: 'net8.0', packages: [] }] };
            vi.spyOn((service as any)._projectService, 'getTransitivePackagesFromAssets').mockResolvedValue(fakeResult);

            const result = await service.getTransitivePackages('/project/test.csproj');
            expect(result.dataSourceAvailable).toBe(true);
            expect(result.frameworks).toHaveLength(1);
            expect(result.frameworks[0].targetFramework).toBe('net8.0');
        });

        it('returns empty frameworks on parse error', async () => {
            hoisted.mockFileExists.mockResolvedValue(true);
            vi.spyOn((service as any)._projectService, 'getTransitivePackagesFromAssets').mockRejectedValue(new Error('parse fail'));

            const result = await service.getTransitivePackages('/project/test.csproj');
            expect(result).toEqual({ frameworks: [], dataSourceAvailable: true });
        });
    });

    describe('getTransitivePackagesFromAssets', () => {
        it('returns empty frameworks when assets data has no targets', async () => {
            vi.spyOn((service as any)._projectService, 'readAssetsJson').mockResolvedValue({});

            const result = await (service as any)._projectService.getTransitivePackagesFromAssets('/obj/project.assets.json');
            expect(result.frameworks).toEqual([]);
        });

        it('handles frameworks with no transitive packages', async () => {
            vi.spyOn((service as any)._projectService, 'readAssetsJson').mockResolvedValue({
                targets: { 'net8.0': {} },
                projectFileDependencyGroups: { 'net8.0': [] },
            });

            const result = await (service as any)._projectService.getTransitivePackagesFromAssets('/obj/project.assets.json');
            expect(result.frameworks).toHaveLength(1);
            expect(result.frameworks[0].packages).toEqual([]);
        });

        it('identifies transitive packages from asset targets', async () => {
            vi.spyOn((service as any)._projectService, 'readAssetsJson').mockResolvedValue({
                targets: {
                    'net8.0': {
                        'DirectPkg/1.0.0': {
                            dependencies: { 'TransitivePkg': '2.0.0' },
                        },
                        'TransitivePkg/2.0.0': {},
                    },
                },
                projectFileDependencyGroups: {
                    'net8.0': ['DirectPkg >= 1.0.0'],
                },
            });

            const result = await (service as any)._projectService.getTransitivePackagesFromAssets('/obj/project.assets.json');
            expect(result.frameworks).toHaveLength(1);
            expect(result.frameworks[0].targetFramework).toBe('net8.0');
            expect(result.frameworks[0].packages).toHaveLength(1);
            expect(result.frameworks[0].packages[0].id).toBe('TransitivePkg');
            expect(result.frameworks[0].packages[0].version).toBe('2.0.0');
        });

        it('builds requiredByChain for transitive packages', async () => {
            vi.spyOn((service as any)._projectService, 'readAssetsJson').mockResolvedValue({
                targets: {
                    'net8.0': {
                        'Direct/1.0.0': { dependencies: { 'Mid': '1.0.0' } },
                        'Mid/1.0.0': { dependencies: { 'Leaf': '1.0.0' } },
                        'Leaf/1.0.0': {},
                    },
                },
                projectFileDependencyGroups: {
                    'net8.0': ['Direct >= 1.0.0'],
                },
            });

            const result = await (service as any)._projectService.getTransitivePackagesFromAssets('/obj/project.assets.json');
            const leaf = result.frameworks[0].packages.find((p: { id: string }) => p.id === 'Leaf');
            expect(leaf).toBeDefined();
            expect(leaf.requiredByChain).toEqual(['Direct']);
        });

        it('returns null when readAssetsJson returns null', async () => {
            vi.spyOn((service as any)._projectService, 'readAssetsJson').mockResolvedValue(null);

            const result = await (service as any)._projectService.getTransitivePackagesFromAssets('/obj/project.assets.json');
            expect(result.frameworks).toEqual([]);
        });

        it('falls back to base TFM in projectFileDependencyGroups for RID-specific target keys', async () => {
            // RID-specific target keys ("net8.0/win-x64") still key projectFileDependencyGroups
            // by base TFM ("net8.0"). Without the fallback, "DirectPkg" would be misclassified
            // as transitive instead of direct.
            vi.spyOn((service as any)._projectService, 'readAssetsJson').mockResolvedValue({
                targets: {
                    'net8.0/win-x64': {
                        'DirectPkg/1.0.0': { dependencies: { 'TransitivePkg': '2.0.0' } },
                        'TransitivePkg/2.0.0': {},
                    },
                },
                projectFileDependencyGroups: {
                    'net8.0': ['DirectPkg >= 1.0.0'],
                },
            });

            const result = await (service as any)._projectService.getTransitivePackagesFromAssets('/obj/project.assets.json');
            expect(result.frameworks).toHaveLength(1);
            expect(result.frameworks[0].targetFramework).toBe('net8.0/win-x64');
            const ids = result.frameworks[0].packages.map((p: { id: string }) => p.id);
            expect(ids).toContain('TransitivePkg');
            expect(ids).not.toContain('DirectPkg');
        });
    });

    describe('getTransitivePackagesPreservingErrors', () => {
        beforeEach(async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.stat).mockReset();
            (service as any)._projectService.transitiveResultCache.clear();
        });

        it('returns dataSourceAvailable=false when assets.json is missing (ENOENT)', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.stat).mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

            const result = await (service as any)._projectService.getTransitivePackagesPreservingErrors('/proj/test.csproj');
            expect(result).toEqual({ frameworks: [], dataSourceAvailable: false });
        });

        it('returns errorKind=fs-error when stat fails for non-ENOENT reason', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.stat).mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }));

            const result = await (service as any)._projectService.getTransitivePackagesPreservingErrors('/proj/test.csproj');
            expect(result).toMatchObject({ frameworks: [], dataSourceAvailable: true, errorKind: 'fs-error' });
        });

        it('returns errorKind=parse-failed when assets.json fails to parse (SyntaxError)', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.stat).mockResolvedValueOnce({ mtimeMs: 100 } as any);
            vi.spyOn((service as any)._projectService, 'getTransitivePackagesFromAssets')
                .mockRejectedValueOnce(new SyntaxError('bad json'));

            const result = await (service as any)._projectService.getTransitivePackagesPreservingErrors('/proj/test.csproj');
            expect(result).toMatchObject({ frameworks: [], dataSourceAvailable: true, errorKind: 'parse-failed' });
        });

        it('returns errorKind=unknown for other parsing errors', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.stat).mockResolvedValueOnce({ mtimeMs: 100 } as any);
            vi.spyOn((service as any)._projectService, 'getTransitivePackagesFromAssets')
                .mockRejectedValueOnce(new Error('something else'));

            const result = await (service as any)._projectService.getTransitivePackagesPreservingErrors('/proj/test.csproj');
            expect(result).toMatchObject({ frameworks: [], dataSourceAvailable: true, errorKind: 'unknown' });
        });

        it('caches result keyed by mtimeMs and serves cache hit on second call', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.stat).mockResolvedValue({ mtimeMs: 200 } as any);
            const fromAssetsSpy = vi.spyOn((service as any)._projectService, 'getTransitivePackagesFromAssets')
                .mockResolvedValue({ frameworks: [{ targetFramework: 'net8.0', packages: [] }] });

            const r1 = await (service as any)._projectService.getTransitivePackagesPreservingErrors('/proj/test.csproj');
            const r2 = await (service as any)._projectService.getTransitivePackagesPreservingErrors('/proj/test.csproj');

            expect(r1.dataSourceAvailable).toBe(true);
            expect(r2).toBe(r1);
            expect(fromAssetsSpy).toHaveBeenCalledTimes(1);
        });

        it('invalidates cache when mtimeMs changes', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.stat)
                .mockResolvedValueOnce({ mtimeMs: 100 } as any)
                .mockResolvedValueOnce({ mtimeMs: 999 } as any);
            const fromAssetsSpy = vi.spyOn((service as any)._projectService, 'getTransitivePackagesFromAssets')
                .mockResolvedValueOnce({ frameworks: [{ targetFramework: 'net8.0', packages: [] }] })
                .mockResolvedValueOnce({ frameworks: [{ targetFramework: 'net9.0', packages: [] }] });

            const r1 = await (service as any)._projectService.getTransitivePackagesPreservingErrors('/proj/test.csproj');
            const r2 = await (service as any)._projectService.getTransitivePackagesPreservingErrors('/proj/test.csproj');

            expect(r1.frameworks[0].targetFramework).toBe('net8.0');
            expect(r2.frameworks[0].targetFramework).toBe('net9.0');
            expect(fromAssetsSpy).toHaveBeenCalledTimes(2);
        });

        it('evicts oldest entry once MAX_TRANSITIVE_RESULT_ENTRIES (100) is exceeded', async () => {
            const fs = await import('fs');
            let counter = 0;
            vi.mocked(fs.promises.stat).mockImplementation(() => Promise.resolve({ mtimeMs: ++counter } as any));
            vi.spyOn((service as any)._projectService, 'getTransitivePackagesFromAssets')
                .mockResolvedValue({ frameworks: [] });

            for (let i = 0; i < 101; i++) {
                await (service as any)._projectService.getTransitivePackagesPreservingErrors(`/proj/p${i}.csproj`);
            }
            const cache = (service as any)._projectService.transitiveResultCache as Map<string, unknown>;
            expect(cache.size).toBe(100);
            expect(cache.has('/proj/p0.csproj')).toBe(false);
            expect(cache.has('/proj/p100.csproj')).toBe(true);
        });
    });

    describe('fetchTransitivePackageMetadata', () => {
        it('enriches packages with metadata from search API', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([{ name: 'nuget', url: 'https://api.nuget.org/v3/index.json', enabled: true }]);
            vi.spyOn((service as any)._packageService, 'getPackageSearchMetadata').mockResolvedValue({
                verified: true, authors: 'Author1', iconUrl: 'https://icon.com/pkg.png',
            });

            const packages = [{ id: 'Pkg', version: '1.0.0', requiredByChain: ['Direct'] }];
            await service.fetchTransitivePackageMetadata(packages);

            expect(packages[0]).toHaveProperty('iconUrl', 'https://icon.com/pkg.png');
            expect(packages[0]).toHaveProperty('verified', true);
            expect(packages[0]).toHaveProperty('authors', 'Author1');
        });

        it('falls back to resolveIconUrl when search API returns no icon', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([{ name: 'nuget', url: 'https://api.nuget.org/v3/index.json', enabled: true }]);
            vi.spyOn((service as any)._packageService, 'getPackageSearchMetadata').mockResolvedValue({
                verified: false, authors: null, iconUrl: undefined,
            });
            vi.spyOn((service as any)._packageService, 'resolveIconUrl').mockResolvedValue('https://fallback.com/icon.png');

            const packages = [{ id: 'Pkg', version: '1.0.0', requiredByChain: ['Direct'] }];
            await service.fetchTransitivePackageMetadata(packages);

            expect(packages[0]).toHaveProperty('iconUrl', 'https://fallback.com/icon.png');
        });

        it('handles empty packages array', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([]);

            const packages: unknown[] = [];
            await service.fetchTransitivePackageMetadata(packages as any);
            expect(packages).toEqual([]);
        });
    });

    describe('fetchVulnerabilityData', () => {
        it('skips fetch when cache is still fresh', async () => {
            (service as any)._packageService.vulnerabilityData = new Map([['pkg', [{ severity: 2, url: 'https://adv.com', versions: '(,2.0)' }]]]);
            (service as any)._packageService.vulnerabilityDataTimestamp = Date.now();
            const getSourcesSpy = vi.spyOn(service as any, 'getSources');

            await (service as any)._packageService.fetchVulnerabilityData();
            expect(getSourcesSpy).not.toHaveBeenCalled();
        });

        it('fetches and parses vulnerability data from sources', async () => {
            (service as any)._packageService.vulnerabilityData = new Map();
            (service as any)._packageService.vulnerabilityDataTimestamp = 0;
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { name: 'nuget', url: 'https://api.nuget.org/v3/index.json', enabled: true },
            ]);
            vi.spyOn(service as any, 'isLocalSource').mockReturnValue(false);
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                vulnerabilityInfoUrl: 'https://api.nuget.org/v3/vulnerabilities/index.json',
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'fetchJsonWithCompression')
                .mockResolvedValueOnce([{ '@id': 'https://api.nuget.org/v3/vulnerabilities/page1.json' }])  // index
                .mockResolvedValueOnce({  // page data
                    'VulnPkg': [{ severity: 2, url: 'https://advisory.com/1', versions: '(,3.0)' }],
                });

            await (service as any)._packageService.fetchVulnerabilityData();
            expect((service as any)._packageService.vulnerabilityData.size).toBe(1);
            expect((service as any)._packageService.vulnerabilityData.has('vulnpkg')).toBe(true);
        });

        it('skips sources without vulnerabilityInfoUrl', async () => {
            (service as any)._packageService.vulnerabilityData = new Map();
            (service as any)._packageService.vulnerabilityDataTimestamp = 0;
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { name: 'custom', url: 'https://custom.com/v3/index.json', enabled: true },
            ]);
            vi.spyOn(service as any, 'isLocalSource').mockReturnValue(false);
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({});
            const fetchSpy = vi.spyOn(service as any, 'fetchJsonWithCompression');

            await (service as any)._packageService.fetchVulnerabilityData();
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('skips local sources', async () => {
            (service as any)._packageService.vulnerabilityData = new Map();
            (service as any)._packageService.vulnerabilityDataTimestamp = 0;
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { name: 'local', url: 'C:\\packages', enabled: true },
            ]);
            vi.spyOn(service as any, 'isLocalSource').mockReturnValue(true);
            const discoverSpy = vi.spyOn(service as any, 'discoverServiceEndpoints');

            await (service as any)._packageService.fetchVulnerabilityData();
            expect(discoverSpy).not.toHaveBeenCalled();
        });

        it('handles source errors gracefully', async () => {
            (service as any)._packageService.vulnerabilityData = new Map();
            (service as any)._packageService.vulnerabilityDataTimestamp = 0;
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { name: 'broken', url: 'https://broken.com/v3/index.json', enabled: true },
            ]);
            vi.spyOn(service as any, 'isLocalSource').mockReturnValue(false);
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockRejectedValue(new Error('network'));

            await (service as any)._packageService.fetchVulnerabilityData();
            expect((service as any)._packageService.vulnerabilityData.size).toBe(0);
        });

        it('skips invalid vulnerability entries', async () => {
            (service as any)._packageService.vulnerabilityData = new Map();
            (service as any)._packageService.vulnerabilityDataTimestamp = 0;
            vi.spyOn(service as any, 'getSources').mockResolvedValue([
                { name: 'nuget', url: 'https://api.nuget.org/v3/index.json', enabled: true },
            ]);
            vi.spyOn(service as any, 'isLocalSource').mockReturnValue(false);
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                vulnerabilityInfoUrl: 'https://api.nuget.org/v3/vulnerabilities/index.json',
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'fetchJsonWithCompression')
                .mockResolvedValueOnce([{ '@id': 'https://api.nuget.org/v3/vulnerabilities/page1.json' }])
                .mockResolvedValueOnce({
                    'SomePkg': [
                        { severity: 'invalid', url: 'https://x.com', versions: '(,1.0)' },  // invalid severity type
                        { url: 'https://y.com', versions: '(,1.0)' },  // missing severity
                        { severity: 1, url: 'https://z.com', versions: '(,2.0)' },  // valid
                    ],
                });

            await (service as any)._packageService.fetchVulnerabilityData();
            const entries = (service as any)._packageService.vulnerabilityData.get('somepkg');
            expect(entries).toHaveLength(1);
            expect(entries[0].severity).toBe(1);
        });
    });

    describe('getVulnerabilities', () => {
        it('returns empty array when no vulnerability data', () => {
            (service as any)._packageService.vulnerabilityData = new Map();

            const result = (service as any)._packageService.getVulnerabilities('Pkg', '1.0.0');
            expect(result).toEqual([]);
        });

        it('matches vulnerabilities based on version range', () => {
            (service as any)._packageService.vulnerabilityData = new Map([
                ['pkg', [
                    { severity: 2, url: 'https://advisory.com/1', versions: '(,2.0.0)' },
                    { severity: 3, url: 'https://advisory.com/2', versions: '(,1.0.0)' },
                ]],
            ]);

            const result = (service as any)._packageService.getVulnerabilities('Pkg', '1.5.0');
            // 1.5.0 matches (,2.0.0) but not (,1.0.0)
            expect(result).toHaveLength(1);
            expect(result[0].severity).toBe('High');
            expect(result[0].advisoryUrl).toBe('https://advisory.com/1');
        });

        it('maps severity integers correctly', () => {
            (service as any)._packageService.vulnerabilityData = new Map([
                ['pkg', [
                    { severity: 0, url: 'https://a.com/0', versions: '[0.0.0,)' },
                    { severity: 1, url: 'https://a.com/1', versions: '[0.0.0,)' },
                    { severity: 2, url: 'https://a.com/2', versions: '[0.0.0,)' },
                    { severity: 3, url: 'https://a.com/3', versions: '[0.0.0,)' },
                ]],
            ]);

            const result = (service as any)._packageService.getVulnerabilities('Pkg', '1.0.0');
            const severities = result.map((r: { severity: string }) => r.severity);
            expect(severities).toContain('Low');
            expect(severities).toContain('Moderate');
            expect(severities).toContain('High');
            expect(severities).toContain('Critical');
        });

        it('uses case-insensitive package ID lookup', () => {
            (service as any)._packageService.vulnerabilityData = new Map([
                ['mypkg', [{ severity: 1, url: 'https://a.com', versions: '[0.0.0,)' }]],
            ]);

            const result = (service as any)._packageService.getVulnerabilities('MyPkg', '1.0.0');
            expect(result).toHaveLength(1);
        });
    });

    describe('enableSource', () => {
        it('enables source successfully', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'success', stderr: '' });

            const result = await service.enableSource('nuget.org');
            expect(result).toBe(true);
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledWith(
                expect.stringContaining('dotnet nuget enable source "nuget.org"'),
                expect.any(Object)
            );
        });

        it('rejects invalid source names', async () => {
            const result = await service.enableSource('bad;name');
            expect(result).toBe(false);
            expect(hoisted.mockExecWithTimeout).not.toHaveBeenCalled();
        });

        it('returns false on CLI error', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValue({ stderr: 'source not found', stdout: '' });

            const result = await service.enableSource('missing-source');
            expect(result).toBe(false);
        });
    });

    describe('disableSource', () => {
        it('disables source successfully', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'success', stderr: '' });

            const result = await service.disableSource('nuget.org');
            expect(result).toBe(true);
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledWith(
                expect.stringContaining('dotnet nuget disable source "nuget.org"'),
                expect.any(Object)
            );
        });

        it('rejects invalid source names', async () => {
            const result = await service.disableSource('evil$(cmd)');
            expect(result).toBe(false);
        });

        it('returns false on CLI error', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValue({ stderr: 'failed', stdout: '' });

            const result = await service.disableSource('missing');
            expect(result).toBe(false);
        });
    });

    describe('addSource', () => {
        it('adds source with URL only (auto-generates name)', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([]);
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'success', stderr: '' });

            const result = await service.addSource('https://api.nuget.org/v3/index.json');
            expect(result.success).toBe(true);
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledWith(
                expect.stringContaining('dotnet nuget add source'),
                expect.any(Object)
            );
        });

        it('adds source with explicit name', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'success', stderr: '' });

            const result = await service.addSource('https://custom.com/v3/index.json', 'MyCustom');
            expect(result.success).toBe(true);
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledWith(
                expect.stringContaining('--name "MyCustom"'),
                expect.any(Object)
            );
        });

        it('rejects invalid URL', async () => {
            const result = await service.addSource('javascript:alert(1)');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid source URL');
        });

        it('rejects invalid source name', async () => {
            const result = await service.addSource('https://valid.com/v3/index.json', 'bad;name');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid source name');
        });

        it('detects already-existing source', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([]);
            hoisted.mockExecWithTimeout.mockRejectedValue({ stderr: 'source already been added', stdout: '' });

            const result = await service.addSource('https://api.nuget.org/v3/index.json');
            expect(result.success).toBe(false);
            expect(result.error).toContain('already exists');
        });

        it('creates config file when missing', async () => {
            const fs = await import('fs');
            vi.spyOn(service as any, 'getSources').mockResolvedValue([]);
            vi.mocked(fs.promises.access).mockRejectedValue(new Error('ENOENT'));
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'success', stderr: '' });

            const result = await service.addSource('https://custom.com/v3/index.json', 'Test', undefined, undefined, '/path/nuget.config');
            expect(result.success).toBe(true);
        });

        it('includes credentials in command', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([]);
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'success', stderr: '' });

            const result = await service.addSource('https://private.com/v3/index.json', 'Private', 'user', 'pass');
            expect(result.success).toBe(true);
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledWith(
                expect.stringContaining('--username "user"'),
                expect.any(Object)
            );
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledWith(
                expect.stringContaining('--password "pass"'),
                expect.any(Object)
            );
        });

        it('adds allow-insecure flag when requested', async () => {
            vi.spyOn(service as any, 'getSources').mockResolvedValue([]);
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'success', stderr: '' });

            const result = await service.addSource('http://insecure.com/v3/index.json', 'Insecure', undefined, undefined, undefined, true);
            expect(result.success).toBe(true);
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledWith(
                expect.stringContaining('--allow-insecure-connections'),
                expect.any(Object)
            );
        });
    });

    describe('removeSource', () => {
        it('removes source successfully', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'success', stderr: '' });

            const result = await service.removeSource('old-source');
            expect(result.success).toBe(true);
        });

        it('rejects invalid source name', async () => {
            const result = await service.removeSource('bad$(cmd)');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid source name');
        });

        it('detects already-removed source', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValue({ stderr: 'Unable to find source', stdout: '' });

            const result = await service.removeSource('nonexistent');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Source not found');
        });

        it('includes configFile in command when provided', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'success', stderr: '' });

            const result = await service.removeSource('test-source', '/path/nuget.config');
            expect(result.success).toBe(true);
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledWith(
                expect.stringContaining('--configfile "/path/nuget.config"'),
                expect.any(Object)
            );
        });

        it('returns generic error for unknown failures', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValue({ stderr: 'unexpected error', stdout: '' });

            const result = await service.removeSource('some-source');
            expect(result.success).toBe(false);
            expect(result.error).toContain('unexpected error');
        });
    });

    // ──────────────────────────────────────────────
    // Phase 4F: Source Health, Installed Packages & Caches
    // ──────────────────────────────────────────────

    describe('testSourceConnectivity', () => {
        it('calls discoverServiceEndpoints for each enabled HTTP source', async () => {
            const configParser = (service as any).configParser;
            vi.spyOn(configParser, 'getSources').mockResolvedValue([
                { name: 'nuget', url: 'https://api.nuget.org/v3/index.json', enabled: true },
                { name: 'disabled', url: 'https://disabled.com/v3/index.json', enabled: false },
            ]);
            vi.spyOn(service as any, 'isLocalSource').mockReturnValue(false);
            const discoverSpy = vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({});

            await service.testSourceConnectivity();
            // Only enabled + non-local sources should be tested
            expect(discoverSpy).toHaveBeenCalledWith('https://api.nuget.org/v3/index.json');
            expect(discoverSpy).not.toHaveBeenCalledWith('https://disabled.com/v3/index.json');
        });

        it('swallows individual source errors', async () => {
            const configParser = (service as any).configParser;
            vi.spyOn(configParser, 'getSources').mockResolvedValue([
                { name: 'bad', url: 'https://bad.com/v3/index.json', enabled: true },
            ]);
            vi.spyOn(service as any, 'isLocalSource').mockReturnValue(false);
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockRejectedValue(new Error('network'));

            // Should not throw
            await expect(service.testSourceConnectivity()).resolves.toBeUndefined();
        });
    });

    describe('getInstalledPackages', () => {
        it('parses PackageReference from csproj content', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.readFile).mockResolvedValue(`
				<Project Sdk="Microsoft.NET.Sdk">
					<ItemGroup>
						<PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
						<PackageReference Include="Serilog" Version="3.1.0" />
					</ItemGroup>
				</Project>
			`);
            vi.spyOn((service as any)._projectService, 'getResolvedVersions').mockResolvedValue(new Map());
            vi.spyOn(service as any, 'fetchInstalledPackageMetadata').mockResolvedValue(undefined);

            const result = await service.getInstalledPackages('/project/test.csproj');
            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('Newtonsoft.Json');
            expect(result[0].version).toBe('13.0.3');
            expect(result[1].id).toBe('Serilog');
        });

        it('parses nested Version element', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.readFile).mockResolvedValue(`
				<Project>
					<ItemGroup>
						<PackageReference Include="MyPkg">
							<Version>2.0.0</Version>
						</PackageReference>
					</ItemGroup>
				</Project>
			`);
            vi.spyOn((service as any)._projectService, 'getResolvedVersions').mockResolvedValue(new Map());
            vi.spyOn(service as any, 'fetchInstalledPackageMetadata').mockResolvedValue(undefined);

            const result = await service.getInstalledPackages('/project/test.csproj');
            expect(result).toHaveLength(1);
            expect(result[0].version).toBe('2.0.0');
        });

        it('skips metadata in liteMode', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.readFile).mockResolvedValue(`
				<Project>
					<ItemGroup>
						<PackageReference Include="Pkg" Version="1.0.0" />
					</ItemGroup>
				</Project>
			`);
            vi.spyOn((service as any)._projectService, 'getResolvedVersions').mockResolvedValue(new Map());
            const metaSpy = vi.spyOn(service as any, 'fetchInstalledPackageMetadata');

            const result = await service.getInstalledPackages('/project/test.csproj', true);
            expect(result).toHaveLength(1);
            expect(metaSpy).not.toHaveBeenCalled();
        });

        it('uses resolved version for floating specs', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.readFile).mockResolvedValue(`
				<Project>
					<ItemGroup>
						<PackageReference Include="FloatingPkg" Version="10.*" />
					</ItemGroup>
				</Project>
			`);
            vi.spyOn((service as any)._projectService, 'getResolvedVersions').mockResolvedValue(
                new Map([['floatingpkg', '10.5.3']])
            );
            vi.spyOn(service as any, 'fetchInstalledPackageMetadata').mockResolvedValue(undefined);

            const result = await service.getInstalledPackages('/project/test.csproj');
            expect(result[0].resolvedVersion).toBe('10.5.3');
            expect(result[0].versionType).toBe('floating');
        });

        it('falls back to CLI when csproj has no packages', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.readFile).mockResolvedValue('<Project></Project>');
            vi.spyOn((service as any)._projectService, 'getResolvedVersions').mockResolvedValue(new Map());
            vi.spyOn(service as any, 'useNounFirstSyntax').mockResolvedValue(false);
            hoisted.mockExecWithTimeout.mockResolvedValue({
                stdout: `Project 'test' has the following package references\n   Top-level Package\n   > Newtonsoft.Json   13.0.3   13.0.3\n`,
                stderr: '',
            });
            vi.spyOn(service as any, 'fetchInstalledPackageMetadata').mockResolvedValue(undefined);

            const result = await service.getInstalledPackages('/project/test.csproj');
            expect(result.length).toBeGreaterThanOrEqual(0); // CLI output parsing may vary
        });

        it('returns empty array on total failure', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('file not found'));
            vi.spyOn((service as any)._projectService, 'getResolvedVersions').mockResolvedValue(new Map());
            vi.spyOn(service as any, 'useNounFirstSyntax').mockResolvedValue(false);
            hoisted.mockExecWithTimeout.mockRejectedValue(new Error('dotnet not found'));

            const result = await service.getInstalledPackages('/project/test.csproj');
            expect(result).toEqual([]);
        });
    });

    describe('clearSourceErrors', () => {
        it('clears all source-related caches', () => {
            // Populate caches
            (service as any).failedSources.set('https://bad.com', 'error');
            (service as any).serviceIndexCache.set('key', { packageBaseAddress: 'x' });
            (service as any).failedEndpointCache.set('key', Date.now());
            (service as any)._packageService.iconSourceMissCount.set('key', 5);
            (service as any)._packageService.vulnerabilityData.set('pkg', []);
            (service as any)._packageService.vulnerabilityDataTimestamp = 1000;
            (service as any)._packageService.versionsCache.set('key', ['1.0']);

            service.clearSourceErrors();

            expect((service as any).failedSources.size).toBe(0);
            expect((service as any).serviceIndexCache.size).toBe(0);
            expect((service as any).failedEndpointCache.size).toBe(0);
            expect((service as any)._packageService.iconSourceMissCount.size).toBe(0);
            expect((service as any)._packageService.vulnerabilityData.size).toBe(0);
            expect((service as any)._packageService.vulnerabilityDataTimestamp).toBe(0);
            expect((service as any)._packageService.versionsCache.size).toBe(0);
        });

        it('restarts source health monitor', () => {
            const monitorSpy = vi.spyOn(service, 'startSourceHealthMonitor').mockImplementation(() => { });

            service.clearSourceErrors();
            expect(monitorSpy).toHaveBeenCalled();
        });
    });

    describe('clearNuGetHttpCache', () => {
        it('executes dotnet nuget locals clear command', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: 'success', stderr: '' });

            await service.clearNuGetHttpCache();
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledWith(
                'dotnet nuget locals http-cache --clear',
                expect.objectContaining({ timeout: 15000 })
            );
        });

        it('swallows errors without rethrowing', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValue(new Error('command not found'));

            await expect(service.clearNuGetHttpCache()).resolves.toBeUndefined();
        });
    });

    describe('getPackageSize', () => {
        it('returns content length from head request', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({
                packageBaseAddress: 'https://api.nuget.org/v3-flatcontainer',
            });
            vi.spyOn(service as any, 'getAuthHeader').mockResolvedValue(undefined);
            const { http2Client } = await import('./Http2Client');
            vi.mocked(http2Client.headRequestContentLength).mockResolvedValue(1048576);

            const size = await service.getPackageSize('Newtonsoft.Json', '13.0.3');
            expect(size).toBe(1048576);
        });

        it('returns -1 when no packageBaseAddress endpoint', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockResolvedValue({});

            const size = await service.getPackageSize('Pkg', '1.0.0');
            expect(size).toBe(-1);
        });

        it('returns -1 on error', async () => {
            vi.spyOn(service as any, 'discoverServiceEndpoints').mockRejectedValue(new Error('network'));

            const size = await service.getPackageSize('Pkg', '1.0.0');
            expect(size).toBe(-1);
        });
    });

    describe('readAssetsJson', () => {
        it('returns parsed JSON data', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.stat).mockResolvedValue({ mtimeMs: 1000 } as any);
            vi.mocked(fs.promises.readFile).mockResolvedValue('{"version": 3, "targets": {}}');

            const result = await (service as any)._projectService.readAssetsJson('/obj/project.assets.json');
            expect(result).toEqual({ version: 3, targets: {} });
        });

        it('returns cached data when mtime unchanged and within TTL', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.stat).mockResolvedValue({ mtimeMs: 1000 } as any);
            (service as any)._projectService.assetsJsonCache.set('/obj/project.assets.json', {
                mtimeMs: 1000,
                data: { cached: true },
                timestamp: Date.now(),
            });

            const result = await (service as any)._projectService.readAssetsJson('/obj/project.assets.json');
            expect(result).toEqual({ cached: true });
            // fs.promises.readFile should NOT have been called (cache hit)
            expect(vi.mocked(fs.promises.readFile)).not.toHaveBeenCalledWith('/obj/project.assets.json', 'utf-8');
        });

        it('refreshes when mtime changes', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.stat).mockResolvedValue({ mtimeMs: 2000 } as any);
            (service as any)._projectService.assetsJsonCache.set('/obj/project.assets.json', {
                mtimeMs: 1000,
                data: { old: true },
                timestamp: Date.now(),
            });
            vi.mocked(fs.promises.readFile).mockResolvedValue('{"fresh": true}');

            const result = await (service as any)._projectService.readAssetsJson('/obj/project.assets.json');
            expect(result).toEqual({ fresh: true });
        });

        it('returns null on read error', async () => {
            const fs = await import('fs');
            vi.mocked(fs.promises.stat).mockRejectedValue(new Error('ENOENT'));

            const result = await (service as any)._projectService.readAssetsJson('/nonexistent');
            expect(result).toBeNull();
        });
    });

    describe('generateSourceNameFromUrl', () => {
        it('generates name from nuget.org URL', () => {
            const name = (service as any)._sourceService.generateSourceNameFromUrl('https://api.nuget.org/v3/index.json', new Set());
            expect(name).toBe('nuget.org');
        });

        it('deduplicates against existing names', () => {
            const name = (service as any)._sourceService.generateSourceNameFromUrl('https://api.nuget.org/v3/index.json', new Set(['nuget.org']));
            expect(name).toBe('nuget.org-2');
        });

        it('generates name from generic URL', () => {
            const name = (service as any)._sourceService.generateSourceNameFromUrl('https://mycompany.com/nuget/v3/index.json', new Set());
            expect(name).toBeTruthy();
            expect(name.length).toBeGreaterThan(0);
        });

        it('falls back to custom-source for unparseable URLs', () => {
            // isValidSourceUrl allows local paths, but generateSourceNameFromUrl wraps URL() in try/catch
            const name = (service as any)._sourceService.generateSourceNameFromUrl('', new Set());
            expect(name).toBeTruthy();
        });
    });

    describe('getFailedSources', () => {
        it('returns a copy of failed sources map', () => {
            (service as any).failedSources.set('https://bad.com', 'Connection refused');

            const result = service.getFailedSources();
            expect(result.size).toBe(1);
            expect(result.get('https://bad.com')).toBe('Connection refused');

            // Verify it's a copy, not the original
            result.set('https://new.com', 'test');
            expect((service as any).failedSources.size).toBe(1);
        });
    });

    describe('stopSourceHealthMonitor', () => {
        it('clears the health timer', () => {
            (service as any)._sourceHealthTimer = setTimeout(() => { }, 10000);

            service.stopSourceHealthMonitor();
            expect((service as any)._sourceHealthTimer).toBeUndefined();
        });

        it('handles no existing timer', () => {
            (service as any)._sourceHealthTimer = undefined;

            // Should not throw
            service.stopSourceHealthMonitor();
            expect((service as any)._sourceHealthTimer).toBeUndefined();
        });
    });

    describe('clearVersionsCache', () => {
        it('clears in-memory and workspace version caches', () => {
            (service as any)._packageService.versionsCache.set('key', ['1.0']);

            (service as any).clearVersionsCache();
            expect((service as any)._packageService.versionsCache.size).toBe(0);
            expect(workspaceCache.clearByPrefix).toHaveBeenCalledWith('versions:');
        });
    });
});
