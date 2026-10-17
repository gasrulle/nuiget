import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeProjectPath } from '../util/paths';
import { topologicalSortByDependency } from '../util/topo';
import { createScratchDir, fixture, writeTree, type ScratchDir } from './__fixtures__/scratch';
import { getProjectDependencyMap, getProjectReferences } from './references';

const scratches: ScratchDir[] = [];
/** Writes projects (name → referenced project names or raw `<ItemGroup>` content) and returns name → path. */
async function solution(projects: Record<string, string[] | string>): Promise<Record<string, string>> {
    const scratch = await createScratchDir('references');
    scratches.push(scratch);
    const files: Record<string, string> = {};
    const paths: Record<string, string> = {};
    for (const [name, content] of Object.entries(projects)) {
        const items = typeof content === 'string' ? content : content.map(reference => `<ProjectReference Include="..\\${reference}\\${reference}.csproj" />`).join('');
        files[path.join(name, `${name}.csproj`)] = `<Project Sdk="Microsoft.NET.Sdk"><ItemGroup>${items}</ItemGroup></Project>`;
        paths[name] = path.join(scratch.dir, name, `${name}.csproj`);
    }
    await writeTree(scratch.dir, files);
    return paths;
}

const normalized = (...projectPaths: string[]) => projectPaths.map(projectPath => normalizeProjectPath(projectPath));
/** Orders with the sort the bulk workflows use, dependencies first. */
function order(projectPaths: string[], dependencies: Map<string, string[]>): string[] {
    return topologicalSortByDependency(projectPaths, projectPath => normalizeProjectPath(projectPath), dependencies, new Set(normalized(...projectPaths)), true);
}

afterEach(async () => {
    await Promise.all(scratches.splice(0).map(scratch => scratch.cleanup()));
});

describe('getProjectReferences', () => {
    it('resolves a reference against the project directory', async () => {
        expect(await getProjectReferences(fixture('cpm', 'App', 'App.csproj'))).toEqual([fixture('cpm', 'Lib', 'Lib.csproj')]);
    });

    it('reads backslash paths on every platform, and returns a reference whose file is missing', async () => {
        // sdk/Sdk.csproj references ..\Shared\Shared.csproj, which does not exist.
        expect(await getProjectReferences(fixture('sdk', 'Sdk.csproj'))).toEqual([fixture('Shared', 'Shared.csproj')]);
    });

    it('returns nothing for a missing file, for malformed XML and for a project without references', async () => {
        const projects = await solution({ Broken: '<ProjectReference Include="..\\A\\A.csproj">', Plain: [] });
        expect(await getProjectReferences(path.join(path.dirname(projects.Plain), 'Missing.csproj'))).toEqual([]);
        expect(await getProjectReferences(projects.Broken)).toEqual([]);
        expect(await getProjectReferences(projects.Plain)).toEqual([]);
        expect(await getProjectReferences(fixture('cpm', 'Lib', 'Lib.csproj'))).toEqual([]);
    });

    it('reads every form of the item and nothing else', async () => {
        const projects = await solution({
            App: `
                <!-- <ProjectReference Include="..\\Commented\\Commented.csproj" /> -->
                <ProjectReference Include='../Single/Single.csproj' />
                <ProjectReference Include="..\\WithChild\\WithChild.csproj"><PrivateAssets>all</PrivateAssets></ProjectReference>
                <ProjectReference Include=" ..\\ListA\\ListA.csproj ; ../ListB/ListB.csproj;" />
                <ProjectReference Include="..\\Single\\Single.csproj" Condition="'$(Configuration)' == 'Debug'" />
                <ProjectReference Include="..\\Plugins\\**\\*.csproj" />
                <ProjectReference Include="$(SharedRoot)\\Shared.csproj" />
                <ProjectReference Include="@(ExtraProjects)" />
                <ProjectReference Update="..\\Updated\\Updated.csproj" />
                <ProjectReference Remove="..\\Removed\\Removed.csproj" />
                <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />`,
        });
        const root = path.dirname(path.dirname(projects.App));
        expect(await getProjectReferences(projects.App)).toEqual(['Single', 'WithChild', 'ListA', 'ListB'].map(name => path.join(root, name, `${name}.csproj`)));
    });
});

