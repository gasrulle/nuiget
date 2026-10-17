import { describe, expect, it } from 'vitest';
import { resourceKeys } from '../../protocol/domain';
import type { InvalidationScope, ResourceKey } from '../../protocol/domain';
import { mergeScopes, scopeMatchesKey } from './scopes';

const P1 = '/ws/app/App.csproj';
const P2 = '/ws/lib/Lib.csproj';
const NUGET = 'https://api.nuget.org/v3/index.json';

const keys = {
    projects: resourceKeys.projects(),
    sources: resourceKeys.sources('/ws/app'),
    installedP1: resourceKeys.installed(P1),
    installedP2: resourceKeys.installed(P2),
    updatesP1Stable: resourceKeys.updates(P1, false),
    updatesP1Pre: resourceKeys.updates(P1, true),
    updatesP2Stable: resourceKeys.updates(P2, false),
    transitiveP1: resourceKeys.transitive(P1),
    transitiveP2: resourceKeys.transitive(P2),
    allInstalled: resourceKeys.allProjectsInstalled(),
    allUpdatesPre: resourceKeys.allProjectsUpdates(true),
    allUpdatesStable: resourceKeys.allProjectsUpdates(false),
    allTransitive: resourceKeys.allProjectsTransitive(),
    versionsNewtonsoft: resourceKeys.versions('Newtonsoft.Json', undefined, false),
    versionsNewtonsoftSource: resourceKeys.versions('newtonsoft.json', NUGET, true),
    versionsSerilog: resourceKeys.versions('Serilog', undefined, false),
    metadataNewtonsoft: resourceKeys.metadata('Newtonsoft.Json', '13.0.3', undefined),
    metadataSerilog: resourceKeys.metadata('Serilog', '3.1.1', NUGET),
} satisfies Record<string, ResourceKey>;

const allKeys = Object.values(keys);

function matched(scope: InvalidationScope): ResourceKey[] {
    return allKeys.filter(key => scopeMatchesKey(scope, key));
}

