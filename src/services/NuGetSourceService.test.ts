import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createMockOutputChannel } from '../test/helpers/backend';
import { NuGetLogger } from './NuGetLogger';
import { NuGetSourceService } from './NuGetSourceService';

// ──────────────────────────────────────────────
// Hoist mocks
// ──────────────────────────────────────────────
const hoisted = vi.hoisted(() => ({
    mockExecWithTimeout: vi.fn(),
    mockGetSources: vi.fn(),
    mockGetConfigFilePaths: vi.fn(),
    mockFsAccess: vi.fn(),
    mockFsWriteFile: vi.fn(),
}));

vi.mock('./NuGetUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./NuGetUtils')>();
    return {
        ...actual,
        execWithTimeout: hoisted.mockExecWithTimeout,
    };
});

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        promises: {
            ...actual.promises,
            access: hoisted.mockFsAccess,
            writeFile: hoisted.mockFsWriteFile,
        },
    };
});

describe('NuGetSourceService', () => {
    let service: NuGetSourceService;
    let mockConfigParser: any;
    let mockOnSourceMutated: () => void;

    beforeEach(() => {
        vi.clearAllMocks();
        const channel = createMockOutputChannel();
        const logger = new NuGetLogger(channel as any);
        mockConfigParser = {
            getSources: hoisted.mockGetSources.mockResolvedValue([]),
            getConfigFilePaths: hoisted.mockGetConfigFilePaths.mockReturnValue([]),
        };
        mockOnSourceMutated = vi.fn() as unknown as () => void;
        service = new NuGetSourceService(mockConfigParser, logger, mockOnSourceMutated);
    });

    // ──────────────────────────────────────────────
    // getSources (caching)
    // ──────────────────────────────────────────────
    describe('getSources', () => {
        it('delegates to configParser on first call', async () => {
            const sources = [{ name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true }];
            hoisted.mockGetSources.mockResolvedValueOnce(sources);
            const result = await service.getSources();
            expect(result).toEqual(sources);
            expect(hoisted.mockGetSources).toHaveBeenCalledTimes(1);
        });

        it('returns cached result within TTL', async () => {
            hoisted.mockGetSources.mockResolvedValueOnce([{ name: 'a' }]);
            await service.getSources();
            const result = await service.getSources();
            expect(hoisted.mockGetSources).toHaveBeenCalledTimes(1);
            expect(result).toEqual([{ name: 'a' }]);
        });

        it('re-fetches after invalidation', async () => {
            hoisted.mockGetSources.mockResolvedValueOnce([{ name: 'old' }]);
            await service.getSources();
            service.invalidateSourcesCache();
            hoisted.mockGetSources.mockResolvedValueOnce([{ name: 'new' }]);
            const result = await service.getSources();
            expect(result).toEqual([{ name: 'new' }]);
            expect(hoisted.mockGetSources).toHaveBeenCalledTimes(2);
        });
    });

    // ──────────────────────────────────────────────
    // enableSource / disableSource
    // ──────────────────────────────────────────────
    describe('enableSource', () => {
        it('runs dotnet nuget enable source command', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: 'ok', stderr: '' });
            const result = await service.enableSource('nuget.org');
            expect(result).toBe(true);
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledWith(
                'dotnet nuget enable source "nuget.org"',
                expect.any(Object),
            );
            expect(mockOnSourceMutated).toHaveBeenCalled();
        });

        it('returns false for invalid source name', async () => {
            const result = await service.enableSource('bad<name>');
            expect(result).toBe(false);
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });

        it('returns false on exec error', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValueOnce({ stderr: 'not found', stdout: '' });
            const result = await service.enableSource('missing-source');
            expect(result).toBe(false);
        });
    });

    describe('disableSource', () => {
        it('runs dotnet nuget disable source command', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: 'ok', stderr: '' });
            const result = await service.disableSource('my-source');
            expect(result).toBe(true);
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledWith(
                'dotnet nuget disable source "my-source"',
                expect.any(Object),
            );
        });
    });

    // ──────────────────────────────────────────────
    // addSource
    // ──────────────────────────────────────────────
    describe('addSource', () => {
        it('returns error for invalid URL', async () => {
            const result = await service.addSource('ftp://bad<>source');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid source URL');
        });

        it('returns error for invalid name', async () => {
            const result = await service.addSource('https://api.nuget.org/v3/index.json', '<bad>');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid source name');
        });

        it('adds source with explicit name', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: 'ok', stderr: '' });
            const result = await service.addSource('https://api.nuget.org/v3/index.json', 'my-nuget');
            expect(result.success).toBe(true);
            expect(mockOnSourceMutated).toHaveBeenCalled();
            const cmd = hoisted.mockExecWithTimeout.mock.calls[0][0] as string;
            expect(cmd).toContain('--name "my-nuget"');
        });

        it('auto-generates name when not provided', async () => {
            hoisted.mockGetSources.mockResolvedValueOnce([]);
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: 'ok', stderr: '' });
            const result = await service.addSource('https://api.nuget.org/v3/index.json');
            expect(result.success).toBe(true);
            const cmd = hoisted.mockExecWithTimeout.mock.calls[0][0] as string;
            expect(cmd).toContain('--name "nuget.org"');
        });

        it('creates nuget.config when configFile does not exist', async () => {
            hoisted.mockFsAccess.mockRejectedValueOnce(new Error('ENOENT'));
            hoisted.mockFsWriteFile.mockResolvedValueOnce(undefined);
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: 'ok', stderr: '' });
            const result = await service.addSource('https://api.nuget.org/v3/index.json', 'test', undefined, undefined, '/path/nuget.config');
            expect(result.success).toBe(true);
            expect(hoisted.mockFsWriteFile).toHaveBeenCalledWith('/path/nuget.config', expect.stringContaining('<configuration>'), 'utf8');
        });

        it('returns error when config file creation fails', async () => {
            hoisted.mockFsAccess.mockRejectedValueOnce(new Error('ENOENT'));
            hoisted.mockFsWriteFile.mockRejectedValueOnce(new Error('EACCES'));
            const result = await service.addSource('https://api.nuget.org/v3/index.json', 'test', undefined, undefined, '/path/nuget.config');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to create nuget.config');
        });

        it('includes username and password arguments', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: 'ok', stderr: '' });
            await service.addSource('https://feed.example.com/v3/index.json', 'private-feed', 'user', 'pass');
            const cmd = hoisted.mockExecWithTimeout.mock.calls[0][0] as string;
            expect(cmd).toContain('--username "user"');
            expect(cmd).toContain('--password "pass"');
        });

        it('rejects username with shell metacharacters', async () => {
            const result = await service.addSource('https://feed.example.com/v3/index.json', 'feed', 'user"$(id)');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid username');
        });

        it('rejects password with shell metacharacters', async () => {
            const result = await service.addSource('https://feed.example.com/v3/index.json', 'feed', 'user', 'pass`cmd`');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid password');
        });

        it('returns specific error for duplicate source name', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValueOnce({ stderr: 'has already been added', stdout: '' });
            const result = await service.addSource('https://api.nuget.org/v3/index.json', 'dup');
            expect(result.success).toBe(false);
            expect(result.error).toContain('already exists');
        });
    });

    // ──────────────────────────────────────────────
    // removeSource
    // ──────────────────────────────────────────────
    describe('removeSource', () => {
        it('returns error for invalid name', async () => {
            const result = await service.removeSource('<bad>');
            expect(result.success).toBe(false);
        });

        it('removes source successfully', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: 'ok', stderr: '' });
            const result = await service.removeSource('old-source');
            expect(result.success).toBe(true);
            expect(mockOnSourceMutated).toHaveBeenCalled();
        });

        it('includes configfile argument when provided', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: 'ok', stderr: '' });
            await service.removeSource('src', '/path/nuget.config');
            const cmd = hoisted.mockExecWithTimeout.mock.calls[0][0] as string;
            expect(cmd).toContain('--configfile "/path/nuget.config"');
        });

        it('returns specific error for source not found', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValueOnce({ stderr: 'Unable to find', stdout: '' });
            const result = await service.removeSource('nonexistent');
            expect(result.success).toBe(false);
            expect(result.error).toContain('Source not found');
        });
    });

    // ──────────────────────────────────────────────
    // getConfigFilePaths
    // ──────────────────────────────────────────────
    describe('getConfigFilePaths', () => {
        it('delegates to configParser', () => {
            const paths = [{ label: 'Workspace', path: '/ws/nuget.config' }];
            hoisted.mockGetConfigFilePaths.mockReturnValueOnce(paths);
            expect(service.getConfigFilePaths()).toEqual(paths);
        });
    });

    // ──────────────────────────────────────────────
    // isLocalSource
    // ──────────────────────────────────────────────
    describe('isLocalSource', () => {
        it('returns true for file paths', () => {
            expect(service.isLocalSource('C:\\packages')).toBe(true);
            expect(service.isLocalSource('/usr/local/nuget')).toBe(true);
            expect(service.isLocalSource('\\\\server\\share')).toBe(true);
        });

        it('returns false for HTTP URLs', () => {
            expect(service.isLocalSource('https://api.nuget.org/v3/index.json')).toBe(false);
            expect(service.isLocalSource('http://my-feed.example.com')).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // generateSourceNameFromUrl
    // ──────────────────────────────────────────────
    describe('generateSourceNameFromUrl', () => {
        const empty = new Set<string>();

        it('generates nuget.org from NuGet URLs', () => {
            expect(service.generateSourceNameFromUrl('https://api.nuget.org/v3/index.json', empty)).toBe('nuget.org');
        });

        it('generates names from Azure DevOps URLs', () => {
            const result = service.generateSourceNameFromUrl(
                'https://pkgs.dev.azure.com/myorg/_packaging/myfeed/nuget/v3/index.json', empty,
            );
            expect(result).toContain('myorg');
            expect(result).toContain('myfeed');
        });

        it('generates names from GitHub Packages URLs', () => {
            const result = service.generateSourceNameFromUrl('https://nuget.pkg.github.com/myowner/index.json', empty);
            expect(result).toContain('github');
            expect(result).toContain('myowner');
        });

        it('generates names from MyGet URLs', () => {
            const result = service.generateSourceNameFromUrl('https://www.myget.org/F/customfeed/api/v3/index.json', empty);
            expect(result).toContain('myget');
            expect(result).toContain('customfeed');
        });

        it('generates names from JFrog URLs', () => {
            const result = service.generateSourceNameFromUrl('https://mycompany.jfrog.io/artifactory/api/nuget/v3/my-repo', empty);
            expect(result).toContain('mycompany');
        });

        it('generates generic name from unknown URL', () => {
            const result = service.generateSourceNameFromUrl('https://packages.example.com/nuget/v3/index.json', empty);
            expect(result).toBe('packages');
        });

        it('generates name from local path', () => {
            const result = service.generateSourceNameFromUrl('C:\\NuGet\\LocalPackages', empty);
            expect(result).toBe('LocalPackages');
        });

        it('appends -2 suffix for duplicate names', () => {
            const existing = new Set(['nuget.org']);
            const result = service.generateSourceNameFromUrl('https://api.nuget.org/v3/index.json', existing);
            expect(result).toBe('nuget.org-2');
        });

        it('appends -3 suffix when -2 already exists', () => {
            const existing = new Set(['nuget.org', 'nuget.org-2']);
            const result = service.generateSourceNameFromUrl('https://api.nuget.org/v3/index.json', existing);
            expect(result).toBe('nuget.org-3');
        });

        it('falls back to custom-source for unparseable URLs', () => {
            // An empty string after sanitisation produces 'custom-source'
            const result = service.generateSourceNameFromUrl('', empty);
            expect(result).toBe('custom-source');
        });
    });
});
