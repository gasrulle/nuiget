import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createMockOutputChannel } from '../test/helpers/backend';
import { NuGetLogger } from './NuGetLogger';

// ──────────────────────────────────────────────
// Hoist mocks
// ──────────────────────────────────────────────
const hoisted = vi.hoisted(() => ({
    mockExecWithTimeout: vi.fn(),
}));

vi.mock('./NuGetUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./NuGetUtils')>();
    return {
        ...actual,
        execWithTimeout: hoisted.mockExecWithTimeout,
    };
});

// Import after mock wiring
import { NuGetCliService } from './NuGetCliService';

describe('NuGetCliService', () => {
    let service: NuGetCliService;
    let logger: NuGetLogger;

    beforeEach(() => {
        vi.clearAllMocks();
        const channel = createMockOutputChannel();
        logger = new NuGetLogger(channel as any);
        service = new NuGetCliService(logger);
    });

    afterEach(() => {
        service.clearSdkVersionCache();
    });

    // ──────────────────────────────────────────────
    // getSdkMajorVersion
    // ──────────────────────────────────────────────
    describe('getSdkMajorVersion', () => {
        it('returns parsed major version from dotnet --version', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: '10.0.100\n', stderr: '' });
            const result = await service.getSdkMajorVersion('/projects/MyApp/MyApp.csproj');
            expect(result).toBe(10);
        });

        it('falls back to 9 when version is not a number', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: 'not-a-version', stderr: '' });
            const result = await service.getSdkMajorVersion('/projects/App/App.csproj');
            expect(result).toBe(9);
        });

        it('falls back to 9 on exec error', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValueOnce(new Error('dotnet not found'));
            const result = await service.getSdkMajorVersion('/err/App.csproj');
            expect(result).toBe(9);
        });

        it('caches result per project directory', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: '8.0.300\n', stderr: '' });
            await service.getSdkMajorVersion('/dir1/App.csproj');
            const cached = await service.getSdkMajorVersion('/dir1/App.csproj');
            expect(cached).toBe(8);
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledTimes(1);
        });

        it('uses different cache entries for different directories', async () => {
            hoisted.mockExecWithTimeout
                .mockResolvedValueOnce({ stdout: '8.0.300\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: '10.0.100\n', stderr: '' });
            const v1 = await service.getSdkMajorVersion('/dirA/App.csproj');
            const v2 = await service.getSdkMajorVersion('/dirB/App.csproj');
            expect(v1).toBe(8);
            expect(v2).toBe(10);
        });
    });

    // ──────────────────────────────────────────────
    // Plan 11: hydrateSdkVersionCache
    // ──────────────────────────────────────────────
    describe('hydrateSdkVersionCache', () => {
        const makeMemento = (initial?: unknown) => {
            let value: unknown = initial;
            return {
                get: vi.fn((_k: string) => value),
                update: vi.fn((_k: string, v: unknown) => { value = v; return Promise.resolve(); }),
                keys: () => [] as readonly string[],
                _value: () => value,
            };
        };

        it('hydrates entries when stored version matches current', async () => {
            const store = makeMemento({ v: '1.2.3', entries: { '/dirA': 8, '/dirB': 10 } });
            service.hydrateSdkVersionCache(store as any, 'k', '1.2.3');
            const v = await service.getSdkMajorVersion('/dirA/App.csproj');
            expect(v).toBe(8);
            expect(hoisted.mockExecWithTimeout).not.toHaveBeenCalled();
        });

        it('discards snapshot when extension version differs', async () => {
            const store = makeMemento({ v: '1.0.0', entries: { '/dirA': 8 } });
            service.hydrateSdkVersionCache(store as any, 'k', '2.0.0');
            expect(store.update).toHaveBeenCalledWith('k', undefined);
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: '10.0.100\n', stderr: '' });
            const v = await service.getSdkMajorVersion('/dirA/App.csproj');
            expect(v).toBe(10);
        });

        it('ignores corrupt or missing snapshot', async () => {
            const store = makeMemento(undefined);
            service.hydrateSdkVersionCache(store as any, 'k', '1.0.0');
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: '9.0.0\n', stderr: '' });
            expect(await service.getSdkMajorVersion('/x/A.csproj')).toBe(9);
        });

        it('persists newly probed entries through the Memento', async () => {
            const store = makeMemento(undefined);
            service.hydrateSdkVersionCache(store as any, 'k', '1.0.0');
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: '10.0.1\n', stderr: '' });
            await service.getSdkMajorVersion('/dirA/App.csproj');
            expect(store.update).toHaveBeenCalledWith('k', { v: '1.0.0', entries: { '/dirA': 10 } });
        });

        it('clears persisted snapshot when cache is cleared', async () => {
            const store = makeMemento({ v: '1.0.0', entries: { '/dirA': 8 } });
            service.hydrateSdkVersionCache(store as any, 'k', '1.0.0');
            service.clearSdkVersionCache();
            expect(store.update).toHaveBeenLastCalledWith('k', undefined);
        });
    });

    // ──────────────────────────────────────────────
    // useNounFirstSyntax
    // ──────────────────────────────────────────────
    describe('useNounFirstSyntax', () => {
        it('returns true for SDK >= 10', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: '10.0.100\n', stderr: '' });
            expect(await service.useNounFirstSyntax('/proj/A.csproj')).toBe(true);
        });

        it('returns false for SDK < 10', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: '9.0.200\n', stderr: '' });
            expect(await service.useNounFirstSyntax('/proj/B.csproj')).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // installPackage
    // ──────────────────────────────────────────────
    describe('installPackage', () => {
        it('returns false for invalid package ID', async () => {
            const result = await service.installPackage('/proj/App.csproj', '../../bad');
            expect(result).toBe(false);
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Invalid package ID'));
        });

        it('returns false for invalid version', async () => {
            const result = await service.installPackage('/proj/App.csproj', 'Newtonsoft.Json', 'not|valid');
            expect(result).toBe(false);
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Invalid version'));
        });

        it('installs successfully with old syntax (SDK < 10)', async () => {
            hoisted.mockExecWithTimeout
                .mockResolvedValueOnce({ stdout: '9.0.200\n', stderr: '' }) // getSdkMajorVersion
                .mockResolvedValueOnce({ stdout: 'Package added', stderr: '' }); // install
            const result = await service.installPackage('/proj/App.csproj', 'Newtonsoft.Json', '13.0.3');
            expect(result).toBe(true);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('Successfully installed'));
            const cmd = hoisted.mockExecWithTimeout.mock.calls[1][0] as string;
            expect(cmd).toContain('dotnet add');
            expect(cmd).toContain('--version 13.0.3');
        });

        it('installs with noun-first syntax (SDK >= 10)', async () => {
            hoisted.mockExecWithTimeout
                .mockResolvedValueOnce({ stdout: '10.0.100\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: 'Package added', stderr: '' });
            const result = await service.installPackage('/proj/App.csproj', 'Newtonsoft.Json');
            expect(result).toBe(true);
            const cmd = hoisted.mockExecWithTimeout.mock.calls[1][0] as string;
            expect(cmd).toContain('dotnet package add');
        });

        it('returns false when stderr contains error keyword', async () => {
            hoisted.mockExecWithTimeout
                .mockResolvedValueOnce({ stdout: '9.0.200\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: '', stderr: 'error NU1102: Unable to find package' });
            const result = await service.installPackage('/proj/App.csproj', 'NonExistent.Pkg');
            expect(result).toBe(false);
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });

        it('returns false when exec throws', async () => {
            hoisted.mockExecWithTimeout
                .mockResolvedValueOnce({ stdout: '9.0.200\n', stderr: '' })
                .mockRejectedValueOnce({ stderr: 'timeout', stdout: '' });
            const result = await service.installPackage('/proj/App.csproj', 'SomePkg', '1.0.0');
            expect(result).toBe(false);
        });

        it('includes source argument when sourceUrl is provided', async () => {
            hoisted.mockExecWithTimeout
                .mockResolvedValueOnce({ stdout: '9.0.200\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: 'ok', stderr: '' });
            await service.installPackage('/proj/App.csproj', 'Pkg', '1.0.0', { sourceUrl: 'https://api.nuget.org/v3/index.json' });
            const cmd = hoisted.mockExecWithTimeout.mock.calls[1][0] as string;
            expect(cmd).toContain('--source');
        });
    });

    // ──────────────────────────────────────────────
    // updatePackage
    // ──────────────────────────────────────────────
    describe('updatePackage', () => {
        it('returns false for invalid package ID', async () => {
            const result = await service.updatePackage('/proj/App.csproj', '../../bad', '1.0.0');
            expect(result).toBe(false);
        });

        it('returns false for invalid version', async () => {
            const result = await service.updatePackage('/proj/App.csproj', 'ValidPkg', '');
            expect(result).toBe(false);
        });

        it('updates successfully', async () => {
            hoisted.mockExecWithTimeout
                .mockResolvedValueOnce({ stdout: '9.0.200\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: 'Package updated', stderr: '' });
            const result = await service.updatePackage('/proj/App.csproj', 'Newtonsoft.Json', '14.0.0');
            expect(result).toBe(true);
        });

        it('skips notification when skipNotification is true', async () => {
            hoisted.mockExecWithTimeout
                .mockResolvedValueOnce({ stdout: '9.0.200\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: 'ok', stderr: '' });
            await service.updatePackage('/proj/App.csproj', 'Pkg', '2.0.0', { skipNotification: true });
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('returns false and shows error on failure', async () => {
            hoisted.mockExecWithTimeout
                .mockResolvedValueOnce({ stdout: '9.0.200\n', stderr: '' })
                .mockRejectedValueOnce({ stderr: 'network error', stdout: '' });
            const result = await service.updatePackage('/proj/App.csproj', 'Pkg', '2.0.0');
            expect(result).toBe(false);
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // removePackage
    // ──────────────────────────────────────────────
    describe('removePackage', () => {
        it('returns false for invalid package ID', async () => {
            const result = await service.removePackage('/proj/App.csproj', '../../../etc');
            expect(result).toBe(false);
        });

        it('removes successfully and runs restore by default', async () => {
            hoisted.mockExecWithTimeout
                .mockResolvedValueOnce({ stdout: '9.0.200\n', stderr: '' }) // sdk
                .mockResolvedValueOnce({ stdout: 'removed', stderr: '' }) // remove
                .mockResolvedValueOnce({ stdout: 'restored', stderr: '' }); // restore
            const result = await service.removePackage('/proj/App.csproj', 'OldPkg');
            expect(result).toBe(true);
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledTimes(3);
        });

        it('skips restore when skipRestore is true', async () => {
            hoisted.mockExecWithTimeout
                .mockResolvedValueOnce({ stdout: '9.0.200\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: 'removed', stderr: '' });
            await service.removePackage('/proj/App.csproj', 'Pkg', { skipRestore: true });
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledTimes(2);
        });

        it('returns false on exec error', async () => {
            hoisted.mockExecWithTimeout
                .mockResolvedValueOnce({ stdout: '9.0.200\n', stderr: '' })
                .mockRejectedValueOnce({ stderr: 'fail', stdout: '' });
            const result = await service.removePackage('/proj/App.csproj', 'Pkg');
            expect(result).toBe(false);
        });

        it('continues successfully even if restore fails', async () => {
            hoisted.mockExecWithTimeout
                .mockResolvedValueOnce({ stdout: '9.0.200\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: 'removed', stderr: '' })
                .mockRejectedValueOnce({ stderr: 'restore fail', stdout: '' }); // restore fails
            const result = await service.removePackage('/proj/App.csproj', 'Pkg');
            expect(result).toBe(true); // remove succeeded even though restore failed
        });
    });

    // ──────────────────────────────────────────────
    // restoreProject
    // ──────────────────────────────────────────────
    describe('restoreProject', () => {
        it('restores successfully', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: 'restored', stderr: '' });
            const result = await service.restoreProject('/proj/App.csproj');
            expect(result).toBe(true);
        });

        it('returns false on failure', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValueOnce({ stderr: 'error', stdout: '' });
            const result = await service.restoreProject('/proj/App.csproj');
            expect(result).toBe(false);
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // clearNuGetHttpCache
    // ──────────────────────────────────────────────
    describe('clearNuGetHttpCache', () => {
        it('runs cache clear command', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: 'cleared', stderr: '' });
            await service.clearNuGetHttpCache();
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledWith(
                'dotnet nuget locals http-cache --clear',
                expect.objectContaining({ timeout: 15000 }),
            );
        });

        it('logs warning on failure instead of throwing', async () => {
            hoisted.mockExecWithTimeout.mockRejectedValueOnce(new Error('fail'));
            // Should not throw
            await service.clearNuGetHttpCache();
        });
    });

    // ──────────────────────────────────────────────
    // clearSdkVersionCache
    // ──────────────────────────────────────────────
    describe('clearSdkVersionCache', () => {
        it('clears the cache so next call re-fetches', async () => {
            hoisted.mockExecWithTimeout.mockResolvedValue({ stdout: '9.0.200\n', stderr: '' });
            await service.getSdkMajorVersion('/proj/App.csproj');
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledTimes(1);

            service.clearSdkVersionCache();
            await service.getSdkMajorVersion('/proj/App.csproj');
            expect(hoisted.mockExecWithTimeout).toHaveBeenCalledTimes(2);
        });
    });
});
