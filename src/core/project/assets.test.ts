import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyFixture, createScratchDir, fixture, writeTree, type ScratchDir } from './__fixtures__/scratch';
import { AssetsReader, assetsPathFor, computeTransitiveFrameworks, lockFilePathFor, type AssetsJson } from './assets';

const cpmApp = fixture('cpm', 'App', 'App.csproj');
const cyclic = (): AssetsJson => JSON.parse(fs.readFileSync(fixture('assets', 'cyclic.project.assets.json'), 'utf-8')) as AssetsJson;

const scratches: ScratchDir[] = [];
async function scratchProject(files: { assets?: string; lock?: string } = {}): Promise<string> {
    const scratch = await createScratchDir('assets');
    scratches.push(scratch);
    if (files.assets !== undefined) {
        await copyFixture(files.assets, scratch.dir, path.join('obj', 'project.assets.json'));
    }
    if (files.lock !== undefined) {
        await copyFixture(files.lock, scratch.dir, 'packages.lock.json');
    }
    return path.join(scratch.dir, 'App.csproj');
}

afterEach(async () => {
    await Promise.all(scratches.splice(0).map(scratch => scratch.cleanup()));
});

describe('paths of the restore output', () => {
    it('derives both paths from the project file', () => {
        const project = path.join('w', 'App', 'App.csproj');
        expect(assetsPathFor(project)).toBe(path.join('w', 'App', 'obj', 'project.assets.json'));
        expect(lockFilePathFor(project)).toBe(path.join('w', 'App', 'packages.lock.json'));
    });
});

describe('AssetsReader.getResolvedVersions', () => {
    it('reads the tracked restore output of the CPM fixture', async () => {
        const resolved = await new AssetsReader().getResolvedVersions(cpmApp);
        expect(resolved.get('newtonsoft.json')).toBe('13.0.3');
        expect(resolved.get('serilog')).toBe('4.0.0');
        expect(resolved.get('xunit')).toBe('2.9.0');
        expect(resolved.get('xunit.abstractions')).toBe('2.0.3');
        expect(resolved.size).toBe(9);
    });

    it('takes the union of assets file and lock file, and the assets file wins', async () => {
        const project = await scratchProject({ assets: path.join('cpm', 'App', 'obj', 'project.assets.json'), lock: path.join('assets', 'packages.lock.json') });
        const resolved = await new AssetsReader().getResolvedVersions(project);
        // In both: the assets file says 4.0.0, the lock file 4.0.2.
        expect(resolved.get('serilog')).toBe('4.0.0');
        // Only in the lock file, as a direct reference.
        expect(resolved.get('fluentvalidation')).toBe('11.9.2');
        // Only in the lock file, transitive: not a direct reference, so not taken from there.
        expect(resolved.has('serilog.sinks.console')).toBe(false);
        expect(resolved.size).toBe(10);
    });

    it('falls back to the lock file alone, and to nothing', async () => {
        const lockOnly = await scratchProject({ lock: path.join('assets', 'packages.lock.json') });
        expect(Object.fromEntries(await new AssetsReader().getResolvedVersions(lockOnly))).toEqual({ 'newtonsoft.json': '13.0.3', serilog: '4.0.2', fluentvalidation: '11.9.2' });
        expect((await new AssetsReader().getResolvedVersions(await scratchProject())).size).toBe(0);
    });

    it('ignores a malformed lock file and project-type libraries', async () => {
        const project = await scratchProject({ assets: path.join('assets', 'cyclic.project.assets.json') });
        await writeTree(path.dirname(project), { 'packages.lock.json': '{ not json' });
        const resolved = await new AssetsReader().getResolvedVersions(project);
        expect(Array.from(resolved.keys()).sort()).toEqual(['leaf.c', 'mid.b', 'orphan.e', 'root.a', 'root.d']);
    });
});

