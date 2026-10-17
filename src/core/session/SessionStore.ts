import { ALL_PROJECTS } from '../../protocol/domain';
import type { Project, SessionIntent, SessionSnapshot, Surface } from '../../protocol/domain';
import type { KeyValueStore, Logger, SessionStore } from '../contracts';
import { Emitter } from '../util/events';

/** `KeyValueStore` keys under which the committed session values are persisted. */
export const SESSION_STORAGE_KEYS = {
    selectedProject: 'nuiget.selectedProject',
    selectedSource: 'nuiget.selectedSource',
    includePrerelease: 'nuiget.includePrerelease',
    restoreEnabled: 'nuiget.restoreEnabled',
} as const;

type SessionValues = Pick<SessionSnapshot, 'selectedProject' | 'selectedSource' | 'includePrerelease' | 'restoreEnabled'>;
type SessionValueKey = keyof SessionValues;

const SESSION_VALUE_KEYS: readonly SessionValueKey[] = ['selectedProject', 'selectedSource', 'includePrerelease', 'restoreEnabled'];

/** Values used when nothing has been persisted yet. */
export const SESSION_DEFAULTS: Readonly<SessionValues> = Object.freeze({
    selectedProject: '',
    selectedSource: 'all',
    includePrerelease: false,
    restoreEnabled: true,
});

/** True when the snapshot selects every project in the workspace. */
export function isAllProjects(snapshot: Pick<SessionSnapshot, 'selectedProject'>): boolean {
    return snapshot.selectedProject === ALL_PROJECTS;
}

function compareProjects(a: Project, b: Project): number {
    const byName = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    return byName !== 0 ? byName : a.path.localeCompare(b.path);
}

/** Deterministic fallback project: first by case-insensitive name, then by path. */
export function firstProject(projects: readonly Project[]): Project | undefined {
    return [...projects].sort(compareProjects)[0];
}

function readString(store: KeyValueStore, key: string, fallback: string): string {
    const value = store.get<unknown>(key);
    return typeof value === 'string' ? value : fallback;
}

function readBoolean(store: KeyValueStore, key: string, fallback: boolean): boolean {
    const value = store.get<unknown>(key);
    return typeof value === 'boolean' ? value : fallback;
}

/**
 * The only writer of shared session state (selected project/source, prerelease and restore
 * toggles). Intents are normalized against the last reconciled project/source lists, committed
 * in memory synchronously (bumping `rev` and broadcasting), and then persisted in revision order.
 */
export class DefaultSessionStore implements SessionStore {
    private readonly changeEmitter = new Emitter<SessionSnapshot>();
    readonly onDidChange = this.changeEmitter.event;

    private current: SessionSnapshot;
    /** Undefined until the first `reconcile()`; intents are accepted as-is before that. */
    private knownProjects: readonly Project[] | undefined;
    private knownSourceUrls: ReadonlySet<string> | undefined;
    /** Persistence runs on this chain so writes land in the same order as revisions. */
    private persistence: Promise<void> = Promise.resolve();

    constructor(
        private readonly store: KeyValueStore,
        private readonly logger?: Logger,
    ) {
        this.current = Object.freeze({
            rev: 1,
            selectedProject: readString(store, SESSION_STORAGE_KEYS.selectedProject, SESSION_DEFAULTS.selectedProject),
            selectedSource: readString(store, SESSION_STORAGE_KEYS.selectedSource, SESSION_DEFAULTS.selectedSource),
            includePrerelease: readBoolean(store, SESSION_STORAGE_KEYS.includePrerelease, SESSION_DEFAULTS.includePrerelease),
            restoreEnabled: readBoolean(store, SESSION_STORAGE_KEYS.restoreEnabled, SESSION_DEFAULTS.restoreEnabled),
            origin: 'host',
        });
    }

    get snapshot(): SessionSnapshot {
        return this.current;
    }

    apply(intent: SessionIntent, origin: Surface | 'host'): Promise<SessionSnapshot> {
        const desired: SessionValues = {
            selectedProject: intent.selectedProject ?? this.current.selectedProject,
            selectedSource: intent.selectedSource ?? this.current.selectedSource,
            includePrerelease: intent.includePrerelease ?? this.current.includePrerelease,
            restoreEnabled: intent.restoreEnabled ?? this.current.restoreEnabled,
        };
        return this.commit(this.normalize(desired), origin);
    }

    /**
     * Replace the known project and enabled-source lists, then re-normalize the current snapshot and
     * commit it as a host-originated change. Who calls it, and when, is stated on `SessionStore.reconcile`.
     */
    reconcile(projects: Project[], enabledSourceUrls: string[]): Promise<SessionSnapshot> {
        this.knownProjects = [...projects];
        this.knownSourceUrls = new Set(enabledSourceUrls);
        return this.commit(this.normalize(this.current), 'host');
    }

    dispose(): void {
        this.changeEmitter.dispose();
    }

    private normalize(desired: SessionValues): SessionValues {
        return {
            selectedProject: this.normalizeProject(desired.selectedProject),
            selectedSource: this.normalizeSource(desired.selectedSource),
            includePrerelease: desired.includePrerelease,
            restoreEnabled: desired.restoreEnabled,
        };
    }

    private normalizeProject(selectedProject: string): string {
        const projects = this.knownProjects;
        if (projects === undefined) {
            return selectedProject;
        }
        if (selectedProject === ALL_PROJECTS) {
            return projects.length > 1 ? ALL_PROJECTS : (firstProject(projects)?.path ?? '');
        }
        if (selectedProject !== '' && projects.some(project => project.path === selectedProject)) {
            return selectedProject;
        }
        return firstProject(projects)?.path ?? '';
    }

    private normalizeSource(selectedSource: string): string {
        if (selectedSource === '') {
            return 'all';
        }
        const sources = this.knownSourceUrls;
        if (sources === undefined || selectedSource === 'all' || sources.has(selectedSource)) {
            return selectedSource;
        }
        return 'all';
    }

    private commit(values: SessionValues, origin: Surface | 'host'): Promise<SessionSnapshot> {
        const changedKeys = SESSION_VALUE_KEYS.filter(key => values[key] !== this.current[key]);
        if (changedKeys.length === 0) {
            return Promise.resolve(this.current);
        }

        const snapshot: SessionSnapshot = Object.freeze({ ...values, rev: this.current.rev + 1, origin });
        this.current = snapshot;
        this.changeEmitter.fire(snapshot);

        this.persistence = this.persistence.then(() => this.persist(snapshot, changedKeys));
        return this.persistence.then(() => snapshot);
    }

    private async persist(snapshot: SessionSnapshot, keys: readonly SessionValueKey[]): Promise<void> {
        for (const key of keys) {
            try {
                await this.store.update(SESSION_STORAGE_KEYS[key], snapshot[key]);
            } catch (error) {
                // The in-memory commit already happened and was broadcast; a failed write only
                // means the next activation starts from an older value.
                this.logger?.error(`[SessionStore] Failed to persist ${SESSION_STORAGE_KEYS[key]} (rev ${snapshot.rev})`, error);
            }
        }
    }
}
