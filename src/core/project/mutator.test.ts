import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MutationRequest, ProjectExecutionContext, SdkInfo } from '../contracts';
import type { Project } from '../../protocol/domain';
import { sdkInfoFromVersion } from '../cli';
import { AssetsReader } from './assets';
import { createScratchDir, writeTree, type ScratchDir } from './__fixtures__/scratch';
import { SDK_TOO_OLD_MESSAGE } from './context';
import { StaticProjectInspector } from './inspector';
import { DefaultProjectMutator } from './mutator';

const sdk10 = sdkInfoFromVersion('10.0.401') as SdkInfo;
const sdk8 = sdkInfoFromVersion('8.0.425') as SdkInfo;
const sdk11 = sdkInfoFromVersion('11.0.100') as SdkInfo;

const scratches: ScratchDir[] = [];
afterEach(async () => {
    await Promise.all(scratches.splice(0).map(scratch => scratch.cleanup()));
});

async function tree(files: Record<string, string>): Promise<string> {
    const scratch = await createScratchDir('mutator');
    scratches.push(scratch);
    await writeTree(scratch.dir, files);
    return scratch.dir;
}

const project = (body: string) => `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><ItemGroup>${body}</ItemGroup></Project>`;
const central = (body: string) => `<Project><PropertyGroup><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup><ItemGroup>${body}</ItemGroup></Project>`;

function context(projectPath: string, sdk: SdkInfo | 'none' = sdk10): ProjectExecutionContext {
    const built: ProjectExecutionContext = { projectPath, projectDir: path.dirname(projectPath), configFiles: [], sourceUrls: [], revision: 'r' };
    if (sdk !== 'none') {
        built.sdk = sdk;
    }
    return built;
}

function mutator(dir: string, options: { dirty?: string[]; projects?: string[] } = {}) {
    const dirty = new Set(options.dirty ?? []);
    const isDirty = vi.fn((file: string) => dirty.has(file));
    const discoverProjects = vi.fn(async (): Promise<Project[]> => (options.projects ?? []).map(file => ({ name: path.basename(file), path: file })));
    const inspector = new StaticProjectInspector({ assets: new AssetsReader(), stopDirs: [dir] });
    return { mutator: new DefaultProjectMutator({ inspector, isDirty, discoverProjects }), isDirty, discoverProjects };
}

const install: MutationRequest = { kind: 'install', packageId: 'Serilog', version: '4.1.0' };
const update: MutationRequest = { kind: 'update', packageId: 'Serilog', version: '4.1.0' };
const remove: MutationRequest = { kind: 'remove', packageId: 'Serilog' };

