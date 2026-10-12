import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { InstalledPackage, InstalledResult } from '../../protocol/domain';
import { createScratchDir, fixture, writeTree, type ScratchDir } from './__fixtures__/scratch';
import { AssetsReader, StaticProjectInspector, UNSUPPORTED_MESSAGES } from './index';

const inspect = (stopDir: string, ...segments: string[]) => new StaticProjectInspector({ assets: new AssetsReader(), stopDirs: [stopDir] }).inspect(path.join(stopDir, ...segments));
const find = (result: InstalledResult, id: string): InstalledPackage[] => result.packages.filter(pkg => pkg.id === id);
const only = (result: InstalledResult, id: string): InstalledPackage => {
    const [pkg, ...rest] = find(result, id);
    expect(rest).toEqual([]);
    expect(pkg).toBeDefined();
    return pkg;
};

const scratches: ScratchDir[] = [];
/** Writes a project tree into a scratch directory and inspects `App/App.csproj` with that directory as the stop. */
async function inspectTree(files: Record<string, string>, project = path.join('App', 'App.csproj')): Promise<InstalledResult> {
    const scratch = await createScratchDir('inspector');
    scratches.push(scratch);
    await writeTree(scratch.dir, files);
    return inspect(scratch.dir, project);
}
const sdkProject = (body: string, frameworks = '<TargetFramework>net8.0</TargetFramework>') => `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>${frameworks}</PropertyGroup>${body}</Project>`;
const centralProps = (body: string, enabled = 'true') => `<Project><PropertyGroup><ManagePackageVersionsCentrally>${enabled}</ManagePackageVersionsCentrally></PropertyGroup>${body}</Project>`;
const appFile = path.join('App', 'App.csproj');

afterEach(async () => {
    await Promise.all(scratches.splice(0).map(scratch => scratch.cleanup()));
});

describe('StaticProjectInspector on the CPM fixture', () => {
    const cpm = fixture('cpm');
    const cpmProps = fixture('cpm', 'Directory.Packages.props');

    it('cpm: versionless reference resolves central version', async () => {
        const result = await inspect(cpm, 'App', 'App.csproj');
        expect(result).toMatchObject({ projectPath: fixture('cpm', 'App', 'App.csproj'), fidelity: 'provisional', isCpm: true, centralPropsPath: cpmProps });
        expect(result.unsupported).toBeUndefined();
        expect(only(result, 'Newtonsoft.Json')).toEqual({ id: 'Newtonsoft.Json', version: '13.0.3', versionType: 'standard', declaration: 'central', definedIn: cpmProps, resolvedVersion: '13.0.3' });
        expect(only(result, 'Serilog')).toMatchObject({ version: '4.0.0', declaration: 'central', resolvedVersion: '4.0.0' });
        // A floating central version, and nothing restored for it in obj/.
        expect(only(result, 'Humanizer')).toEqual({ id: 'Humanizer', version: '2.*', versionType: 'floating', floatingPrefix: '2', isAlwaysLatest: false, declaration: 'central', definedIn: cpmProps });
        expect(result.packages.map(pkg => pkg.id)).toEqual(['Newtonsoft.Json', 'Serilog', 'Humanizer', 'Not.Central', 'Pinned']);
    });

    it('cpm: exact central pin surfaces as versionType exact', async () => {
        const result = await inspect(cpm, 'App', 'App.csproj');
        expect(only(result, 'Pinned')).toEqual({ id: 'Pinned', version: '[1.0.0]', versionType: 'exact', declaration: 'central', definedIn: cpmProps });
    });

    it('cpm: missing central entry is unresolved', async () => {
        const result = await inspect(cpm, 'App', 'App.csproj');
        expect(only(result, 'Not.Central')).toEqual({ id: 'Not.Central', version: '', versionType: 'unresolved', declaration: 'unresolved' });
    });

    it('cpm: override wins and is marked central-override', async () => {
        const result = await inspect(cpm, 'Lib', 'Lib.csproj');
        expect(result.isCpm).toBe(true);
        expect(only(result, 'Serilog')).toEqual({ id: 'Serilog', version: '3.1.1', versionType: 'standard', declaration: 'central-override' });
        expect(only(result, 'Newtonsoft.Json')).toMatchObject({ version: '13.0.3', declaration: 'central', definedIn: cpmProps });
        // A reference with its own Version in a CPM project is reported as written.
        expect(only(result, 'xunit')).toEqual({ id: 'xunit', version: '2.8.0', versionType: 'standard', declaration: 'project' });
    });

    it('uses the nearest Directory.Packages.props only', async () => {
        const nested = fixture('cpm', 'Nested', 'Directory.Packages.props');
        const result = await inspect(cpm, 'Nested', 'Inner', 'Inner.csproj');
        expect(result).toMatchObject({ isCpm: true, centralPropsPath: nested });
        expect(only(result, 'Newtonsoft.Json')).toMatchObject({ version: '12.0.1', declaration: 'central', definedIn: nested });
        // Serilog is in the outer props file, which MSBuild does not import.
        expect(only(result, 'Serilog')).toEqual({ id: 'Serilog', version: '', versionType: 'unresolved', declaration: 'unresolved' });
    });
});

