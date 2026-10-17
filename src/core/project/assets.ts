import * as fs from 'fs';
import * as path from 'path';
import type { TransitiveErrorKind, TransitiveFrameworkSection, TransitivePackage, TransitiveResult } from '../../protocol/domain';
import { readTextIfExists } from '../util/fs';

interface AssetsTargetEntry {
    type?: string;
    dependencies?: Record<string, string>;
}

/** The subset of `project.assets.json` this module reads. */
export interface AssetsJson {
    version?: number;
    targets?: Record<string, Record<string, AssetsTargetEntry>>;
    libraries?: Record<string, { type?: string }>;
    projectFileDependencyGroups?: Record<string, string[]>;
}

interface LockFile {
    version?: number;
    dependencies?: Record<string, Record<string, { type?: string; resolved?: string }>>;
}

interface CacheEntry {
    mtimeMs: number;
    data: unknown;
    timestamp: number;
}

const ASSETS_CACHE_TTL_MS = 30_000;
// Each parsed assets file can be several MB; a handful covers the active project plus the
// all-projects streaming window without pinning every project's graph in memory.
const MAX_ASSETS_CACHE_ENTRIES = 5;
const LIBRARY_KEY = /^(.+?)\/(.+)$/;
const MAX_DISPLAY_ROOTS = 5;

/** `obj/project.assets.json` for a project file. */
export function assetsPathFor(projectPath: string): string {
    return path.join(path.dirname(projectPath), 'obj', 'project.assets.json');
}

/** `packages.lock.json` beside a project file. */
export function lockFilePathFor(projectPath: string): string {
    return path.join(path.dirname(projectPath), 'packages.lock.json');
}

/**
 * Reads restore outputs (`project.assets.json`, `packages.lock.json`) with a small mtime-keyed
 * cache so the inspector, transitive view and dependency ordering share one parse per file.
 */
export class AssetsReader {
    private readonly cache = new Map<string, CacheEntry>();

    constructor(private readonly now: () => number = Date.now) {}

    /** Drop every cached document (after install/update/remove/restore). */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Parse `assetsPath`. Throws the underlying error (`ENOENT`, other fs errors, `SyntaxError`)
     * so callers can bucket failures; use the higher-level helpers when a soft failure is fine.
     */
    async read<T = AssetsJson>(assetsPath: string): Promise<T> {
        const stat = await fs.promises.stat(assetsPath);
        const now = this.now();
        const cached = this.cache.get(assetsPath);
        if (cached && cached.mtimeMs === stat.mtimeMs && now - cached.timestamp < ASSETS_CACHE_TTL_MS) {
            return cached.data as T;
        }

        const content = await fs.promises.readFile(assetsPath, 'utf-8');
        const data = JSON.parse(content) as T;
        this.cache.set(assetsPath, { mtimeMs: stat.mtimeMs, data, timestamp: now });
        this.evict(assetsPath, now);
        return data;
    }

    private evict(keep: string, now: number): void {
        for (const [key, entry] of this.cache) {
            if (key !== keep && now - entry.timestamp >= ASSETS_CACHE_TTL_MS) {
                this.cache.delete(key);
            }
        }
        while (this.cache.size > MAX_ASSETS_CACHE_ENTRIES) {
            let oldest: { key: string; timestamp: number } | undefined;
            for (const [key, entry] of this.cache) {
                if (key !== keep && (oldest === undefined || entry.timestamp < oldest.timestamp)) {
                    oldest = { key, timestamp: entry.timestamp };
                }
            }
            if (oldest === undefined) {
                break;
            }
            this.cache.delete(oldest.key);
        }
    }