describe('scopeMatchesKey', () => {
    it('workspace reaches every key', () => {
        expect(matched({ kind: 'workspace' })).toEqual(allKeys);
    });

    it('project reaches the per-project keys of its paths plus the project list and aggregates', () => {
        expect(matched({ kind: 'project', projectPaths: [P1] })).toEqual([
            keys.projects,
            keys.installedP1,
            keys.updatesP1Stable,
            keys.updatesP1Pre,
            keys.transitiveP1,
            keys.allInstalled,
            keys.allUpdatesPre,
            keys.allUpdatesStable,
            keys.allTransitive,
        ]);
    });

    it('project with several paths reaches each of them', () => {
        const result = matched({ kind: 'project', projectPaths: [P1, P2] });
        expect(result).toContain(keys.installedP2);
        expect(result).toContain(keys.updatesP2Stable);
        expect(result).toContain(keys.transitiveP2);
        expect(result).not.toContain(keys.sources);
        expect(result).not.toContain(keys.versionsNewtonsoft);
        expect(result).not.toContain(keys.metadataNewtonsoft);
    });

    it('package reaches the project keys plus versions/metadata of its ids, case-insensitively', () => {
        const result = matched({ kind: 'package', projectPaths: [P2], packageIds: ['NEWTONSOFT.JSON'] });
        expect(result).toEqual([
            keys.projects,
            keys.installedP2,
            keys.updatesP2Stable,
            keys.transitiveP2,
            keys.allInstalled,
            keys.allUpdatesPre,
            keys.allUpdatesStable,
            keys.allTransitive,
            keys.versionsNewtonsoft,
            keys.versionsNewtonsoftSource,
            keys.metadataNewtonsoft,
        ]);
    });

    it('sources reaches source-dependent keys only', () => {
        expect(matched({ kind: 'sources' })).toEqual([
            keys.sources,
            keys.updatesP1Stable,
            keys.updatesP1Pre,
            keys.updatesP2Stable,
            keys.allUpdatesPre,
            keys.allUpdatesStable,
            keys.versionsNewtonsoft,
            keys.versionsNewtonsoftSource,
            keys.versionsSerilog,
            keys.metadataNewtonsoft,
            keys.metadataSerilog,
        ]);
    });

    it('metadata reaches only versions/metadata keys of its ids', () => {
        expect(matched({ kind: 'metadata', packageIds: ['serilog'] })).toEqual([
            keys.versionsSerilog,
            keys.metadataSerilog,
        ]);
        expect(matched({ kind: 'metadata', packageIds: ['Serilog.Sinks.Console'] })).toEqual([]);
    });

    it('does not confuse a package id that prefixes another', () => {
        const scope: InvalidationScope = { kind: 'metadata', packageIds: ['Newtonsoft'] };
        expect(scopeMatchesKey(scope, keys.versionsNewtonsoft)).toBe(false);
        expect(scopeMatchesKey(scope, keys.metadataNewtonsoft)).toBe(false);
    });

    it('does not match a project whose path merely contains the scoped path', () => {
        const nested = resourceKeys.installed(`${P1}.bak`);
        expect(scopeMatchesKey({ kind: 'project', projectPaths: [P1] }, nested)).toBe(false);
        expect(scopeMatchesKey({ kind: 'project', projectPaths: [`${P1}.bak`] }, keys.installedP1)).toBe(false);
    });

    it('matchesProjectPaths: win32 paths differing in case and separators match', () => {
        const scoped = 'C:\\Src\\App\\App.csproj';
        const keyed = 'c:/src/app/App.csproj';
        const project: InvalidationScope = { kind: 'project', projectPaths: [scoped] };
        const packageScope: InvalidationScope = { kind: 'package', projectPaths: [scoped], packageIds: ['Serilog'] };

        for (const key of [resourceKeys.installed(keyed), resourceKeys.updates(keyed, true), resourceKeys.transitive(keyed)]) {
            expect(scopeMatchesKey(project, key, 'win32')).toBe(true);
            expect(scopeMatchesKey(packageScope, key, 'win32')).toBe(true);
            // Elsewhere a backslash is a character of the name and case matters.
            expect(scopeMatchesKey(project, key, 'linux')).toBe(false);
            expect(scopeMatchesKey(packageScope, key, 'linux')).toBe(false);
        }
        // A different project stays different on Windows too.
        expect(scopeMatchesKey(project, resourceKeys.installed('c:/src/app/Other.csproj'), 'win32')).toBe(false);
    });

    it('normalizes redundant separators and dot segments on every platform', () => {
        const scope: InvalidationScope = { kind: 'project', projectPaths: ['/ws/app/../app/App.csproj'] };
        expect(scopeMatchesKey(scope, keys.installedP1, 'linux')).toBe(true);
        expect(scopeMatchesKey(scope, resourceKeys.installed('/ws//app/App.csproj'), 'darwin')).toBe(true);
        expect(scopeMatchesKey(scope, keys.installedP2, 'linux')).toBe(false);
    });

    it('reaches the source list of every project directory through the sources scope only', () => {
        const appSources = resourceKeys.sources('/ws/app');
        const libSources = resourceKeys.sources('C:\\ws\\lib');
        expect(appSources).toBe('sources:/ws/app');

        for (const key of [appSources, libSources]) {
            expect(scopeMatchesKey({ kind: 'sources' }, key)).toBe(true);
            expect(scopeMatchesKey({ kind: 'workspace' }, key)).toBe(true);
            expect(scopeMatchesKey({ kind: 'project', projectPaths: ['/ws/app', 'C:\\ws\\lib'] }, key, 'win32')).toBe(false);
            expect(scopeMatchesKey({ kind: 'metadata', packageIds: ['sources'] }, key)).toBe(false);
        }
    });

    it('tolerates malformed keys without throwing', () => {
        expect(scopeMatchesKey({ kind: 'project', projectPaths: [P1] }, 'bogus' as ResourceKey)).toBe(false);
        expect(scopeMatchesKey({ kind: 'metadata', packageIds: ['x'] }, 'versions:x' as ResourceKey)).toBe(true);
        expect(scopeMatchesKey({ kind: 'metadata', packageIds: ['x'] }, 'metadata:x' as ResourceKey)).toBe(true);
        expect(scopeMatchesKey({ kind: 'project', projectPaths: [P1] }, `updates:${P1}` as ResourceKey)).toBe(true);
        expect(scopeMatchesKey({ kind: 'sources' }, 'allProjects:installed' as ResourceKey)).toBe(false);
    });
});