describe('StaticProjectInspector on the other fixtures', () => {
    it('props: Directory.Build.props reference is declared props', async () => {
        const buildProps = fixture('props', 'Directory.Build.props');
        const result = await inspect(fixture('props'), 'Proj', 'Proj.csproj');
        expect(result.isCpm).toBe(false);
        expect('centralPropsPath' in result).toBe(false);
        expect(result.packages).toEqual([
            { id: 'StyleCop.Analyzers', version: '1.2.0-beta.556', versionType: 'standard', declaration: 'props', definedIn: buildProps },
            // Declared in the props file, version written by an Update in the project.
            { id: 'Microsoft.SourceLink.GitHub', version: '8.0.1', versionType: 'standard', declaration: 'project', definedIn: buildProps },
            { id: 'Newtonsoft.Json', version: '13.0.3', versionType: 'standard', declaration: 'project' },
        ]);
    });

    it('tfm: condition captured and intersected', async () => {
        const result = await inspect(fixture('sdk'), 'Sdk.csproj');
        expect(result.packages.map(pkg => [pkg.id, pkg.version, pkg.declaration, pkg.targetFrameworks])).toEqual([
            ['Newtonsoft.Json', '13.0.1', 'project', undefined],
            ['Microsoft.Extensions.Logging', '8.0.0', 'project', undefined],
            ['Serilog', '', 'unresolved', undefined],
            ['FluentValidation', '[11.0.0, 12.0.0)', 'project', undefined],
            ['Humanizer', '2.*', 'project', undefined],
            ['Microsoft.NETCore.App', '2.1.0', 'project', undefined],
            ['Lower.Case', '1.2.3', 'project', undefined],
            ['System.Text.Json', '8.0.5', 'project', ['net6.0']],
            // In the net6.0 group and in the net8.0 group: every declared framework, so no limit.
            ['Polly', '8.0.0', 'project', undefined],
            ['System.Text.Json', '9.0.0', 'project', ['net8.0']],
            // Guarded by $(Configuration): the reference itself is uncertain.
            ['BenchmarkDotNet', '', 'unresolved', undefined],
        ]);
        // net8.0 group and a net6.0 item condition exclude each other.
        expect(find(result, 'Microsoft.Bcl.AsyncInterfaces')).toEqual([]);
        expect(find(result, 'Ghost.Package')).toEqual([]);
        expect(find(result, 'CommentedOut')).toEqual([]);
        expect(only(result, 'Serilog').versionType).toBe('unresolved');
        expect(only(result, 'FluentValidation').versionType).toBe('range');
        expect(only(result, 'Microsoft.NETCore.App').isImplicit).toBe(true);
        expect(only(result, 'Newtonsoft.Json').isImplicit).toBeUndefined();
        expect(result.packages.every(pkg => pkg.resolvedVersion === undefined && pkg.definedIn === undefined)).toBe(true);
    });

    it('reads the multi-target CPM project', async () => {
        const root = fixture('multitfm');
        const result = await inspect(root, 'App', 'App.csproj');
        expect(result).toMatchObject({ isCpm: true, centralPropsPath: path.join(root, 'Directory.Packages.props') });
        expect(result.packages).toEqual([
            { id: 'StyleCop.Analyzers', version: '1.2.0-beta.556', versionType: 'standard', declaration: 'props', definedIn: path.join(root, 'Directory.Build.props') },
            { id: 'Newtonsoft.Json', version: '13.0.3', versionType: 'standard', declaration: 'central', definedIn: path.join(root, 'Directory.Packages.props') },
            { id: 'Serilog', version: '3.1.1', versionType: 'standard', declaration: 'central-override' },
            { id: 'System.Text.Json', version: '8.0.5', versionType: 'standard', declaration: 'project', targetFrameworks: ['netstandard2.0'] },
        ]);
    });

    it('unsupported: packages.config', async () => {
        const result = await inspect(fixture('pkgconfig'), 'Old.csproj');
        expect(result).toEqual({ projectPath: fixture('pkgconfig', 'Old.csproj'), packages: [], fidelity: 'provisional', isCpm: false, unsupported: { reason: 'packages-config', message: 'packages.config projects are not supported' } });
    });

    it('unsupported: non-sdk-style', async () => {
        const result = await inspect(fixture('legacy'), 'Legacy.csproj');
        expect(result).toEqual({ projectPath: fixture('legacy', 'Legacy.csproj'), packages: [], fidelity: 'provisional', isCpm: false, unsupported: { reason: 'non-sdk-style', message: 'only SDK-style projects are supported' } });
    });
});