    /**
     * Resolved versions (lower-cased id → version) for a project's direct references, from the
     * assets file first and the lock file for anything the assets file does not list.
     */
    async getResolvedVersions(projectPath: string): Promise<Map<string, string>> {
        const resolved = new Map<string, string>();

        try {
            const assets = await this.read(assetsPathFor(projectPath));
            for (const [key, library] of Object.entries(assets.libraries ?? {})) {
                if (library?.type !== 'package') {
                    continue;
                }
                const parsed = LIBRARY_KEY.exec(key);
                if (parsed && !resolved.has(parsed[1].toLowerCase())) {
                    resolved.set(parsed[1].toLowerCase(), parsed[2]);
                }
            }
        } catch {
            // No restore output yet; the lock file may still know.
        }

        const lockText = await readTextIfExists(lockFilePathFor(projectPath));
        if (lockText !== undefined) {
            try {
                const lock = JSON.parse(lockText) as LockFile;
                for (const packages of Object.values(lock.dependencies ?? {})) {
                    for (const [id, info] of Object.entries(packages)) {
                        if (info?.type === 'Direct' && info.resolved && !resolved.has(id.toLowerCase())) {
                            resolved.set(id.toLowerCase(), info.resolved);
                        }
                    }
                }
            } catch {
                // Malformed lock file: fall back to whatever the assets file provided.
            }
        }

        return resolved;
    }

    /**
     * Resolved versions per target framework (framework → lower-cased id → version) from the
     * `targets` of the assets file. A runtime-specific target (`net8.0/win-x64`) counts for its
     * framework. Empty when there is no readable restore output; the lock file is not consulted.
     */
    async getResolvedVersionsByFramework(projectPath: string): Promise<Map<string, Map<string, string>>> {
        const byFramework = new Map<string, Map<string, string>>();
        try {
            const assets = await this.read(assetsPathFor(projectPath));
            for (const [target, entries] of Object.entries(assets.targets ?? {})) {
                const framework = target.split('/')[0];
                const versions = byFramework.get(framework) ?? new Map<string, string>();
                for (const [key, entry] of Object.entries(entries)) {
                    const parsed = LIBRARY_KEY.exec(key);
                    if (!parsed || (entry?.type !== undefined && entry.type !== 'package')) {
                        continue;
                    }
                    if (!versions.has(parsed[1].toLowerCase())) {
                        versions.set(parsed[1].toLowerCase(), parsed[2]);
                    }
                }
                byFramework.set(framework, versions);
            }
        } catch {
            // No restore output yet.
        }
        return byFramework;
    }

    /** Lower-cased package id → lower-cased dependency ids, unioned across every target. */
    async getPackageDependencies(projectPath: string): Promise<Map<string, string[]>> {
        const dependencies = new Map<string, Set<string>>();
        try {
            const assets = await this.read(assetsPathFor(projectPath));
            for (const target of Object.values(assets.targets ?? {})) {
                for (const [key, entry] of Object.entries(target)) {
                    const parsed = LIBRARY_KEY.exec(key);
                    if (!parsed) {
                        continue;
                    }
                    const id = parsed[1].toLowerCase();
                    const deps = dependencies.get(id) ?? new Set<string>();
                    for (const depId of Object.keys(entry?.dependencies ?? {})) {
                        deps.add(depId.toLowerCase());
                    }
                    dependencies.set(id, deps);
                }
            }
        } catch {
            // Treated as "no dependency information" by callers.
        }
        return new Map(Array.from(dependencies, ([id, deps]) => [id, Array.from(deps)]));
    }

    /**
     * Transitive packages per target framework with their top-level roots. Failures are bucketed
     * (never raw error strings) so the UI can summarise without leaking paths or stack traces.
     */
    async getTransitivePackages(projectPath: string): Promise<TransitiveResult> {
        const assetsPath = assetsPathFor(projectPath);
        try {
            const assets = await this.read(assetsPath);
            return { projectPath, frameworks: computeTransitiveFrameworks(assets), dataSourceAvailable: true };
        } catch (error) {
            const code = (error as NodeJS.ErrnoException | undefined)?.code;
            if (code === 'ENOENT') {
                return { projectPath, frameworks: [], dataSourceAvailable: false };
            }
            return { projectPath, frameworks: [], dataSourceAvailable: true, errorKind: classifyAssetsError(error) };
        }
    }
}