describe('AssetsReader.getResolvedVersionsByFramework', () => {
    it('returns the versions of each target framework from the targets', async () => {
        const byFramework = await new AssetsReader().getResolvedVersionsByFramework(cpmApp);
        expect(Array.from(byFramework.keys())).toEqual(['net8.0']);
        expect(byFramework.get('net8.0')?.get('newtonsoft.json')).toBe('13.0.3');
        expect(byFramework.get('net8.0')?.size).toBe(9);
    });

    it('keeps frameworks apart, folds runtime-specific targets into their framework and skips projects', async () => {
        const project = await scratchProject();
        await writeTree(path.dirname(project), {
            [path.join('obj', 'project.assets.json')]: JSON.stringify({
                version: 3,
                targets: {
                    'net8.0': { 'System.Text.Json/9.0.0': { type: 'package' }, 'Shared/1.0.0': { type: 'project' } },
                    'net8.0/win-x64': { 'System.Text.Json/9.0.0': { type: 'package' }, 'Runtime.Only/1.0.0': { type: 'package' } },
                    'net6.0': { 'System.Text.Json/8.0.5': { type: 'package' }, 'Polly/8.0.0': {}, 'not a library key': {} },
                },
            }),
        });
        const byFramework = await new AssetsReader().getResolvedVersionsByFramework(project);
        expect(Object.fromEntries(Array.from(byFramework, ([framework, versions]) => [framework, Object.fromEntries(versions)]))).toEqual({
            'net8.0': { 'system.text.json': '9.0.0', 'runtime.only': '1.0.0' },
            'net6.0': { 'system.text.json': '8.0.5', polly: '8.0.0' },
        });
    });

    it('is empty without restore output, also when a lock file exists', async () => {
        const project = await scratchProject({ lock: path.join('assets', 'packages.lock.json') });
        expect((await new AssetsReader().getResolvedVersionsByFramework(project)).size).toBe(0);
    });
});

describe('AssetsReader.getPackageDependencies', () => {
    it('maps each package to its dependencies, lower-cased', async () => {
        const dependencies = await new AssetsReader().getPackageDependencies(cpmApp);
        expect(dependencies.get('xunit')).toEqual(['xunit.analyzers', 'xunit.assert', 'xunit.core']);
        expect(dependencies.get('xunit.core')).toEqual(['xunit.extensibility.core', 'xunit.extensibility.execution']);
        expect(dependencies.get('newtonsoft.json')).toEqual([]);
    });

    it('unions the targets and is empty without restore output', async () => {
        const project = await scratchProject({ assets: path.join('assets', 'cyclic.project.assets.json') });
        const dependencies = await new AssetsReader().getPackageDependencies(project);
        expect(dependencies.get('mid.b')).toEqual(['leaf.c']);
        expect(dependencies.get('leaf.c')).toEqual(['mid.b']);
        expect((await new AssetsReader().getPackageDependencies(await scratchProject())).size).toBe(0);
    });
});

describe('computeTransitiveFrameworks', () => {
    it('finds the roots of packages in a cyclic graph', () => {
        const sections = computeTransitiveFrameworks(cyclic());
        expect(sections.map(section => section.targetFramework)).toEqual(['net8.0', 'net8.0/win-x64']);
        // Mid.B and Leaf.C depend on each other; both are reached from Root.A and from Root.D.
        expect(sections[0].packages).toEqual([
            { id: 'Leaf.C', version: '3.0.0', requiredByChain: ['Root.A', 'Root.D'], fullChain: undefined },
            { id: 'Mid.B', version: '2.0.0', requiredByChain: ['Root.A', 'Root.D'], fullChain: undefined },
            { id: 'Orphan.E', version: '5.0.0', requiredByChain: [], fullChain: undefined },
        ]);
        // The runtime-specific target has no dependency group of its own and uses its framework's.
        expect(sections[1].packages).toEqual([{ id: 'Mid.B', version: '2.0.0', requiredByChain: ['Root.A'], fullChain: undefined }]);
    });

    it('leaves out direct references and project references', () => {
        const ids = computeTransitiveFrameworks(cyclic())[0].packages.map(pkg => pkg.id);
        expect(ids).not.toContain('Root.A');
        expect(ids).not.toContain('Shared');
    });

    it('shows five roots and keeps the full list beside them', () => {
        const roots = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'];
        const assets: AssetsJson = {
            targets: { 'net8.0': Object.fromEntries([...roots.map(root => [`${root}/1.0.0`, { type: 'package', dependencies: { Shared: '1.0.0' } }]), ['Shared/1.0.0', { type: 'package' }]]) },
            projectFileDependencyGroups: { 'net8.0': roots.map(root => `${root} >= 1.0.0`) },
        };
        const [shared] = computeTransitiveFrameworks(assets)[0].packages;
        expect(shared.requiredByChain).toEqual(['R1', 'R2', 'R3', 'R4', 'R5']);
        expect(shared.fullChain).toEqual(roots);
    });

    it('orders frameworks newest first and is empty without targets or dependency groups', () => {
        const assets: AssetsJson = { targets: { 'net6.0': {}, 'net8.0': {}, netstandard2: {} }, projectFileDependencyGroups: {} };
        expect(computeTransitiveFrameworks(assets).map(section => section.targetFramework)).toEqual(['net8.0', 'net6.0', 'netstandard2']);
        expect(computeTransitiveFrameworks({})).toEqual([]);
        expect(computeTransitiveFrameworks({ targets: {} })).toEqual([]);
    });
});

