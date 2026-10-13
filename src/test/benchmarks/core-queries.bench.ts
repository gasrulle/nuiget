/**
 * Benchmarks for the invalidation scopes of the 2.0 query coordinator (`src/core/queries/scopes.ts`):
 * the cost of deciding which of about 200 resource keys a scope reaches, per scope kind, and of merging
 * a burst of scopes into one. The coordinator does both on every invalidation.
 */
import { test, describe } from 'vitest';
import { runBenchmark } from './benchmark';
import * as queriesModule from '../../core/queries';
import { resourceKeys, type InvalidationScope, type ResourceKey } from '../../protocol/domain';

// Bound once on purpose. Under Vitest's module runner an imported binding is a getter on the module object;
// calling it inside a benchmark would add that overhead to every sample (Vitest warns about it).
const { scopeMatchesKey, mergeScopes } = queriesModule;

const NUGET_ORG = 'https://api.nuget.org/v3/index.json';
const PROJECT_COUNT = 40;
const packageIds = Array.from({ length: 10 }, (_, index) => `Contoso.Package${index}`);

/** The keys a workspace of 40 projects and 10 looked-up packages has: 198 of them. */
function keySet(projectPaths: readonly string[], sourceDirectories: readonly string[]): ResourceKey[] {
    return [
        resourceKeys.projects(),
        ...sourceDirectories.map(directory => resourceKeys.sources(directory)),
        resourceKeys.allProjectsInstalled(),
        resourceKeys.allProjectsUpdates(false),
        resourceKeys.allProjectsUpdates(true),
        resourceKeys.allProjectsTransitive(),
        ...projectPaths.flatMap(projectPath => [
            resourceKeys.installed(projectPath),
            resourceKeys.updates(projectPath, false),
            resourceKeys.updates(projectPath, true),
            resourceKeys.transitive(projectPath),
        ]),
        ...packageIds.flatMap(packageId => [
            resourceKeys.versions(packageId, undefined, false),
            resourceKeys.versions(packageId, NUGET_ORG, true),
            resourceKeys.metadata(packageId, '1.2.3', undefined),
        ]),
    ];
}

const posixPaths = Array.from({ length: PROJECT_COUNT }, (_, index) => `/ws/Project${index}/Project${index}.csproj`);
const posixKeys = keySet(posixPaths, ['/ws', '/ws/Project0', '/ws/Project1']);
// As a file watcher on Windows may spell them: lower case and forward slashes.
const windowsPaths = ['c:/ws/app/app.csproj', ...Array.from({ length: PROJECT_COUNT - 1 }, (_, index) => `c:/ws/project${index}/project${index}.csproj`)];
const windowsKeys = keySet(windowsPaths, ['c:/ws', 'c:/ws/app', 'c:/ws/project0']);

// The platform is always passed: the default (`process.platform`) would make the numbers depend on the machine.
const countReached = (scope: InvalidationScope, keys: readonly ResourceKey[], platform: NodeJS.Platform): number => {
    let reached = 0;
    for (const key of keys) {
        if (scopeMatchesKey(scope, key, platform)) {
            reached++;
        }
    }
    return reached;
};

const workspaceScope: InvalidationScope = { kind: 'workspace' };
const projectScope: InvalidationScope = { kind: 'project', projectPaths: [posixPaths[7]] };
const windowsProjectScope: InvalidationScope = { kind: 'project', projectPaths: ['C:\\ws\\app\\App.csproj'] };
const packageScope: InvalidationScope = { kind: 'package', projectPaths: posixPaths.slice(0, 3), packageIds: packageIds.slice(0, 5) };
const sourcesScope: InvalidationScope = { kind: 'sources' };
const metadataScope: InvalidationScope = { kind: 'metadata', packageIds: packageIds.slice(0, 5) };

const projectBurst: InvalidationScope[] = Array.from({ length: 50 }, (_, index) => ({ kind: 'project', projectPaths: [posixPaths[index % PROJECT_COUNT]] }));
const mixedBurst: InvalidationScope[] = Array.from({ length: 50 }, (_, index): InvalidationScope => {
    const projectPath = posixPaths[index % PROJECT_COUNT];
    const packageId = packageIds[index % packageIds.length];
    switch (index % 3) {
        case 0: return { kind: 'project', projectPaths: [projectPath] };
        case 1: return { kind: 'package', projectPaths: [projectPath], packageIds: [packageId] };
        default: return { kind: 'metadata', packageIds: [packageId] };
    }
});

// A benchmark whose scope reached nothing would time the wrong path: check what each one reaches, once.
for (const [expected, scope, keys, platform] of [
    [posixKeys.length, workspaceScope, posixKeys, 'linux'],
    // `projects`, the four all-projects keys and the project's own four.
    [9, projectScope, posixKeys, 'linux'],
    [9, windowsProjectScope, windowsKeys, 'win32'],
    // 5 + 3 × 4 as above, and three keys for each of the five ids.
    [32, packageScope, posixKeys, 'linux'],
    // Three source listings, every `updates` key (80 + 2) and every `versions` and `metadata` key (30).
    [115, sourcesScope, posixKeys, 'linux'],
    [15, metadataScope, posixKeys, 'linux'],
] as Array<[number, InvalidationScope, ResourceKey[], NodeJS.Platform]>) {
    const reached = countReached(scope, keys, platform);
    if (reached !== expected) {
        throw new Error(`The ${scope.kind} scope reaches ${reached} of ${keys.length} keys, expected ${expected}`);
    }
}

describe('core queries — scopes', () => {
    test('workspace scope', async (context) => {
        await runBenchmark(context, 'workspace scope', () => {
            countReached(workspaceScope, posixKeys, 'linux');
        });
    });

    test('project scope, one path (posix)', async (context) => {
        await runBenchmark(context, 'project scope, one path (posix)', () => {
            countReached(projectScope, posixKeys, 'linux');
        });
    });

    test('project scope, one path spelled differently (win32)', async (context) => {
        await runBenchmark(context, 'project scope, one path spelled differently (win32)', () => {
            countReached(windowsProjectScope, windowsKeys, 'win32');
        });
    });

    test('package scope, three paths and five ids', async (context) => {
        await runBenchmark(context, 'package scope, three paths and five ids', () => {
            countReached(packageScope, posixKeys, 'linux');
        });
    });

    test('sources scope', async (context) => {
        await runBenchmark(context, 'sources scope', () => {
            countReached(sourcesScope, posixKeys, 'linux');
        });
    });

    test('metadata scope, five ids', async (context) => {
        await runBenchmark(context, 'metadata scope, five ids', () => {
            countReached(metadataScope, posixKeys, 'linux');
        });
    });

    test('merge 50 project scopes', async (context) => {
        await runBenchmark(context, 'merge 50 project scopes', () => {
            projectBurst.reduce(mergeScopes);
        });
    });

    test('merge 50 mixed project, package and metadata scopes', async (context) => {
        await runBenchmark(context, 'merge 50 mixed project, package and metadata scopes', () => {
            mixedBurst.reduce(mergeScopes);
        });
    });
});