describe('mergeScopes', () => {
    const workspace: InvalidationScope = { kind: 'workspace' };
    const sources: InvalidationScope = { kind: 'sources' };
    const projectP1: InvalidationScope = { kind: 'project', projectPaths: [P1] };
    const projectP2: InvalidationScope = { kind: 'project', projectPaths: [P2] };
    const packageP1: InvalidationScope = { kind: 'package', projectPaths: [P1], packageIds: ['Newtonsoft.Json'] };
    const packageP2: InvalidationScope = { kind: 'package', projectPaths: [P2], packageIds: ['serilog', 'NEWTONSOFT.JSON'] };
    const metadataNewtonsoft: InvalidationScope = { kind: 'metadata', packageIds: ['newtonsoft.json'] };
    const metadataSerilog: InvalidationScope = { kind: 'metadata', packageIds: ['Serilog'] };

    const table: Array<[string, InvalidationScope, InvalidationScope, InvalidationScope]> = [
        ['workspace + project', workspace, projectP1, workspace],
        ['package + workspace', packageP1, workspace, workspace],
        ['project + project', projectP1, projectP2, { kind: 'project', projectPaths: [P1, P2] }],
        ['project + same project', projectP1, projectP1, { kind: 'project', projectPaths: [P1] }],
        ['project + package', projectP2, packageP1, { kind: 'package', projectPaths: [P2, P1], packageIds: ['Newtonsoft.Json'] }],
        ['package + project', packageP1, projectP2, { kind: 'package', projectPaths: [P1, P2], packageIds: ['Newtonsoft.Json'] }],
        ['package + package (ids deduped case-insensitively)', packageP1, packageP2, { kind: 'package', projectPaths: [P1, P2], packageIds: ['Newtonsoft.Json', 'serilog'] }],
        ['metadata + metadata', metadataNewtonsoft, metadataSerilog, { kind: 'metadata', packageIds: ['newtonsoft.json', 'Serilog'] }],
        ['metadata + project', metadataSerilog, projectP1, { kind: 'package', projectPaths: [P1], packageIds: ['Serilog'] }],
        ['project + metadata', projectP1, metadataSerilog, { kind: 'package', projectPaths: [P1], packageIds: ['Serilog'] }],
        ['metadata + package', metadataSerilog, packageP1, { kind: 'package', projectPaths: [P1], packageIds: ['Newtonsoft.Json', 'Serilog'] }],
        ['package + metadata (duplicate id)', packageP1, metadataNewtonsoft, { kind: 'package', projectPaths: [P1], packageIds: ['Newtonsoft.Json'] }],
        ['sources + sources', sources, sources, sources],
        ['sources + metadata', sources, metadataSerilog, sources],
        ['metadata + sources', metadataSerilog, sources, sources],
        ['sources + project', sources, projectP1, workspace],
        ['package + sources', packageP1, sources, workspace],
        ['sources + workspace', sources, workspace, workspace],
    ];

    it.each(table)('%s', (_label, a, b, expected) => {
        expect(mergeScopes(a, b)).toEqual(expected);
    });

    it('never reaches fewer keys than either input (union property)', () => {
        const scopes = [workspace, sources, projectP1, projectP2, packageP1, packageP2, metadataNewtonsoft, metadataSerilog];
        for (const a of scopes) {
            for (const b of scopes) {
                const merged = mergeScopes(a, b);
                for (const key of allKeys) {
                    if (scopeMatchesKey(a, key) || scopeMatchesKey(b, key)) {
                        expect(scopeMatchesKey(merged, key), `${a.kind}+${b.kind} must reach ${key}`).toBe(true);
                    }
                }
            }
        }
    });

    it('returns fresh arrays rather than aliasing the inputs', () => {
        const merged = mergeScopes(projectP1, projectP2);
        expect(merged.kind).toBe('project');
        if (merged.kind === 'project') {
            expect(merged.projectPaths).not.toBe(projectP1.kind === 'project' ? projectP1.projectPaths : undefined);
        }
    });
});
