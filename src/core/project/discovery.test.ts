import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { fixture } from './__fixtures__/scratch';
import { classifyProject, findProjects, PROJECT_FILE_EXCLUDE, PROJECT_FILE_GLOB, type FileSearch } from './discovery';

const read = (...segments: string[]) => fs.readFileSync(fixture(...segments), 'utf-8');

describe('classifyProject', () => {
    it.each([
        ['an Sdk attribute on the root', 'App.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>', false, 'sdk-style'],
        ['an Sdk attribute after other attributes', 'App.csproj', '<Project DefaultTargets="Build" Sdk="Microsoft.NET.Sdk.Web">\n</Project>', false, 'sdk-style'],
        ['an <Sdk Name> element', 'App.csproj', '<Project>\n  <Sdk Name="Microsoft.NET.Sdk" />\n</Project>', false, 'sdk-style'],
        ['an <Import Sdk> element', 'App.fsproj', '<Project><Import Project="Sdk.props" Sdk="Microsoft.NET.Sdk" /></Project>', false, 'sdk-style'],
        ['a ToolsVersion attribute', 'App.csproj', '<Project ToolsVersion="15.0"></Project>', false, 'legacy'],
        ['the MSBuild 2003 namespace', 'App.csproj', '<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003"></Project>', false, 'legacy'],
        ['the C# targets import in a .csproj', 'App.csproj', '<Project><Import Project="$(MSBuildToolsPath)\\Microsoft.CSharp.targets" /></Project>', false, 'legacy'],
        ['the F# targets import in a .fsproj', 'App.FSPROJ', '<Project><Import Project="$(FSharpTargetsPath)\\Microsoft.FSharp.targets" /></Project>', false, 'legacy'],
        ['the Visual Basic targets import in a .vbproj', 'App.vbproj', "<Project><Import Project='$(MSBuildToolsPath)\\Microsoft.VisualBasic.targets' /></Project>", false, 'legacy'],
        ['the C# targets import in a .vbproj', 'App.vbproj', '<Project><Import Project="$(MSBuildToolsPath)\\Microsoft.CSharp.targets" /></Project>', false, 'unknown'],
        ['a legacy import in a file of another kind', 'App.proj', '<Project><Import Project="Microsoft.CSharp.targets" /></Project>', false, 'unknown'],
        ['a bare root', 'App.csproj', '<Project></Project>', false, 'unknown'],
        ['text that is not a project', 'App.csproj', 'hello', false, 'unknown'],
        ['a tag that only starts with Project', 'App.csproj', '<ProjectExtensions Sdk="x" />', false, 'unknown'],
        ['an sdk-style project beside a packages.config', 'App.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>', true, 'packages-config'],
        ['a legacy project beside a packages.config', 'App.csproj', '<Project ToolsVersion="14.0"></Project>', true, 'packages-config'],
    ] as const)('%s', (_name, file, xml, hasPackagesConfig, expected) => {
        expect(classifyProject(path.join('/w', file), xml, hasPackagesConfig)).toBe(expected);
    });

    it('classifies the fixtures', () => {
        expect(classifyProject(fixture('sdk', 'Sdk.csproj'), read('sdk', 'Sdk.csproj'), false)).toBe('sdk-style');
        expect(classifyProject(fixture('cpm', 'App', 'App.csproj'), read('cpm', 'App', 'App.csproj'), false)).toBe('sdk-style');
        expect(classifyProject(fixture('multitfm', 'App', 'App.csproj'), read('multitfm', 'App', 'App.csproj'), false)).toBe('sdk-style');
        expect(classifyProject(fixture('legacy', 'Legacy.csproj'), read('legacy', 'Legacy.csproj'), false)).toBe('legacy');
        expect(classifyProject(fixture('pkgconfig', 'Old.csproj'), read('pkgconfig', 'Old.csproj'), fs.existsSync(fixture('pkgconfig', 'packages.config')))).toBe('packages-config');
        // Without the packages.config beside it the same file is an ordinary legacy project.
        expect(classifyProject(fixture('pkgconfig', 'Old.csproj'), read('pkgconfig', 'Old.csproj'), false)).toBe('legacy');
    });
});

describe('findProjects', () => {
    const root = path.resolve('/ws');
    const at = (...segments: string[]) => path.join(root, ...segments);

    it('returns nothing and does not search without a workspace folder', async () => {
        const search = vi.fn<FileSearch>(async () => [at('App', 'App.csproj')]);
        expect(await findProjects(search, [])).toEqual([]);
        expect(search).not.toHaveBeenCalled();
    });

    it('searches once for all three project kinds and skips build output', async () => {
        const search = vi.fn<FileSearch>(async () => []);
        await findProjects(search, [{ name: 'ws', fsPath: root }]);
        expect(search).toHaveBeenCalledTimes(1);
        expect(search).toHaveBeenCalledWith(PROJECT_FILE_GLOB, PROJECT_FILE_EXCLUDE);
        expect(PROJECT_FILE_GLOB).toBe('**/*.{csproj,fsproj,vbproj}');
        expect(PROJECT_FILE_EXCLUDE).toContain('obj');
    });

    it('orders by name without regard to case, then by path, and drops duplicates', async () => {
        const files = [at('b', 'Zeta.csproj'), at('a', 'alpha.fsproj'), at('z', 'Beta.vbproj'), at('a', 'Beta.vbproj'), at('b', 'Zeta.csproj')];
        const projects = await findProjects(async () => files, [{ name: 'ws', fsPath: root }]);
        expect(projects.map(project => project.path)).toEqual([at('a', 'alpha.fsproj'), at('a', 'Beta.vbproj'), at('z', 'Beta.vbproj'), at('b', 'Zeta.csproj')]);
        expect(projects.map(project => project.name)).toEqual(['alpha.fsproj', 'Beta.vbproj', 'Beta.vbproj', 'Zeta.csproj']);
    });

    it('attributes a project to the deepest workspace folder that contains it', async () => {
        const outside = path.resolve('/elsewhere', 'Tool', 'Tool.csproj');
        const projects = await findProjects(async () => [at('src', 'App', 'App.csproj'), at('Lib', 'Lib.csproj'), outside], [
            { name: 'root', fsPath: root },
            { name: 'src', fsPath: at('src') },
        ]);
        expect(Object.fromEntries(projects.map(project => [project.name, project.workspaceFolder]))).toEqual({
            'App.csproj': 'src',
            'Lib.csproj': 'root',
            'Tool.csproj': undefined,
        });
    });
});