describe('DefaultProjectMutator.canMutate', () => {
    it('admits install, update and remove on a non-CPM project and reports isCpm false', async () => {
        const dir = await tree({ 'App/App.csproj': project('<PackageReference Include="Serilog" Version="4.0.0" />') });
        const app = path.join(dir, 'App', 'App.csproj');
        const { mutator: subject } = mutator(dir);
        for (const request of [install, update, remove, { kind: 'install' as const, packageId: 'Polly' }]) {
            await expect(subject.canMutate(context(app), request)).resolves.toEqual({ ok: true, isCpm: false });
        }
    });

    it('requires .NET SDK 10 or newer', async () => {
        const dir = await tree({ 'App/App.csproj': project('') });
        const app = path.join(dir, 'App', 'App.csproj');
        const { mutator: subject } = mutator(dir);
        for (const request of [install, update, remove]) {
            await expect(subject.canMutate(context(app, sdk8), request)).resolves.toEqual({ ok: false, error: SDK_TOO_OLD_MESSAGE });
        }
    });

    it('refuses when the SDK cannot be detected', async () => {
        const dir = await tree({ 'App/App.csproj': project('') });
        const app = path.join(dir, 'App', 'App.csproj');
        await expect(mutator(dir).mutator.canMutate(context(app, 'none'), remove)).resolves.toEqual({ ok: false, error: 'could not detect the .NET SDK for this project' });
    });

    it('refuses any edit while the project file has unsaved changes', async () => {
        const dir = await tree({ 'App/App.csproj': project('<PackageReference Include="Serilog" Version="4.0.0" />') });
        const app = path.join(dir, 'App', 'App.csproj');
        const { mutator: subject } = mutator(dir, { dirty: [app] });
        for (const request of [install, update, remove]) {
            await expect(subject.canMutate(context(app), request)).resolves.toEqual({ ok: false, error: 'App.csproj has unsaved changes in the editor; save or close it first' });
        }
    });

    it('cpm: install and update are admitted with the version on a verified SDK and report isCpm true', async () => {
        const dir = await tree({
            'Directory.Packages.props': central('<PackageVersion Include="Serilog" Version="4.0.0" />'),
            'App/App.csproj': project('<PackageReference Include="Serilog" />'),
        });
        const app = path.join(dir, 'App', 'App.csproj');
        const { mutator: subject } = mutator(dir);
        await expect(subject.canMutate(context(app), update)).resolves.toEqual({ ok: true, isCpm: true });
        // A package without a central entry yet: `package add` creates it (probe row `add-absent`).
        await expect(subject.canMutate(context(app), { kind: 'install', packageId: 'Polly', version: '8.4.2' })).resolves.toEqual({ ok: true, isCpm: true });
    });

    it('cpm: unverified cases stay read-only', async () => {
        const dir = await tree({
            'Directory.Packages.props': central('<PackageVersion Include="Serilog" Version="4.0.0" />'),
            'App/App.csproj': project('<PackageReference Include="Serilog" />'),
        });
        const app = path.join(dir, 'App', 'App.csproj');
        const { mutator: subject } = mutator(dir);
        const documented: SdkInfo = { ...sdk10, cpmAwareAddProvenance: 'documented' };
        for (const sdk of [sdk11, documented]) {
            for (const request of [install, update]) {
                await expect(subject.canMutate(context(app, sdk), request)).resolves.toEqual({ ok: false, error: `Central Package Management edits are not verified for .NET SDK ${sdk.version}` });
            }
            await expect(subject.canMutate(context(app, sdk), remove)).resolves.toEqual({ ok: true, isCpm: true });
        }
    });

    it('cpm: remove is admitted whatever the provenance and whether the props file is dirty', async () => {
        const dir = await tree({
            'Directory.Packages.props': central('<PackageVersion Include="Serilog" Version="4.0.0" />'),
            'App/App.csproj': project('<PackageReference Include="Serilog" />'),
        });
        const app = path.join(dir, 'App', 'App.csproj');
        const { mutator: subject } = mutator(dir, { dirty: [path.join(dir, 'Directory.Packages.props')] });
        await expect(subject.canMutate(context(app, sdk11), remove)).resolves.toEqual({ ok: true, isCpm: true });
        await expect(subject.canMutate(context(app), remove)).resolves.toEqual({ ok: true, isCpm: true });
    });

    it('cpm: refuses install and update while Directory.Packages.props has unsaved changes', async () => {
        const dir = await tree({
            'Directory.Packages.props': central('<PackageVersion Include="Serilog" Version="4.0.0" />'),
            'App/App.csproj': project('<PackageReference Include="Serilog" />'),
        });
        const app = path.join(dir, 'App', 'App.csproj');
        const { mutator: subject } = mutator(dir, { dirty: [path.join(dir, 'Directory.Packages.props')] });
        for (const request of [install, update]) {
            await expect(subject.canMutate(context(app), request)).resolves.toEqual({ ok: false, error: 'Directory.Packages.props has unsaved changes in the editor; save or close it first' });
        }
    });

    it('cpm: refuses install and update without a version', async () => {
        const dir = await tree({
            'Directory.Packages.props': central('<PackageVersion Include="Serilog" Version="4.0.0" />'),
            'App/App.csproj': project('<PackageReference Include="Serilog" />'),
        });
        const app = path.join(dir, 'App', 'App.csproj');
        const { mutator: subject } = mutator(dir);
        for (const kind of ['install', 'update'] as const) {
            await expect(subject.canMutate(context(app), { kind, packageId: 'Serilog' })).resolves.toEqual({ ok: false, error: 'a Central Package Management edit names the version it writes' });
        }
    });

    it('refuses install and update of a row with a VersionOverride or an unresolved version', async () => {
        const dir = await tree({
            'Directory.Packages.props': central('<PackageVersion Include="Serilog" Version="4.0.0" /><PackageVersion Include="Polly" Version="8.0.0" Condition="\'$(Configuration)\' == \'Debug\'" />'),
            'App/App.csproj': project('<PackageReference Include="Serilog" VersionOverride="3.1.1" /><PackageReference Include="Polly" />'),
            'Plain/Plain.csproj': project('<PackageReference Include="Moq" Version="$(MoqVersion)" />'),
            'Plain/Directory.Packages.props': '<Project />',
        });
        const app = path.join(dir, 'App', 'App.csproj');
        const plain = path.join(dir, 'Plain', 'Plain.csproj');
        const { mutator: subject } = mutator(dir);
        await expect(subject.canMutate(context(app), update)).resolves.toEqual({ ok: false, error: 'Serilog has a VersionOverride in the project; what dotnet package add changes there has not been probed' });
        await expect(subject.canMutate(context(app), { kind: 'update', packageId: 'polly', version: '8.4.2' })).resolves.toEqual({ ok: false, error: 'polly could not be resolved in the project file; edit it by hand' });
        await expect(subject.canMutate(context(plain), { kind: 'install', packageId: 'Moq', version: '4.20.0' })).resolves.toEqual({ ok: false, error: 'Moq could not be resolved in the project file; edit it by hand' });
        // A remove of the same rows is admitted.
        await expect(subject.canMutate(context(app), remove)).resolves.toEqual({ ok: true, isCpm: true });
    });

    it('refuses every edit of a project the inspector reports unsupported', async () => {
        const dir = await tree({ 'App/App.csproj': '<Project ToolsVersion="15.0"><ItemGroup><Reference Include="System" /></ItemGroup></Project>' });
        const app = path.join(dir, 'App', 'App.csproj');
        const { mutator: subject } = mutator(dir);
        for (const request of [install, update, remove]) {
            await expect(subject.canMutate(context(app), request)).resolves.toEqual({ ok: false, error: 'the project could not be inspected: only SDK-style projects are supported' });
        }
    });

    it('isDirty is asked with the project path and the props path the inspection reported', async () => {
        const dir = await tree({
            'Directory.Packages.props': central('<PackageVersion Include="Serilog" Version="4.0.0" />'),
            'App/App.csproj': project('<PackageReference Include="Serilog" />'),
        });
        const app = path.join(dir, 'App', 'App.csproj');
        const { mutator: subject, isDirty } = mutator(dir);
        await subject.canMutate(context(app), update);
        expect(isDirty.mock.calls).toEqual([[app], [path.join(dir, 'Directory.Packages.props')]]);
    });
});

