/**
 * Benchmarks for the 2.0 project model (`src/core/project`) over the tracked fixtures: the static inspection of a
 * single-framework, a multi-targeted and a Central Package Management project, the transitive sections of an assets
 * file, and the project references that order multi-project operations. Replaces the 1.x `csproj-parsing` and
 * `project-parsing` benchmarks (P8.2a, D8).
 */
import { readFileSync } from 'fs';
import * as path from 'path';
import { describe, test } from 'vitest';
import { runBenchmark } from '../../test/benchmarks/benchmark';
import * as projectModule from '../project';

// Bound once on purpose (see src/core/cache/cache.bench.ts): an imported binding is a getter under Vitest's module runner.
const { AssetsReader, StaticProjectInspector, computeTransitiveFrameworks, getProjectDependencyMap, getProjectReferences } = projectModule;

const fixtures = path.resolve(__dirname, '__fixtures__');
const singleProject = path.join(fixtures, 'sdk', 'Sdk.csproj');
const multiTargetProject = path.join(fixtures, 'multitfm', 'App', 'App.csproj');
const cpmProject = path.join(fixtures, 'cpm', 'App', 'App.csproj');
const cpmProjects = [cpmProject, path.join(fixtures, 'cpm', 'Lib', 'Lib.csproj'), path.join(fixtures, 'cpm', 'Nested', 'Inner', 'Inner.csproj')];
const assetsPath = path.join(fixtures, 'cpm', 'App', 'obj', 'project.assets.json');
const assets = JSON.parse(readFileSync(assetsPath, 'utf8')) as projectModule.AssetsJson;

const inspector = new StaticProjectInspector({ assets: new AssetsReader(), stopDirs: [fixtures] });

describe('core project — static inspection', () => {
    test('single-framework project', async (context) => {
        await runBenchmark(context, 'single-framework project', async () => {
            await inspector.inspect(singleProject);
        });
    });

    test('multi-targeted project with Directory.Build.props', async (context) => {
        await runBenchmark(context, 'multi-targeted project with Directory.Build.props', async () => {
            await inspector.inspect(multiTargetProject);
        });
    });

    test('Central Package Management project', async (context) => {
        await runBenchmark(context, 'Central Package Management project', async () => {
            await inspector.inspect(cpmProject);
        });
    });
});

describe('core project — assets file', () => {
    test('read and parse (cold reader)', async (context) => {
        await runBenchmark(context, 'read and parse (cold reader)', async () => {
            await new AssetsReader().read(assetsPath);
        });
    });

    test('transitive sections per framework', async (context) => {
        await runBenchmark(context, 'transitive sections per framework', () => {
            computeTransitiveFrameworks(assets);
        });
    });
});

describe('core project — references', () => {
    test('references of one project', async (context) => {
        await runBenchmark(context, 'references of one project', async () => {
            await getProjectReferences(cpmProject);
        });
    });

    test('dependency map of three projects', async (context) => {
        await runBenchmark(context, 'dependency map of three projects', async () => {
            await getProjectDependencyMap(cpmProjects);
        });
    });
});
