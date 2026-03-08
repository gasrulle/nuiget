/**
 * Standalone utility functions and classes for NuGet service operations.
 * These have no dependencies on NuGetService class state (no `this.` access).
 * Extracted from NuGetService.ts for modularity.
 */

import { exec } from 'child_process';
import * as fs from 'fs';

import type { VersionSpec } from './NuGetTypes';

/**
 * Async file existence check (non-blocking alternative to fs.existsSync).
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * LRU (Least Recently Used) Map with maximum size limit.
 * Automatically evicts oldest entries when capacity is reached.
 * Used for in-memory caches to prevent unbounded memory growth.
 */
export class LRUMap<K, V> {
    private cache: Map<K, V> = new Map();
    private readonly maxSize: number;

    constructor(maxSize: number) {
        this.maxSize = maxSize;
    }

    get(key: K): V | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            // Move to end (most recently used)
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }

    set(key: K, value: V): void {
        // If key exists, delete it first to update position
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Evict oldest entry (first in iteration order)
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            }
        }
        this.cache.set(key, value);
    }

    has(key: K): boolean {
        return this.cache.has(key);
    }

    delete(key: K): boolean {
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}

/**
 * Execute promises in batches to limit concurrency.
 * Prevents overwhelming the network with too many simultaneous requests.
 * @param items Array of items to process
 * @param processor Async function to process each item
 * @param concurrency Maximum concurrent operations (default: 6)
 */
export async function batchedPromiseAll<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number = 6
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const runNext = async (): Promise<void> => {
        while (nextIndex < items.length) {
            const i = nextIndex++;
            results[i] = await processor(items[i]);
        }
    };

    // Launch `concurrency` workers; each grabs the next item as soon as it finishes
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
    await Promise.all(workers);
    return results;
}

// Command timeout (60 seconds)
export const COMMAND_TIMEOUT = 60000;

/**
 * Custom error type that includes stdout/stderr from failed commands
 */
export interface ExecError extends Error {
    stdout?: string;
    stderr?: string;
    code?: number;
}

/**
 * Execute command with timeout.
 * Supports both legacy signature (command, timeout, cwd) and options object.
 */