describe('getProjectDependencyMap', () => {
    it('maps a diamond, with normalized keys and values, so that dependencies order first', async () => {
        const projects = await solution({ App: ['Left', 'Right'], Left: ['Base'], Right: ['Base'], Base: [] });
        const all = [projects.App, projects.Left, projects.Right, projects.Base];
        const dependencies = await getProjectDependencyMap(all);
        expect(Object.fromEntries(dependencies)).toEqual({
            [normalizeProjectPath(projects.App)]: normalized(projects.Left, projects.Right),
            [normalizeProjectPath(projects.Left)]: normalized(projects.Base),
            [normalizeProjectPath(projects.Right)]: normalized(projects.Base),
            [normalizeProjectPath(projects.Base)]: [],
        });
        const ordered = order(all, dependencies);
        expect(ordered[0]).toBe(projects.Base);
        expect(ordered[3]).toBe(projects.App);
        expect(ordered.slice(1, 3).sort()).toEqual([projects.Left, projects.Right].sort());
    });

    it('keeps both edges of a cycle, and the sort still returns every project once', async () => {
        const projects = await solution({ A: ['B'], B: ['A'], C: ['A'] });
        const all = [projects.C, projects.A, projects.B];
        const dependencies = await getProjectDependencyMap(all);
        expect(dependencies.get(normalizeProjectPath(projects.A))).toEqual(normalized(projects.B));
        expect(dependencies.get(normalizeProjectPath(projects.B))).toEqual(normalized(projects.A));
        expect(order(all, dependencies).sort()).toEqual([...all].sort());
    });

    it('gives a missing file an empty entry and drops references to it and to projects outside the set', async () => {
        const projects = await solution({ App: ['Lib', 'Gone', 'Outside'], Lib: [], Outside: [] });
        const gone = path.join(path.dirname(path.dirname(projects.App)), 'Gone', 'Gone.csproj');
        const dependencies = await getProjectDependencyMap([projects.App, projects.Lib, gone]);
        expect(Object.fromEntries(dependencies)).toEqual({
            [normalizeProjectPath(projects.App)]: normalized(projects.Lib, gone),
            [normalizeProjectPath(projects.Lib)]: [],
            [normalizeProjectPath(gone)]: [],
        });
        expect((await getProjectDependencyMap([projects.App, projects.Lib])).get(normalizeProjectPath(projects.App))).toEqual(normalized(projects.Lib));
    });

    it('drops a self-reference and treats differently spelled paths of one project as one', async () => {
        const projects = await solution({ App: ['App', 'Lib'], Lib: [] });
        const spelled = path.join(path.dirname(projects.Lib), '..', 'Lib', 'Lib.csproj');
        const dependencies = await getProjectDependencyMap([projects.App, spelled]);
        expect(dependencies.get(normalizeProjectPath(projects.App))).toEqual(normalized(projects.Lib));
        expect(dependencies.has(normalizeProjectPath(projects.Lib))).toBe(true);
        expect(dependencies.size).toBe(2);
    });

    it('reads more projects than it reads at a time, and is empty for no projects', async () => {
        const names = Array.from({ length: 60 }, (_, index) => `P${index}`);
        const projects = await solution(Object.fromEntries(names.map((name, index) => [name, index === 0 ? [] : [names[index - 1]]])));
        const dependencies = await getProjectDependencyMap(names.map(name => projects[name]));
        expect(dependencies.size).toBe(60);
        expect(dependencies.get(normalizeProjectPath(projects.P59))).toEqual(normalized(projects.P58));
        expect(dependencies.get(normalizeProjectPath(projects.P0))).toEqual([]);
        expect((await getProjectDependencyMap([])).size).toBe(0);
    });
});