describe('StaticProjectInspector: unsupported projects', () => {
    it('unsupported: malformed central props is parse-failed, not isCpm false', async () => {
        const result = await inspectTree({
            'Directory.Packages.props': centralProps('<ItemGroup><PackageVersion Include="A" Version="1.0.0">'),
            [appFile]: sdkProject('<ItemGroup><PackageReference Include="A" /></ItemGroup>'),
        });
        expect(result.unsupported).toEqual({ reason: 'parse-failed', message: 'the project file or an imported props file could not be read or parsed' });
        expect(result.packages).toEqual([]);
        expect(result.isCpm).toBe(false);
        expect('centralPropsPath' in result).toBe(false);
    });

    it('reports a malformed project file and a malformed Directory.Build.props as parse-failed', async () => {
        const project = await inspectTree({ [appFile]: '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup></Project>' });
        expect(project.unsupported?.reason).toBe('parse-failed');
        const props = await inspectTree({ 'Directory.Build.props': '<Project><ItemGroup>', [appFile]: sdkProject('') });
        expect(props.unsupported?.reason).toBe('parse-failed');
        expect(props.unsupported?.message).not.toContain(path.sep);
    });

    it('reports a missing project file as not-found and never rejects', async () => {
        const result = await inspectTree({ [appFile]: sdkProject('') }, path.join('App', 'Missing.csproj'));
        expect(result.unsupported).toEqual({ reason: 'not-found', message: 'the project file was not found' });
        const inside = await inspectTree({ [appFile]: sdkProject('') }, path.join('App', 'App.csproj', 'Nested.csproj'));
        expect(inside.unsupported?.reason).toBe('not-found');
        // A directory where the project file should be.
        const directory = await inspectTree({ [path.join('App', 'App.csproj', 'x.txt')]: '' });
        expect(directory.unsupported?.reason).toBe('parse-failed');
    });

    it('has one message per reason', () => {
        expect(UNSUPPORTED_MESSAGES).toEqual({
            'packages-config': 'packages.config projects are not supported',
            'non-sdk-style': 'only SDK-style projects are supported',
            'parse-failed': 'the project file or an imported props file could not be read or parsed',
            'not-found': 'the project file was not found',
        });
    });
});

