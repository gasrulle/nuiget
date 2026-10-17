import type { InvalidationScope, ResourceKey } from '../../protocol/domain';
import { normalizeProjectPath, type PlatformId } from '../util/paths';

/**
 * Pure helpers that decide which resource keys an invalidation scope reaches and how two scopes
 * combine. Keys follow the `resourceKeys` builders in `protocol/domain.ts`:
 *
 *   projects | sources | installed:<p> | updates:<p>|pre|stable | transitive:<p>
 *   allProjects:installed | allProjects:updates|pre|stable | allProjects:transitive
 *   versions:<id>|<source>|pre|stable | metadata:<id>@<version>|<source>
 *
 * Matching table (`scopeMatchesKey`):
 *
 *   workspace            → every key
 *   project{paths}       → projects, allProjects:*, installed:<p>, updates:<p>|*, transitive:<p>
 *   package{paths, ids}  → everything `project{paths}` matches, plus versions:<id>|*, metadata:<id>@*
 *   sources              → sources, updates:*, allProjects:updates*, versions:*, metadata:*
 *   metadata{ids}        → versions:<id>|*, metadata:<id>@*
 *
 * Package ids compare case-insensitively. Project paths are compared after `normalizeProjectPath`, so on
 * Windows `C:\\Src\\App.csproj` and `c:/src/app.csproj` are the same project: a path from a file watcher and a
 * path from discovery need not be spelled alike. Only the comparison normalizes; scopes and keys keep the
 * paths they were given.
 */

interface ParsedKey {
    kind: string;
    rest: string;
}

function parseKey(key: ResourceKey): ParsedKey {
    const separator = key.indexOf(':');
    return separator < 0 ? { kind: key, rest: '' } : { kind: key.slice(0, separator), rest: key.slice(separator + 1) };
}

function projectPathOf(parsed: ParsedKey): string | undefined {
    switch (parsed.kind) {
        case 'installed':
        case 'transitive':
            return parsed.rest;
        case 'updates': {
            const flag = parsed.rest.lastIndexOf('|');
            return flag < 0 ? parsed.rest : parsed.rest.slice(0, flag);
        }
        default:
            return undefined;
    }
}

function packageIdOf(parsed: ParsedKey): string | undefined {
    switch (parsed.kind) {
        case 'versions': {
            const end = parsed.rest.indexOf('|');
            return (end < 0 ? parsed.rest : parsed.rest.slice(0, end)).toLowerCase();
        }
        case 'metadata': {
            const end = parsed.rest.indexOf('@');
            return (end < 0 ? parsed.rest : parsed.rest.slice(0, end)).toLowerCase();
        }
        default:
            return undefined;
    }
}

function matchesProjectPaths(projectPaths: readonly string[], parsed: ParsedKey, platform: PlatformId): boolean {
    if (parsed.kind === 'projects' || parsed.kind === 'allProjects') {
        return true;
    }
    const path = projectPathOf(parsed);
    if (path === undefined) {
        return false;
    }
    const wanted = normalizeProjectPath(path, platform);
    return projectPaths.some(candidate => normalizeProjectPath(candidate, platform) === wanted);
}

function matchesPackageIds(packageIds: readonly string[], parsed: ParsedKey): boolean {
    const id = packageIdOf(parsed);
    return id !== undefined && packageIds.some(candidate => candidate.toLowerCase() === id);
}

function matchesSources(parsed: ParsedKey): boolean {
    switch (parsed.kind) {
        case 'sources':
        case 'updates':
        case 'versions':
        case 'metadata':
            return true;
        case 'allProjects':
            return parsed.rest.startsWith('updates');
        default:
            return false;
    }
}

/**
 * True when invalidating `scope` must bump the generation of `key`.
 * `platform` selects the path rules for comparing project paths (default `process.platform`); tests pass it explicitly.
 */
export function scopeMatchesKey(scope: InvalidationScope, key: ResourceKey, platform: PlatformId = process.platform): boolean {
    const parsed = parseKey(key);
    switch (scope.kind) {
        case 'workspace':
            return true;
        case 'project':
            return matchesProjectPaths(scope.projectPaths, parsed, platform);
        case 'package':
            return matchesProjectPaths(scope.projectPaths, parsed, platform) || matchesPackageIds(scope.packageIds, parsed);
        case 'sources':
            return matchesSources(parsed);
        case 'metadata':
            return matchesPackageIds(scope.packageIds, parsed);
    }
}

function unionPaths(a: readonly string[], b: readonly string[]): string[] {
    return [...new Set([...a, ...b])];
}

function unionIds(a: readonly string[], b: readonly string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const id of [...a, ...b]) {
        const lower = id.toLowerCase();
        if (!seen.has(lower)) {
            seen.add(lower);
            result.push(id);
        }
    }
    return result;
}

type ProjectOrPackageScope = Extract<InvalidationScope, { kind: 'project' | 'package' }>;

function widenWithPackageIds(scope: ProjectOrPackageScope, packageIds: readonly string[]): InvalidationScope {
    return {
        kind: 'package',
        projectPaths: [...scope.projectPaths],
        packageIds: unionIds(scope.kind === 'package' ? scope.packageIds : [], packageIds),
    };
}

/**
 * Combine two scopes into one that reaches at least every key either input reaches.
 *
 *   workspace + any                 → workspace
 *   project + project               → project   (paths ∪)
 *   project + package               → package   (paths ∪, ids of the package scope)
 *   package + package               → package   (paths ∪, ids ∪)
 *   metadata + metadata             → metadata  (ids ∪)
 *   metadata + project              → package   (paths of the project scope, ids of the metadata scope)
 *   metadata + package              → package   (paths of the package scope, ids ∪)
 *   sources + sources               → sources
 *   sources + metadata              → sources   (sources already reaches every versions/metadata key)
 *   sources + project | package     → workspace (no narrower scope spans both)
 *
 * The result may reach more keys than the union, never fewer.
 */
export function mergeScopes(a: InvalidationScope, b: InvalidationScope): InvalidationScope {
    if (a.kind === 'workspace' || b.kind === 'workspace') {
        return { kind: 'workspace' };
    }
    if (a.kind === 'sources' || b.kind === 'sources') {
        const other = a.kind === 'sources' ? b : a;
        return other.kind === 'sources' || other.kind === 'metadata' ? { kind: 'sources' } : { kind: 'workspace' };
    }
    if (a.kind === 'metadata') {
        return b.kind === 'metadata'
            ? { kind: 'metadata', packageIds: unionIds(a.packageIds, b.packageIds) }
            : widenWithPackageIds(b, a.packageIds);
    }
    if (b.kind === 'metadata') {
        return widenWithPackageIds(a, b.packageIds);
    }
    if (a.kind === 'project' && b.kind === 'project') {
        return { kind: 'project', projectPaths: unionPaths(a.projectPaths, b.projectPaths) };
    }
    return {
        kind: 'package',
        projectPaths: unionPaths(a.projectPaths, b.projectPaths),
        packageIds: unionIds(a.kind === 'package' ? a.packageIds : [], b.kind === 'package' ? b.packageIds : []),
    };
}