describe('DefaultProjectMutator.previewCpmImpact', () => {
    async function workspace() {
        const dir = await tree({
            'Directory.Packages.props': central('<PackageVersion Include="X" Version="1.0.0" /><PackageVersion Include="Y" Version="2.0.0" />'),
            'A/A.csproj': project('<PackageReference Include="X" />'),
            'B/B.csproj': project('<PackageReference Include="X" VersionOverride="1.5.0" />'),
            'C/C.csproj': project('<PackageReference Include="Y" />'),
            'Nested/Directory.Packages.props': central('<PackageVersion Include="X" Version="9.0.0" />'),
            'Nested/D/D.csproj': project('<PackageReference Include="X" />'),
            'E/E.csproj': project('<PackageReference Include="X" />'),
        });
        const file = (...segments: string[]) => path.join(dir, ...segments);
        return { dir, file, projects: [file('A', 'A.csproj'), file('B', 'B.csproj'), file('C', 'C.csproj'), file('Nested', 'D', 'D.csproj'), file('E', 'E.csproj')] };
    }

    it('previewCpmImpact: every project importing the props file that references the package without an override, with the central version', async () => {
        const { dir, file, projects } = await workspace();
        const { mutator: subject } = mutator(dir, { projects });
        const expected = { centralPropsPath: file('Directory.Packages.props'), packageId: 'X', fromVersion: '1.0.0', toVersion: '1.1.0', affectedProjects: [file('A', 'A.csproj'), file('E', 'E.csproj')] };
        await expect(subject.previewCpmImpact(context(file('A', 'A.csproj')), 'X', '1.1.0')).resolves.toEqual(expected);
        await expect(subject.previewCpmImpact(context(file('E', 'E.csproj')), 'X', '1.1.0')).resolves.toEqual(expected);
    });

    it('previewCpmImpact: undefined for a non-CPM project and for a package without a central entry', async () => {
        const { dir, file, projects } = await workspace();
        const plain = await tree({ 'P/P.csproj': project('<PackageReference Include="X" Version="1.0.0" />') });
        const { mutator: subject, discoverProjects } = mutator(dir, { projects });
        await expect(subject.previewCpmImpact(context(file('A', 'A.csproj')), 'Absent', '1.0.0')).resolves.toBeUndefined();
        await expect(mutator(plain).mutator.previewCpmImpact(context(path.join(plain, 'P', 'P.csproj')), 'X', '1.1.0')).resolves.toBeUndefined();
        expect(discoverProjects).not.toHaveBeenCalled();
    });

    it('previewCpmImpact: compares project and props paths normalized', async () => {
        const { dir, file } = await workspace();
        const spelled = `${path.join(dir, 'A')}${path.sep}.${path.sep}A.csproj`;
        const { mutator: subject } = mutator(dir, { projects: [spelled, file('A', 'A.csproj'), file('E', 'E.csproj')] });
        const preview = await subject.previewCpmImpact(context(file('A', 'A.csproj')), 'x', '1.1.0');
        expect(preview?.affectedProjects).toEqual([spelled, file('E', 'E.csproj')]);
        expect(fs.existsSync(spelled)).toBe(true);
    });
});