describe('StaticProjectInspector: Central Package Management', () => {
    it('a conditioned central entry is unresolved', async () => {
        const result = await inspectTree({
            'Directory.Packages.props': centralProps(`<ItemGroup>
                <PackageVersion Include="Guarded" Version="1.0.0" Condition="'$(TargetFramework)' == 'net8.0'" />
                <PackageVersion Include="FromProperty" Version="$(SharedVersion)" />
                <PackageVersion Include="Plain" Version="2.0.0" />
            </ItemGroup>`),
            [appFile]: sdkProject('<ItemGroup><PackageReference Include="Guarded" /><PackageReference Include="FromProperty" /><PackageReference Include="plain" /></ItemGroup>'),
        });
        const props = path.join(path.dirname(path.dirname(result.projectPath)), 'Directory.Packages.props');
        expect(only(result, 'Guarded')).toEqual({ id: 'Guarded', version: '', versionType: 'unresolved', declaration: 'unresolved', definedIn: props });
        expect(only(result, 'FromProperty')).toEqual({ id: 'FromProperty', version: '', versionType: 'unresolved', declaration: 'unresolved', definedIn: props });
        // Package ids compare without regard to case; the id is reported as the project writes it.
        expect(only(result, 'plain')).toEqual({ id: 'plain', version: '2.0.0', versionType: 'standard', declaration: 'central', definedIn: props });
    });

    it('is not CPM when the property is false or unset, although the props file exists', async () => {
        for (const props of [centralProps('<ItemGroup><PackageVersion Include="A" Version="1.0.0" /></ItemGroup>', 'false'), '<Project><ItemGroup><PackageVersion Include="A" Version="1.0.0" /></ItemGroup></Project>']) {
            const result = await inspectTree({ 'Directory.Packages.props': props, [appFile]: sdkProject('<ItemGroup><PackageReference Include="A" /><PackageReference Include="B" VersionOverride="9.0.0" Version="1.0.0" /></ItemGroup>') });
            expect(result.isCpm).toBe(false);
            expect('centralPropsPath' in result).toBe(false);
            expect(only(result, 'A')).toEqual({ id: 'A', version: '', versionType: 'unresolved', declaration: 'unresolved' });
            // Outside CPM a VersionOverride means nothing; the Version counts.
            expect(only(result, 'B')).toMatchObject({ version: '1.0.0', declaration: 'project' });
        }
    });

    it('lets the project switch CPM off and Directory.Build.props switch it on, the last definition winning', async () => {
        const entries = '<ItemGroup><PackageVersion Include="A" Version="1.0.0" /></ItemGroup>';
        const off = await inspectTree({ 'Directory.Packages.props': centralProps(entries), [appFile]: sdkProject('<ItemGroup><PackageReference Include="A" /></ItemGroup>', '<TargetFramework>net8.0</TargetFramework><ManagePackageVersionsCentrally>false</ManagePackageVersionsCentrally>') });
        expect(off.isCpm).toBe(false);
        const on = await inspectTree({
            'Directory.Build.props': '<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup></Project>',
            'Directory.Packages.props': `<Project>${entries}</Project>`,
            [appFile]: sdkProject('<ItemGroup><PackageReference Include="A" /></ItemGroup>'),
        });
        expect(on.isCpm).toBe(true);
        expect(only(on, 'A')).toMatchObject({ version: '1.0.0', declaration: 'central' });
    });

    it('reports an override as unresolved when overrides are switched off', async () => {
        const result = await inspectTree({
            'Directory.Packages.props': '<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally><CentralPackageVersionOverrideEnabled>false</CentralPackageVersionOverrideEnabled></PropertyGroup><ItemGroup><PackageVersion Include="A" Version="1.0.0" /></ItemGroup></Project>',
            [appFile]: sdkProject('<ItemGroup><PackageReference Include="A" VersionOverride="2.0.0" /></ItemGroup>'),
        });
        expect(only(result, 'A')).toEqual({ id: 'A', version: '', versionType: 'unresolved', declaration: 'unresolved' });
    });

    it('names Directory.Build.props for a versionless reference declared there', async () => {
        const result = await inspectTree({
            'Directory.Build.props': '<Project><ItemGroup><PackageReference Include="Analyzers" PrivateAssets="all" /><PackageReference Include="Unknown" /></ItemGroup></Project>',
            'Directory.Packages.props': centralProps('<ItemGroup><PackageVersion Include="Analyzers" Version="1.0.0" /></ItemGroup>'),
            [appFile]: sdkProject(''),
        });
        const buildProps = path.join(path.dirname(path.dirname(result.projectPath)), 'Directory.Build.props');
        expect(only(result, 'Analyzers')).toEqual({ id: 'Analyzers', version: '1.0.0', versionType: 'standard', declaration: 'central', definedIn: buildProps });
        expect(only(result, 'Unknown')).toEqual({ id: 'Unknown', version: '', versionType: 'unresolved', declaration: 'unresolved', definedIn: buildProps });
    });
});

