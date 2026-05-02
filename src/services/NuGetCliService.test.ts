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
            await service.flushPersistedSdkCache();
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
            await service.flushPersistedSdkCache();
            expect(store.update).toHaveBeenCalledWith('k', { v: '1.0.0', entries: { '/dirA': 10 } });
        });

        it('clears persisted snapshot when cache is cleared', async () => {
            const store = makeMemento({ v: '1.0.0', entries: { '/dirA': 8 } });
            service.hydrateSdkVersionCache(store as any, 'k', '1.0.0');
            service.clearSdkVersionCache();
            await service.flushPersistedSdkCache();
            expect(store.update).toHaveBeenLastCalledWith('k', undefined);
        });

        // Plan 11 fix (B3): failed `dotnet --version` probes must NOT persist
        // the fallback `9` to globalState. Otherwise a transient failure (e.g.
        // dotnet not on PATH at first activation) would survive across sessions
        // and mask a now-working SDK until the user manually clears the cache.
        it('does not persist the fallback when SDK probe fails', async () => {
            const store = makeMemento(undefined);
            service.hydrateSdkVersionCache(store as any, 'k', '1.0.0');
            hoisted.mockExecWithTimeout.mockRejectedValueOnce(new Error('dotnet not found'));
            const v = await service.getSdkMajorVersion('/badDir/App.csproj');
            await service.flushPersistedSdkCache();
            expect(v).toBe(9);
            // No write happened: only the (no-op) `update` calls from hydrate paths
            // would appear, and our hydrate of `undefined` doesn't trigger any.
            expect(store.update).not.toHaveBeenCalled();
        });

        // Plan 11 fix (I2): cap the persisted cache to bound globalState growth
        // across long-lived installs that touch many transient project paths.
        it('caps persisted cache at 256 entries (FIFO/insertion-order eviction)', async () => {
            const store = makeMemento(undefined);
            service.hydrateSdkVersionCache(store as any, 'k', '1.0.0');
            // Probe 257 distinct directories. Each persists; the last write
            // contains entries for the most-recent 256 directories only.
            for (let i = 0; i < 257; i++) {
                hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: '10.0.0\n', stderr: '' });
                await service.getSdkMajorVersion(`/d${i}/A.csproj`);
            }
            await service.flushPersistedSdkCache();
            const lastCall = store.update.mock.calls[store.update.mock.calls.length - 1];
            const persistedEntries = (lastCall[1] as { entries: Record<string, number> }).entries;
            expect(Object.keys(persistedEntries).length).toBe(256);
            // The earliest directory was evicted; the latest is retained.
            expect(persistedEntries['/d0']).toBeUndefined();
            expect(persistedEntries['/d256']).toBe(10);
        });

        // Plan 11 fix (B4): concurrent set/clear writes must not race. With
        // serialization, the last operation wins; without it, an in-flight
        // `set` write could land after `clear` and resurrect old entries.
        it('serializes persistence writes through a single chain', async () => {
            const store = makeMemento(undefined);
            service.hydrateSdkVersionCache(store as any, 'k', '1.0.0');
            // Schedule two probes back-to-back without awaiting the chain
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: '10\n', stderr: '' });
            await service.getSdkMajorVersion('/x/A.csproj');
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: '9\n', stderr: '' });
            await service.getSdkMajorVersion('/y/B.csproj');
            service.clearSdkVersionCache();
            await service.flushPersistedSdkCache();
            // Last call must be the clear (undefined). Without chaining,
            // the second `set` could race past the clear.
            expect(store.update).toHaveBeenLastCalledWith('k', undefined);
        });

        // Post-rubber-duck fix: in-flight probes must discard their result if
        // clearSdkVersionCache() runs while they're awaiting `dotnet --version`.
        // Without the epoch guard, the slow probe would re-populate (and persist)
        // stale data after the user explicitly cleared the cache.
        it('discards in-flight probe results when clear runs mid-probe', async () => {
            const store = makeMemento(undefined);
            service.hydrateSdkVersionCache(store as any, 'k', '1.0.0');
            // First probe: stalls until we resolve it manually.
            let resolveProbe: (v: { stdout: string; stderr: string }) => void = () => { };
            hoisted.mockExecWithTimeout.mockImplementationOnce(
                () => new Promise(r => { resolveProbe = r; })
            );
            const probePromise = service.getSdkMajorVersion('/slow/A.csproj');
            // Clear before the probe resolves.
            service.clearSdkVersionCache();
            // Now let the probe finish — its result must be discarded.
            resolveProbe({ stdout: '10\n', stderr: '' });
            await probePromise;
            await service.flushPersistedSdkCache();
            // Last persistence write is the clear; no resurrected snapshot.
            expect(store.update).toHaveBeenLastCalledWith('k', undefined);
            // A fresh probe should re-run dotnet (not return the discarded value).
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({ stdout: '11\n', stderr: '' });
            expect(await service.getSdkMajorVersion('/slow/A.csproj')).toBe(11);
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