export async function execWithTimeout(
    command: string,
    timeoutOrOptions?: number | { timeout?: number; cwd?: string },
    legacyCwd?: string
): Promise<{ stdout: string; stderr: string }> {
    // Handle both old signature (command, timeout) and options object
    let timeout = COMMAND_TIMEOUT;
    let cwd: string | undefined;

    if (typeof timeoutOrOptions === 'number') {
        timeout = timeoutOrOptions;
        cwd = legacyCwd;
    } else if (timeoutOrOptions) {
        timeout = timeoutOrOptions.timeout ?? COMMAND_TIMEOUT;
        cwd = timeoutOrOptions.cwd;
    }

    return new Promise((resolve, reject) => {
        exec(command, { timeout, cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                // Include stdout/stderr in the error for better diagnostics
                const execError = error as ExecError;
                execError.stdout = stdout;
                execError.stderr = stderr;
                reject(execError);
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

/**
 * Validate package ID to prevent command injection.
 * NuGet package IDs: alphanumeric, dots, underscores, hyphens.
 */
export function isValidPackageId(packageId: string): boolean {
    return /^[a-zA-Z0-9._-]+$/.test(packageId);
}

/**
 * Validate version string.
 * SemVer-like: digits, dots, hyphens, plus, alphanumeric.
 */
export function isValidVersion(version: string): boolean {
    return /^[a-zA-Z0-9._+-]+$/.test(version);
}

/**
 * Validate source name to prevent command injection in dotnet nuget commands.
 * Source names: alphanumeric, dots, underscores, hyphens, spaces.
 * Rejects shell metacharacters.
 */
export function isValidSourceName(name: string): boolean {
    return /^[a-zA-Z0-9._\- ]+$/.test(name) && name.length > 0 && name.length <= 256;
}

/**
 * Validate URL for safe shell command use.
 * Allows file:// for local folders, http(s):// for network sources.
 * Rejects shell-dangerous characters.
 */
export function isValidSourceUrl(url: string): boolean {
    const dangerousChars = /["'`\\|><;{}\r\n\t&$!#()]/;
    if (dangerousChars.test(url)) {
        return false;
    }
    // Validate URL structure
    try {
        const parsed = new URL(url);
        return ['http:', 'https:', 'file:'].includes(parsed.protocol);
    } catch {
        // If not a URL, it might be a local path
        // Allow Windows and Unix paths (alphanumeric, :, \, /, ., -, _, space)
        return /^[a-zA-Z0-9.:/_\- \\]+$/.test(url);
    }
}

/**
 * Parse a version specification to determine its type and extract metadata.
 * Supports: floating (*, 10.*, 1.0.*, 1.*-*), range ([1.0,2.0), (,2.0]), exact ([1.0.0]), standard (1.0.0).
 */
export function parseVersionSpec(version: string): VersionSpec {
    const trimmed = version.trim();

    // Pure wildcard - always gets latest
    if (trimmed === '*' || trimmed === '*-*') {
        return {
            type: 'floating',
            original: version,
            isAlwaysLatest: true,
            floatingDepth: 0
        };
    }

    // Floating versions with wildcards: 10.*, 1.0.*, 1.*-*, 1.0.0-*
    // Patterns: N.*, N.N.*, N.N.N-*, N.*-*
    const floatingMatch = trimmed.match(/^(\d+(?:\.\d+)*)\.?\*(-\*)?$/);
    if (floatingMatch) {
        const prefix = floatingMatch[1];
        const parts = prefix.split('.');
        return {
            type: 'floating',
            original: version,
            floatingPrefix: prefix,
            floatingDepth: parts.length,
            isAlwaysLatest: false
        };
    }

    // Prerelease floating: 1.0.0-* or 1.0.0-beta.*
    const prereleaseFloatingMatch = trimmed.match(/^(\d+\.\d+\.\d+)-(.*)?\*$/);
    if (prereleaseFloatingMatch) {
        return {
            type: 'floating',
            original: version,
            floatingPrefix: prereleaseFloatingMatch[1],
            floatingDepth: 3,
            isAlwaysLatest: false
        };
    }

    // Exact version: [1.0.0]
    if (/^\[\d+(\.\d+)*(-[\w.]+)?\]$/.test(trimmed)) {
        return {
            type: 'exact',
            original: version
        };
    }

    // Range with brackets: [1.0,2.0], (1.0,2.0], [1.0,2.0), (1.0,2.0)
    // Also: [1.0,), (,2.0], (1.0,), (,2.0)
    if (/^[[(].*,.*[)\]]$/.test(trimmed)) {
        return {
            type: 'range',
            original: version
        };
    }

    // Standard version (could be implicit minimum version)
    return {
        type: 'standard',
        original: version
    };
}

/**
 * Compare two SemVer 2.0 version strings.
 * Returns true if version1 is newer than version2.
 * Handles prerelease segments per SemVer 2.0 spec:
 * - Numeric segments compared as integers
 * - String segments compared lexicographically
 * - A stable release is newer than its prerelease counterpart
 */
export function isNewerVersion(version1: string, version2: string): boolean {
    // Normalize versions for comparison
    const v1 = version1.toLowerCase();
    const v2 = version2.toLowerCase();

    if (v1 === v2) { return false; }

    // Parse version parts (strip build metadata per SemVer 2.0 — +build suffix is ignored in comparisons)
    const parseVersion = (v: string) => {
        const withoutBuild = v.split('+')[0];
        const [main, ...prereleaseParts] = withoutBuild.split('-');
        const prerelease = prereleaseParts.length > 0 ? prereleaseParts.join('-') : null;
        const parts = main.split('.').map(p => parseInt(p, 10) || 0);
        return { parts, prerelease };
    };

    const parsed1 = parseVersion(v1);
    const parsed2 = parseVersion(v2);

    // Compare main version parts
    const maxLen = Math.max(parsed1.parts.length, parsed2.parts.length);
    for (let i = 0; i < maxLen; i++) {
        const p1 = parsed1.parts[i] || 0;
        const p2 = parsed2.parts[i] || 0;
        if (p1 > p2) { return true; }
        if (p1 < p2) { return false; }
    }

    // Main versions are equal, check prerelease
    // A stable version is considered newer than a prerelease of the same version
    if (!parsed1.prerelease && parsed2.prerelease) { return true; }
    if (parsed1.prerelease && !parsed2.prerelease) { return false; }

    // Both are prerelease: compare dot-separated segments per SemVer 2.0 spec
    // Numeric segments are compared as integers; string segments compared lexicographically
    if (parsed1.prerelease && parsed2.prerelease) {
        const segments1 = parsed1.prerelease.split('.');
        const segments2 = parsed2.prerelease.split('.');
        const maxSegLen = Math.max(segments1.length, segments2.length);
        for (let i = 0; i < maxSegLen; i++) {
            // Fewer segments = lower precedence (e.g., "alpha" < "alpha.1")
            if (i >= segments1.length) { return false; }
            if (i >= segments2.length) { return true; }
            const s1 = segments1[i];
            const s2 = segments2[i];
            const n1 = /^\d+$/.test(s1) ? parseInt(s1, 10) : NaN;
            const n2 = /^\d+$/.test(s2) ? parseInt(s2, 10) : NaN;
            const isNum1 = !isNaN(n1);
            const isNum2 = !isNaN(n2);
            if (isNum1 && isNum2) {
                if (n1 > n2) { return true; }
                if (n1 < n2) { return false; }
            } else if (isNum1 !== isNum2) {
                // Numeric segments always have lower precedence than string segments
                return !isNum1;
            } else {
                // Both strings: lexicographic comparison
                if (s1 > s2) { return true; }
                if (s1 < s2) { return false; }
            }
        }
        return false;
    }

    return false;
}

/**
 * Compare two version strings numerically, returning -1, 0, or 1.
 * Handles prerelease suffixes per SemVer 2.0 rules.
 */
function compareVersionNumbers(a: string, b: string): number {
    if (isNewerVersion(a, b)) { return 1; }
    if (isNewerVersion(b, a)) { return -1; }
    return 0;
}

/**
 * Check if a package version falls within a NuGet version range.
 * Supports NuGet interval notation:
 *   (,2.0.0)    — all versions below 2.0.0
 *   [1.0.0,)    — 1.0.0 and above
 *   [1.0.0,2.0) — 1.0.0 inclusive to 2.0.0 exclusive
 *   (1.0.0,2.0] — 1.0.0 exclusive to 2.0.0 inclusive
 */
export function isVersionInRange(version: string, rangeStr: string): boolean {
    const trimmed = rangeStr.trim();
    if (!trimmed) { return false; }

    const firstChar = trimmed[0];
    const lastChar = trimmed[trimmed.length - 1];

    // Check if it's interval notation
    if ((firstChar === '[' || firstChar === '(') && (lastChar === ']' || lastChar === ')')) {
        const inner = trimmed.slice(1, -1);
        const commaIdx = inner.indexOf(',');
        if (commaIdx === -1) {
            // Exact version: [1.0.0]
            return firstChar === '[' && lastChar === ']' && compareVersionNumbers(version, inner.trim()) === 0;
        }

        const minStr = inner.slice(0, commaIdx).trim();
        const maxStr = inner.slice(commaIdx + 1).trim();
        const minInclusive = firstChar === '[';
        const maxInclusive = lastChar === ']';

        // Check minimum bound
        if (minStr) {
            const cmp = compareVersionNumbers(version, minStr);
            if (minInclusive ? cmp < 0 : cmp <= 0) { return false; }
        }

        // Check maximum bound
        if (maxStr) {
            const cmp = compareVersionNumbers(version, maxStr);
            if (maxInclusive ? cmp > 0 : cmp >= 0) { return false; }
        }

        return true;
    }

    // Plain version string — treat as minimum inclusive (NuGet default)
    return compareVersionNumbers(version, trimmed) >= 0;
}

/**
 * Topological sort using Kahn's algorithm for packages with inter-dependencies.
 *
 * @param items The items to sort
 * @param getKey Extract a lowercase key from each item (used for graph edges)
 * @param dependencyMap Maps packageId (lowercase) -> array of dependency packageIds (lowercase)
 * @param selectedKeys Set of lowercase keys that are in the items list
 * @param dependenciesFirst If true, dependencies are placed first (for updates);
 *                          if false, dependents are placed first (for removals)
 * @returns Sorted copy of items
 */
export function topologicalSortByDependency<T>(
    items: T[],
    getKey: (item: T) => string,
    dependencyMap: Map<string, string[]>,
    selectedKeys: Set<string>,
    dependenciesFirst: boolean
): T[] {
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>(); // edges from source -> targets (reduce in-degree when source is processed)

    // Initialize
    for (const item of items) {
        const key = getKey(item);
        inDegree.set(key, 0);
        graph.set(key, []);
    }

    // Build dependency graph for selected items only
    for (const item of items) {
        const key = getKey(item);
        const deps = dependencyMap.get(key) || [];
        for (const dep of deps) {
            if (selectedKeys.has(dep)) {
                if (dependenciesFirst) {
                    // For updates: if A depends on B, B should go first
                    // A gets higher in-degree, B's edge points to A
                    inDegree.set(key, (inDegree.get(key) || 0) + 1);
                    graph.get(dep)?.push(key);
                } else {
                    // For removals: if A depends on B, A should go first
                    // B gets higher in-degree, A's edge points to B
                    inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
                    graph.get(key)?.push(dep);
                }
            }
        }
    }

    // Kahn's algorithm
    const sorted: T[] = [];
    const queue: string[] = [];

    for (const [key, degree] of inDegree) {
        if (degree === 0) {
            queue.push(key);
        }
    }

    while (queue.length > 0) {
        const key = queue.shift()!;
        const original = items.find(item => getKey(item) === key);
        if (original) {
            sorted.push(original);
        }

        for (const target of graph.get(key) || []) {
            const newDegree = (inDegree.get(target) || 1) - 1;
            inDegree.set(target, newDegree);
            if (newDegree === 0) {
                queue.push(target);
            }
        }
    }

    // If there's a cycle or missing items, add remaining ones
    if (sorted.length < items.length) {
        for (const item of items) {
            if (!sorted.some(s => getKey(s) === getKey(item))) {
                sorted.push(item);
            }
        }
    }

    return sorted;
}