describe('StaticProjectInspector: items, updates and frameworks', () => {
    const multi = '<TargetFrameworks>net8.0; net6.0</TargetFrameworks>';
    const group = (framework: string, items: string) => `<ItemGroup Condition="'$(TargetFramework)' == '${framework}'">${items}</ItemGroup>`;

    it('splits an Include list and skips what is not a package id', async () => {
        const result = await inspectTree({ [appFile]: sdkProject('<ItemGroup><PackageReference Include=" A ;B;" Version="1.0.0" /><PackageReference Include="$(Extra)" Version="1.0.0" /><PackageReference Include="Glob.*" Version="1.0.0" /><PackageReference Include="@(More)" Version="1.0.0" /><PackageReference Version="1.0.0" /></ItemGroup>') });
        expect(result.packages.map(pkg => [pkg.id, pkg.version])).toEqual([['A', '1.0.0'], ['B', '1.0.0']]);
    });

    it('keeps a version text that is not a version, and treats an empty one as none', async () => {
        const result = await inspectTree({ [appFile]: sdkProject('<ItemGroup><PackageReference Include="Odd" Version="abc" /><PackageReference Include="Empty" Version=" " /></ItemGroup>') });
        expect(only(result, 'Odd')).toEqual({ id: 'Odd', version: 'abc', versionType: 'unresolved', declaration: 'project' });
        expect(only(result, 'Empty')).toEqual({ id: 'Empty', version: '', versionType: 'unresolved', declaration: 'unresolved' });
    });

    it('marks any condition other than a plain framework test as unresolved, keeping a captured framework', async () => {
        const result = await inspectTree({
            [appFile]: sdkProject(`
                <ItemGroup Condition="'$(TargetFramework)' != 'net6.0'"><PackageReference Include="NotEquals" Version="1.0.0" /></ItemGroup>
                <ItemGroup Condition="'net8.0' == '$(TargetFramework)'"><PackageReference Include="Reversed" Version="1.0.0" /></ItemGroup>
                <ItemGroup><PackageReference Include="OrCondition" Version="1.0.0" Condition="'$(TargetFramework)' == 'net8.0' Or '$(TargetFramework)' == 'net6.0'" /></ItemGroup>
                ${group('net6.0', `<PackageReference Include="Both" Version="1.0.0" Condition="'$(Configuration)' == 'Debug'" />`)}
                ${group('NET6.0', `<PackageReference Include="SameFramework" Version="1.0.0" Condition=" '$(TargetFramework)' == 'net6.0' " />`)}`, multi),
        });
        expect(result.packages.map(pkg => [pkg.id, pkg.version, pkg.declaration, pkg.targetFrameworks])).toEqual([
            ['NotEquals', '', 'unresolved', undefined],
            ['Reversed', '', 'unresolved', undefined],
            ['OrCondition', '', 'unresolved', undefined],
            ['Both', '', 'unresolved', ['net6.0']],
            ['SameFramework', '1.0.0', 'project', ['NET6.0']],
        ]);
    });

    it('applies a conditioned Update that covers the reference, ignores a disjoint one and gives up on a partial one', async () => {
        const result = await inspectTree({
            [appFile]: sdkProject(`
                <ItemGroup>
                    <PackageReference Include="Everywhere" Version="1.0.0" />
                    <PackageReference Include="Unconditioned" Version="1.0.0" />
                    <PackageReference Include="Configured" Version="1.0.0" />
                </ItemGroup>
                ${group('net6.0', '<PackageReference Include="Covered" Version="1.0.0" /><PackageReference Include="Disjoint" Version="1.0.0" />')}
                ${group('net6.0', '<PackageReference Update="Covered" Version="2.0.0" /><PackageReference Update="Everywhere" Version="2.0.0" />')}
                ${group('net8.0', '<PackageReference Update="Disjoint" Version="2.0.0" />')}
                <ItemGroup>
                    <PackageReference Update="UNCONDITIONED" Version="2.0.0" IsImplicitlyDefined="true" />
                    <PackageReference Update="Configured" Version="2.0.0" Condition="'$(Configuration)' == 'Release'" />
                    <PackageReference Update="Later" Version="2.0.0" />
                    <PackageReference Include="Later" Version="1.0.0" />
                </ItemGroup>`, multi),
        });
        expect(result.packages.map(pkg => [pkg.id, pkg.version, pkg.declaration, pkg.targetFrameworks])).toEqual([
            // Applies to net6.0 only, the reference to both frameworks: undecidable here.
            ['Everywhere', '', 'unresolved', undefined],
            ['Unconditioned', '2.0.0', 'project', undefined],
            ['Configured', '', 'unresolved', undefined],
            ['Covered', '2.0.0', 'project', ['net6.0']],
            ['Disjoint', '1.0.0', 'project', ['net6.0']],
            // An Update before the Include of the same id changes nothing.
            ['Later', '1.0.0', 'project', undefined],
        ]);
        expect(only(result, 'Unconditioned').isImplicit).toBe(true);
    });

    it('keeps captured frameworks as written when the declared frameworks are unknown', async () => {
        const items = `${group('net8.0', '<PackageReference Include="A" Version="1.0.0" />')}${group('net8.0', '<PackageReference Update="A" Version="2.0.0" />')}<ItemGroup><PackageReference Include="B" Version="1.0.0" /></ItemGroup>${group('net8.0', '<PackageReference Update="B" Version="2.0.0" />')}`;
        const unknown = await inspectTree({ [appFile]: sdkProject(items, '<TargetFrameworks>$(Frameworks)</TargetFrameworks>') });
        expect(unknown.packages.map(pkg => [pkg.id, pkg.version, pkg.declaration, pkg.targetFrameworks])).toEqual([
            ['A', '2.0.0', 'project', ['net8.0']],
            // Which frameworks B applies to is unknown, so whether the update covers it is too.
            ['B', '', 'unresolved', undefined],
        ]);
        // Declared in Directory.Build.props instead of the project: one framework, so the limit says nothing.
        const fromProps = await inspectTree({ 'Directory.Build.props': '<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>', [appFile]: `<Project Sdk="Microsoft.NET.Sdk">${items}</Project>` });
        expect(fromProps.packages.map(pkg => [pkg.id, pkg.version, pkg.targetFrameworks])).toEqual([['A', '2.0.0', undefined], ['B', '2.0.0', undefined]]);
    });

    it('takes the resolved version of the row\'s framework, else of any framework, else of the lock file', async () => {
        const assets = JSON.stringify({
            version: 3,
            targets: { 'net8.0': { 'Split/9.0.0': { type: 'package' }, 'Shared/1.0.0': { type: 'package' } }, 'net6.0': { 'Split/8.0.5': { type: 'package' }, 'Shared/1.0.0': { type: 'package' }, 'Old.Only/6.0.0': { type: 'package' } } },
            libraries: { 'Split/9.0.0': { type: 'package' }, 'Split/8.0.5': { type: 'package' }, 'Shared/1.0.0': { type: 'package' }, 'Old.Only/6.0.0': { type: 'package' } },
        });
        const lock = JSON.stringify({ version: 1, dependencies: { 'net8.0': { Locked: { type: 'Direct', resolved: '3.2.1' } } } });
        const result = await inspectTree({
            [path.join('App', 'obj', 'project.assets.json')]: assets,
            [path.join('App', 'packages.lock.json')]: lock,
            [appFile]: sdkProject(`
                <ItemGroup><PackageReference Include="Shared" Version="1.*" /><PackageReference Include="Old.Only" Version="6.0.0" /><PackageReference Include="Locked" Version="3.*" /><PackageReference Include="Nowhere" Version="1.0.0" /></ItemGroup>
                ${group('net6.0', '<PackageReference Include="Split" Version="8.0.5" />')}
                ${group('net8.0', '<PackageReference Include="Split" Version="9.0.0" />')}`, multi),
        });
        expect(result.packages.map(pkg => [pkg.id, pkg.version, pkg.targetFrameworks, pkg.resolvedVersion])).toEqual([
            ['Shared', '1.*', undefined, '1.0.0'],
            // Not restored for the first declared framework, net8.0: taken from the libraries.
            ['Old.Only', '6.0.0', undefined, '6.0.0'],
            ['Locked', '3.*', undefined, '3.2.1'],
            ['Nowhere', '1.0.0', undefined, undefined],
            ['Split', '8.0.5', ['net6.0'], '8.0.5'],
            ['Split', '9.0.0', ['net8.0'], '9.0.0'],
        ]);
    });
});