describe('AssetsReader.getTransitivePackages', () => {
    it('reads the fixture', async () => {
        const result = await new AssetsReader().getTransitivePackages(cpmApp);
        expect(result.projectPath).toBe(cpmApp);
        expect(result.dataSourceAvailable).toBe(true);
        expect(result.errorKind).toBeUndefined();
        expect(result.frameworks[0].packages.find(pkg => pkg.id === 'xunit.abstractions')?.requiredByChain).toEqual(['xunit']);
    });

    it('reports missing restore output as an unavailable data source, not as an error', async () => {
        const project = await scratchProject();
        expect(await new AssetsReader().getTransitivePackages(project)).toEqual({ projectPath: project, frameworks: [], dataSourceAvailable: false });
    });

    it('buckets a malformed assets file as parse-failed without the error text', async () => {
        const project = await scratchProject();
        await writeTree(path.dirname(project), { [path.join('obj', 'project.assets.json')]: '{ "targets": ' });
        expect(await new AssetsReader().getTransitivePackages(project)).toEqual({ projectPath: project, frameworks: [], dataSourceAvailable: true, errorKind: 'parse-failed' });
    });

    it('buckets another file-system failure as fs-error', async () => {
        const project = await scratchProject();
        // A directory where the file should be: reading it fails with EISDIR.
        await fs.promises.mkdir(assetsPathFor(project), { recursive: true });
        const result = await new AssetsReader().getTransitivePackages(project);
        expect(result.errorKind).toBe('fs-error');
        expect(result.dataSourceAvailable).toBe(true);
    });
});

describe('AssetsReader cache', () => {
    async function assetsFile(): Promise<string> {
        const project = await scratchProject({ assets: path.join('assets', 'cyclic.project.assets.json') });
        return assetsPathFor(project);
    }

    it('parses a file once while it is unchanged and fresh', async () => {
        let now = 1_000;
        const reader = new AssetsReader(() => now);
        const file = await assetsFile();
        const first = await reader.read(file);
        now += 29_999;
        expect(await reader.read(file)).toBe(first);
    });

    it('parses again after 30 s, after a change of the file, and after clear()', async () => {
        let now = 1_000;
        const reader = new AssetsReader(() => now);
        const file = await assetsFile();
        const first = await reader.read(file);

        now += 30_000;
        const second = await reader.read(file);
        expect(second).not.toBe(first);
        expect(second).toEqual(first);

        await fs.promises.utimes(file, new Date(2_000_000_000_000), new Date(2_000_000_000_000));
        const third = await reader.read(file);
        expect(third).not.toBe(second);

        reader.clear();
        expect(await reader.read(file)).not.toBe(third);
    });

    it('keeps five documents and drops the oldest', async () => {
        let now = 1_000;
        const reader = new AssetsReader(() => now);
        const files: string[] = [];
        for (let index = 0; index < 6; index++) {
            files.push(await assetsFile());
        }
        const parsed: unknown[] = [];
        for (const file of files) {
            parsed.push(await reader.read(file));
            now += 1;
        }
        // The sixth read pushed the first out; the second is still there.
        expect(await reader.read(files[1])).toBe(parsed[1]);
        expect(await reader.read(files[0])).not.toBe(parsed[0]);
    });

    it('rejects with the underlying error so that callers can bucket it', async () => {
        const project = await scratchProject();
        await expect(new AssetsReader().read(assetsPathFor(project))).rejects.toMatchObject({ code: 'ENOENT' });
        await writeTree(path.dirname(project), { [path.join('obj', 'project.assets.json')]: 'nope' });
        await expect(new AssetsReader().read(assetsPathFor(project))).rejects.toBeInstanceOf(SyntaxError);
    });
});
