import { describe, expect, it, vi } from 'vitest';
import { ALL_PROJECTS } from '../../protocol/domain';
import type { Project, SessionSnapshot } from '../../protocol/domain';
import type { KeyValueStore, Logger } from '../contracts';
import { DefaultSessionStore, SESSION_STORAGE_KEYS, firstProject, isAllProjects } from './SessionStore';

interface Deferred<T = void> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
}

function deferred<T = void>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

interface FakeStore extends KeyValueStore {
    readonly data: Map<string, unknown>;
    readonly updates: Array<{ key: string; value: unknown }>;
    update: ReturnType<typeof vi.fn<(key: string, value: unknown) => Promise<void>>>;
}

function createStore(initial: Record<string, unknown> = {}): FakeStore {
    const data = new Map<string, unknown>(Object.entries(initial));
    const updates: Array<{ key: string; value: unknown }> = [];
    const update = vi.fn(async (key: string, value: unknown) => {
        updates.push({ key, value });
        data.set(key, value);
    });
    return {
        data,
        updates,
        update,
        get<T>(key: string, defaultValue?: T): T | undefined {
            return data.has(key) ? (data.get(key) as T) : defaultValue;
        },
    };
}

function createLogger(): Logger {
    return {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
}

const projectA: Project = { name: 'Alpha', path: '/ws/alpha/Alpha.csproj' };
const projectB: Project = { name: 'beta', path: '/ws/beta/beta.csproj' };
const projectC: Project = { name: 'Gamma', path: '/ws/gamma/Gamma.csproj' };
const SOURCE_URL = 'https://api.nuget.org/v3/index.json';

function recordChanges(store: DefaultSessionStore): SessionSnapshot[] {
    const changes: SessionSnapshot[] = [];
    store.onDidChange(snapshot => changes.push(snapshot));
    return changes;
}

describe('firstProject', () => {
    it('orders by case-insensitive name and then by path', () => {
        const sameNameLaterPath: Project = { name: 'alpha', path: '/ws/zeta/alpha.csproj' };
        expect(firstProject([projectC, projectB, projectA])).toBe(projectA);
        expect(firstProject([sameNameLaterPath, projectA])).toBe(projectA);
        expect(firstProject([])).toBeUndefined();
    });
});

describe('isAllProjects', () => {
    it('detects the sentinel and nothing else', () => {
        expect(isAllProjects({ selectedProject: ALL_PROJECTS })).toBe(true);
        expect(isAllProjects({ selectedProject: projectA.path })).toBe(false);
        expect(isAllProjects({ selectedProject: '' })).toBe(false);
    });
});

describe('DefaultSessionStore', () => {
    describe('initial snapshot', () => {
        it('uses defaults when nothing is persisted', () => {
            const store = new DefaultSessionStore(createStore());
            expect(store.snapshot).toEqual({
                rev: 1,
                selectedProject: '',
                selectedSource: 'all',
                includePrerelease: false,
                restoreEnabled: true,
                origin: 'host',
            });
        });

        it('loads persisted values and ignores values of the wrong type', () => {
            const store = new DefaultSessionStore(createStore({
                [SESSION_STORAGE_KEYS.selectedProject]: projectB.path,
                [SESSION_STORAGE_KEYS.selectedSource]: SOURCE_URL,
                [SESSION_STORAGE_KEYS.includePrerelease]: true,
                [SESSION_STORAGE_KEYS.restoreEnabled]: 'yes',
            }));
            expect(store.snapshot).toMatchObject({
                rev: 1,
                selectedProject: projectB.path,
                selectedSource: SOURCE_URL,
                includePrerelease: true,
                restoreEnabled: true,
            });
        });

        it('exposes frozen snapshots so consumers cannot mutate committed state', () => {
            const store = new DefaultSessionStore(createStore());
            expect(Object.isFrozen(store.snapshot)).toBe(true);
        });
    });

    describe('apply', () => {
        it('commits synchronously, bumps rev, records origin and persists only changed keys', async () => {
            const kv = createStore();
            const store = new DefaultSessionStore(kv);
            const changes = recordChanges(store);

            const pending = store.apply({ includePrerelease: true, selectedProject: projectA.path }, 'main');

            expect(store.snapshot).toMatchObject({ rev: 2, includePrerelease: true, selectedProject: projectA.path, origin: 'main' });
            expect(changes).toHaveLength(1);
            expect(changes[0]).toBe(store.snapshot);

            const committed = await pending;
            expect(committed).toBe(store.snapshot);
            expect(kv.updates).toEqual([
                { key: SESSION_STORAGE_KEYS.selectedProject, value: projectA.path },
                { key: SESSION_STORAGE_KEYS.includePrerelease, value: true },
            ]);
        });

        it('accepts values as-is before the first reconcile', async () => {
            const store = new DefaultSessionStore(createStore());
            const snapshot = await store.apply({ selectedProject: '/unknown.csproj', selectedSource: 'https://example.invalid/v3/index.json' }, 'sidebar');
            expect(snapshot.selectedProject).toBe('/unknown.csproj');
            expect(snapshot.selectedSource).toBe('https://example.invalid/v3/index.json');
        });

        it('returns the current snapshot without a rev bump or event when nothing changes', async () => {
            const kv = createStore();
            const store = new DefaultSessionStore(kv);
            const changes = recordChanges(store);
            const before = store.snapshot;

            const result = await store.apply({ includePrerelease: false, selectedSource: 'all' }, 'sidebar');

            expect(result).toBe(before);
            expect(store.snapshot.rev).toBe(1);
            expect(store.snapshot.origin).toBe('host');
            expect(changes).toHaveLength(0);
            expect(kv.update).not.toHaveBeenCalled();
        });

        it('ignores undefined intent fields', async () => {
            const store = new DefaultSessionStore(createStore());
            await store.apply({ includePrerelease: true }, 'main');
            const snapshot = await store.apply({ includePrerelease: undefined, restoreEnabled: false }, 'main');
            expect(snapshot).toMatchObject({ includePrerelease: true, restoreEnabled: false, rev: 3 });
        });

        it('keeps rev strictly monotonic across many intents', async () => {
            const store = new DefaultSessionStore(createStore());
            const revs: number[] = [];
            store.onDidChange(snapshot => revs.push(snapshot.rev));

            for (let i = 0; i < 10; i++) {
                await store.apply({ includePrerelease: i % 2 === 0 }, 'main');
            }

            expect(revs).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
        });

        it('normalizes an empty source to "all"', async () => {
            const store = new DefaultSessionStore(createStore({ [SESSION_STORAGE_KEYS.selectedSource]: SOURCE_URL }));
            const snapshot = await store.apply({ selectedSource: '' }, 'main');
            expect(snapshot.selectedSource).toBe('all');
        });
    });

    describe('normalization after reconcile', () => {
        async function reconciledStore(projects: Project[] = [projectB, projectA, projectC], sources: string[] = [SOURCE_URL]) {
            const kv = createStore({ [SESSION_STORAGE_KEYS.selectedProject]: projectA.path });
            const store = new DefaultSessionStore(kv);
            await store.reconcile(projects, sources);
            return { store, kv };
        }

        it('falls back to the first project (by name, then path) for an unknown project', async () => {
            const { store } = await reconciledStore();
            const snapshot = await store.apply({ selectedProject: '/gone/Gone.csproj' }, 'main');
            expect(snapshot.selectedProject).toBe(projectA.path);
        });

        it('falls back to the first project for an empty selection when projects exist', async () => {
            const { store } = await reconciledStore();
            await store.apply({ selectedProject: projectC.path }, 'main');
            const snapshot = await store.apply({ selectedProject: '' }, 'main');
            expect(snapshot.selectedProject).toBe(projectA.path);
        });

        it('keeps a known project selection', async () => {
            const { store } = await reconciledStore();
            const snapshot = await store.apply({ selectedProject: projectC.path }, 'sidebar');
            expect(snapshot.selectedProject).toBe(projectC.path);
            expect(snapshot.origin).toBe('sidebar');
        });

        it('keeps ALL_PROJECTS when more than one project exists', async () => {
            const { store } = await reconciledStore();
            const snapshot = await store.apply({ selectedProject: ALL_PROJECTS }, 'main');
            expect(isAllProjects(snapshot)).toBe(true);
        });

        it('downgrades ALL_PROJECTS to the only project', async () => {
            const { store } = await reconciledStore([projectB]);
            const snapshot = await store.apply({ selectedProject: ALL_PROJECTS }, 'main');
            expect(snapshot.selectedProject).toBe(projectB.path);
        });

        it('downgrades ALL_PROJECTS to an empty selection when there are no projects', async () => {
            const { store } = await reconciledStore([]);
            const snapshot = await store.apply({ selectedProject: ALL_PROJECTS }, 'main');
            expect(snapshot.selectedProject).toBe('');
        });

        it('replaces an unknown source with "all" and keeps known ones', async () => {
            const { store } = await reconciledStore();
            const unknown = await store.apply({ selectedSource: 'https://example.invalid/v3/index.json' }, 'main');
            expect(unknown.selectedSource).toBe('all');

            const known = await store.apply({ selectedSource: SOURCE_URL }, 'main');
            expect(known.selectedSource).toBe(SOURCE_URL);
        });

        it('normalizes related fields atomically in one revision', async () => {
            const { store } = await reconciledStore();
            const changes = recordChanges(store);

            const snapshot = await store.apply({ selectedProject: '/gone/Gone.csproj', selectedSource: 'https://example.invalid/v3/index.json', includePrerelease: true }, 'main');

            expect(snapshot).toMatchObject({ selectedProject: projectA.path, selectedSource: 'all', includePrerelease: true });
            expect(changes).toHaveLength(1);
            expect(changes[0].rev).toBe(2);
        });
    });

    describe('reconcile', () => {
        it('fires once with origin "host" when the selection becomes invalid and persists the fallback', async () => {
            const kv = createStore({
                [SESSION_STORAGE_KEYS.selectedProject]: '/gone/Gone.csproj',
                [SESSION_STORAGE_KEYS.selectedSource]: 'https://example.invalid/v3/index.json',
            });
            const store = new DefaultSessionStore(kv);
            const changes = recordChanges(store);

            const snapshot = await store.reconcile([projectC, projectA], [SOURCE_URL]);

            expect(snapshot).toMatchObject({ rev: 2, selectedProject: projectA.path, selectedSource: 'all', origin: 'host' });
            expect(changes).toEqual([snapshot]);
            expect(kv.data.get(SESSION_STORAGE_KEYS.selectedProject)).toBe(projectA.path);
            expect(kv.data.get(SESSION_STORAGE_KEYS.selectedSource)).toBe('all');
        });

        it('persists an auto-selected project so both surfaces restore the same selection', async () => {
            const kv = createStore();
            const store = new DefaultSessionStore(kv);

            await store.reconcile([projectB], []);

            expect(store.snapshot.selectedProject).toBe(projectB.path);
            expect(kv.updates).toEqual([{ key: SESSION_STORAGE_KEYS.selectedProject, value: projectB.path }]);
        });

        it('does not fire or persist when the snapshot is already valid', async () => {
            const kv = createStore({ [SESSION_STORAGE_KEYS.selectedProject]: projectA.path, [SESSION_STORAGE_KEYS.selectedSource]: SOURCE_URL });
            const store = new DefaultSessionStore(kv);
            const changes = recordChanges(store);
            const before = store.snapshot;

            const snapshot = await store.reconcile([projectA, projectB], [SOURCE_URL]);

            expect(snapshot).toBe(before);
            expect(changes).toHaveLength(0);
            expect(kv.update).not.toHaveBeenCalled();
        });

        it('downgrades ALL_PROJECTS when the workspace shrinks to one project', async () => {
            const store = new DefaultSessionStore(createStore({ [SESSION_STORAGE_KEYS.selectedProject]: ALL_PROJECTS }));
            await store.reconcile([projectA, projectB], []);
            expect(isAllProjects(store.snapshot)).toBe(true);

            await store.reconcile([projectB], []);
            expect(store.snapshot.selectedProject).toBe(projectB.path);
        });

        it('clears the selection when the workspace has no projects', async () => {
            const store = new DefaultSessionStore(createStore({ [SESSION_STORAGE_KEYS.selectedProject]: projectA.path }));
            const snapshot = await store.reconcile([], []);
            expect(snapshot.selectedProject).toBe('');
        });

        it('re-validates the source when the enabled source list changes', async () => {
            const store = new DefaultSessionStore(createStore({ [SESSION_STORAGE_KEYS.selectedSource]: SOURCE_URL }));
            await store.reconcile([projectA], [SOURCE_URL]);
            expect(store.snapshot.selectedSource).toBe(SOURCE_URL);

            await store.reconcile([projectA], []);
            expect(store.snapshot.selectedSource).toBe('all');
        });
    });

    describe('persistence', () => {
        it('keeps the in-memory state and logs when persistence fails', async () => {
            const kv = createStore();
            kv.update.mockRejectedValueOnce(new Error('disk full'));
            const logger = createLogger();
            const store = new DefaultSessionStore(kv, logger);
            const changes = recordChanges(store);

            const snapshot = await store.apply({ includePrerelease: true }, 'main');

            expect(snapshot.includePrerelease).toBe(true);
            expect(store.snapshot).toBe(snapshot);
            expect(changes).toEqual([snapshot]);
            expect(logger.error).toHaveBeenCalledTimes(1);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(SESSION_STORAGE_KEYS.includePrerelease), expect.any(Error));
        });

        it('continues persisting later revisions after a failed write', async () => {
            const kv = createStore();
            kv.update.mockRejectedValueOnce(new Error('transient'));
            const store = new DefaultSessionStore(kv, createLogger());

            await store.apply({ includePrerelease: true }, 'main');
            await store.apply({ restoreEnabled: false }, 'main');

            expect(kv.data.get(SESSION_STORAGE_KEYS.includePrerelease)).toBeUndefined();
            expect(kv.data.get(SESSION_STORAGE_KEYS.restoreEnabled)).toBe(false);
        });

        it('swallows persistence failures silently when no logger is provided', async () => {
            const kv = createStore();
            kv.update.mockRejectedValueOnce(new Error('disk full'));
            const store = new DefaultSessionStore(kv);
            await expect(store.apply({ includePrerelease: true }, 'main')).resolves.toMatchObject({ includePrerelease: true });
        });

        it('serializes concurrent applies so writes land in revision order', async () => {
            const kv = createStore();
            const first = deferred();
            const second = deferred();
            const started: string[] = [];
            kv.update.mockImplementation(async (key: string, value: unknown) => {
                started.push(key);
                await (started.length === 1 ? first.promise : second.promise);
                kv.data.set(key, value);
            });
            const store = new DefaultSessionStore(kv);

            const applyA = store.apply({ includePrerelease: true }, 'main');
            const applyB = store.apply({ restoreEnabled: false }, 'sidebar');

            expect(store.snapshot).toMatchObject({ rev: 3, includePrerelease: true, restoreEnabled: false, origin: 'sidebar' });
            await Promise.resolve();
            expect(started).toEqual([SESSION_STORAGE_KEYS.includePrerelease]);

            second.resolve();
            await Promise.resolve();
            expect(started).toEqual([SESSION_STORAGE_KEYS.includePrerelease]);

            first.resolve();
            const [snapshotA, snapshotB] = await Promise.all([applyA, applyB]);

            expect(started).toEqual([SESSION_STORAGE_KEYS.includePrerelease, SESSION_STORAGE_KEYS.restoreEnabled]);
            expect(snapshotA).toMatchObject({ rev: 2, includePrerelease: true, restoreEnabled: true });
            expect(snapshotB).toMatchObject({ rev: 3, includePrerelease: true, restoreEnabled: false });
        });
    });

    it('stops notifying listeners after dispose', async () => {
        const store = new DefaultSessionStore(createStore());
        const changes = recordChanges(store);
        store.dispose();

        await store.apply({ includePrerelease: true }, 'main');

        expect(changes).toHaveLength(0);
        expect(store.snapshot.includePrerelease).toBe(true);
    });
});