function classifyAssetsError(error: unknown): TransitiveErrorKind {
    if (error instanceof SyntaxError) {
        return 'parse-failed';
    }
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return typeof code === 'string' ? 'fs-error' : 'unknown';
}

const TFM_VERSION = /net(\d+(?:\.\d+)?)/i;

function frameworkVersion(tfm: string): number {
    const match = TFM_VERSION.exec(tfm);
    return match ? Number.parseFloat(match[1]) : 0;
}

/** Pure graph computation over a parsed assets document (exported for tests and benchmarks). */
export function computeTransitiveFrameworks(assets: AssetsJson): TransitiveFrameworkSection[] {
    const targets = assets.targets;
    const dependencyGroups = assets.projectFileDependencyGroups;
    if (!targets || !dependencyGroups) {
        return [];
    }

    const sections: TransitiveFrameworkSection[] = [];
    const targetFrameworks = Object.keys(targets).sort((a, b) => frameworkVersion(b) - frameworkVersion(a));

    for (const targetFramework of targetFrameworks) {
        const entries = targets[targetFramework];

        // RID-specific targets ("net8.0/win-x64") share the base TFM's direct dependency group.
        const baseTfm = targetFramework.split('/')[0];
        const directIds = new Set<string>();
        for (const dependency of dependencyGroups[targetFramework] ?? dependencyGroups[baseTfm] ?? []) {
            const match = /^([^\s>=<]+)/.exec(dependency);
            if (match) {
                directIds.add(match[1].toLowerCase());
            }
        }

        const dependedOnBy = new Map<string, Set<string>>();
        const packageIds: Array<{ id: string; version: string }> = [];
        for (const [key, entry] of Object.entries(entries)) {
            const parsed = LIBRARY_KEY.exec(key);
            if (!parsed) {
                continue;
            }
            const [, id, version] = parsed;
            if (entry?.type !== undefined && entry.type !== 'package') {
                continue;
            }
            packageIds.push({ id, version });
            for (const depId of Object.keys(entry?.dependencies ?? {})) {
                const parents = dependedOnBy.get(depId.toLowerCase()) ?? new Set<string>();
                parents.add(id);
                dependedOnBy.set(depId.toLowerCase(), parents);
            }
        }

        const packages: TransitivePackage[] = [];
        for (const { id, version } of packageIds) {
            if (directIds.has(id.toLowerCase())) {
                continue;
            }
            const roots = resolveRoots(id, dependedOnBy, directIds);
            packages.push({
                id,
                version,
                requiredByChain: roots.slice(0, MAX_DISPLAY_ROOTS),
                fullChain: roots.length > MAX_DISPLAY_ROOTS ? roots : undefined,
            });
        }

        packages.sort((a, b) => a.id.localeCompare(b.id));
        sections.push({ targetFramework, packages });
    }

    return sections;
}

/**
 * Distinct top-level packages that (transitively) pull in `packageId`, via reverse BFS with a
 * per-package `visited` set. A shared visited set or an id-keyed chain cache poisons results on
 * cyclic graphs and yields false "required by: unknown" entries — do not reintroduce either.
 */
function resolveRoots(packageId: string, dependedOnBy: Map<string, Set<string>>, directIds: Set<string>): string[] {
    const roots = new Set<string>();
    const start = packageId.toLowerCase();
    const visited = new Set<string>([start]);
    const queue: string[] = [start];

    while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) {
            break;
        }
        for (const parent of dependedOnBy.get(current) ?? []) {
            const parentLower = parent.toLowerCase();
            if (directIds.has(parentLower)) {
                roots.add(parent);
            } else if (!visited.has(parentLower)) {
                visited.add(parentLower);
                queue.push(parentLower);
            }
        }
    }

    return Array.from(roots).sort((a, b) => a.localeCompare(b));
}
