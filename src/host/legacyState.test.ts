import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../core/contracts';
import { TieredCache } from '../core/cache';
import { createMockExtensionContext } from '../test/__mocks__/vscode';
import { LEGACY_GLOBAL_KEYS, LEGACY_WORKSPACE_KEYS, sweepLegacyState } from './legacyState';

function fakeLogger() {
    return { trace: vi.fn<Logger['trace']>(), debug: vi.fn<Logger['debug']>(), info: vi.fn<Logger['info']>(), warn: vi.fn<Logger['warn']>(), error: vi.fn<Logger['error']>() } satisfies Logger;
}

const flushMicrotasks = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
};

describe('sweepLegacyState', () => {
    it('removes the seven workspaceState and two globalState keys of 1.x and reports them', async () => {
        const context = createMockExtensionContext();
        for (const key of LEGACY_WORKSPACE_KEYS) {
            await context.workspaceState.update(key, 'x');
        }
        for (const key of LEGACY_GLOBAL_KEYS) {
            await context.globalState.update(key, 1);
        }
        const logger = fakeLogger();
        const { removed } = await sweepLegacyState(context as never, logger);
        expect([...removed].sort()).toEqual([...LEGACY_WORKSPACE_KEYS, ...LEGACY_GLOBAL_KEYS].sort());
        expect(LEGACY_WORKSPACE_KEYS).toHaveLength(7);
        expect(LEGACY_GLOBAL_KEYS).toHaveLength(2);
        for (const key of LEGACY_WORKSPACE_KEYS) {
            expect(context.workspaceState.get(key)).toBeUndefined();
        }
        for (const key of LEGACY_GLOBAL_KEYS) {
            expect(context.globalState.get(key)).toBeUndefined();
        }
        expect(logger.info).toHaveBeenCalledWith('Removed 9 entries of 1.x state');
    });

    it('removes nuiget.cache.* entries the TieredCache index does not list and keeps the index and what it lists', async () => {
        const context = createMockExtensionContext();
        const cache = new TieredCache({ store: context.workspaceState });
        cache.set('icon:p@1|s', 'data:', 'iconFound');
        cache.set('readme:p@1|s', '# Readme', 'readme');
        await flushMicrotasks();
        const survivors = context.workspaceState.keys().filter(key => key.startsWith('nuiget.cache.'));
        expect(survivors.length).toBeGreaterThanOrEqual(3);
        // A 1.x WorkspaceCache entry under the same prefix.
        await context.workspaceState.update('nuiget.cache.versions:legacy|https://api.nuget.org/v3/index.json', { value: ['1.0.0'], expiresAt: 1, storedAt: 0 });

        const { removed } = await sweepLegacyState(context as never, fakeLogger());
        expect(removed).toEqual(['nuiget.cache.versions:legacy|https://api.nuget.org/v3/index.json']);
        for (const key of survivors) {
            expect(context.workspaceState.get(key), key).toBeDefined();
        }
        // A new cache over the same store still finds what the old one wrote.
        expect(new TieredCache({ store: context.workspaceState }).get('readme:p@1|s')).toBe('# Readme');
    });

    it('keeps nuiget.selectedProject, nuiget.layout.splitPosition, nuiget.layout.sidebarSectionSplit and nuiget.sdkVersionCache.v2, and migrates nothing', async () => {
        const context = createMockExtensionContext();
        await context.workspaceState.update('nuiget.selectedProject', '/w/App/App.csproj');
        await context.workspaceState.update('nuiget.layout.sidebarSectionSplit', 40);
        await context.globalState.update('nuiget.layout.splitPosition', 30);
        await context.globalState.update('nuiget.sdkVersionCache.v2', { version: '0.0.0-test', entries: [] });
        await context.workspaceState.update('nuget.selectedProject', '/w/Lib/Lib.csproj');
        context.workspaceState.update.mockClear();
        context.globalState.update.mockClear();

        const { removed } = await sweepLegacyState(context as never, fakeLogger());
        expect(removed).toEqual(['nuget.selectedProject']);
        expect(context.workspaceState.get('nuiget.selectedProject')).toBe('/w/App/App.csproj');
        expect(context.workspaceState.get('nuiget.layout.sidebarSectionSplit')).toBe(40);
        expect(context.globalState.get('nuiget.layout.splitPosition')).toBe(30);
        expect(context.globalState.get('nuiget.sdkVersionCache.v2')).toEqual({ version: '0.0.0-test', entries: [] });
        const written = [...context.workspaceState.update.mock.calls, ...context.globalState.update.mock.calls].map(call => call[0] as string);
        expect(written.filter(key => key.startsWith('nuiget.'))).toEqual([]);
    });

    it('writes nothing when there is nothing to sweep', async () => {
        const context = createMockExtensionContext();
        const logger = fakeLogger();
        expect(await sweepLegacyState(context as never, logger)).toEqual({ removed: [] });
        expect(context.workspaceState.update).not.toHaveBeenCalled();
        expect(context.globalState.update).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
    });

    it('a rejected update is logged and the other keys are still removed', async () => {
        const context = createMockExtensionContext();
        await context.workspaceState.update('nuget.selectedProject', '/w/App/App.csproj');
        await context.workspaceState.update('nuget.recentSearches', ['json']);
        const update = context.workspaceState.update.getMockImplementation()!;
        context.workspaceState.update.mockImplementation(async (key: string, value: unknown) => {
            if (key === 'nuget.recentSearches') {
                throw new Error('storage is read-only');
            }
            return update(key, value);
        });
        const logger = fakeLogger();
        const { removed } = await sweepLegacyState(context as never, logger);
        expect(removed).toEqual(['nuget.selectedProject']);
        expect(context.workspaceState.get('nuget.selectedProject')).toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith('Legacy state nuget.recentSearches could not be removed: storage is read-only');
    });
});
