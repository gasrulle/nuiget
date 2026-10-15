import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DotnetResult, DotnetRunOptions, DotnetRunner, Logger, SdkInfo, SourceProvider } from '../contracts';
import type { NuGetSource } from '../../protocol/domain';
import { DefaultDotnetRunner, sdkInfoFromVersion } from '../cli';
import { findUp } from '../util/fs';
import { createScratchDir, fixture, writeTree, type ScratchDir } from './__fixtures__/scratch';
import { ProjectContextProvider, SDK_TOO_OLD_MESSAGE } from './context';

const sdk10 = sdkInfoFromVersion('10.0.401')!;

interface FakeDotnet extends DotnetRunner {
    calls: Array<{ args: string[]; options: DotnetRunOptions }>;
}

/**
 * A stand-in for `dotnet`. Like the real one it takes the SDK from the nearest `global.json` (below
 * the fixtures root) and otherwise answers 10.0.401; `nuget config paths` prints `configPaths`.
 */
function fakeDotnet(configPaths: string | ((cwd: string) => Partial<DotnetResult> | Promise<Partial<DotnetResult>>) = '', sdkVersion?: DotnetRunner['sdkVersion']): FakeDotnet {
    const calls: FakeDotnet['calls'] = [];
    return {
        calls,
        async run(args, options) {
            calls.push({ args, options });
            const partial = typeof configPaths === 'string' ? { stdout: configPaths } : await configPaths(options.cwd);
            return { exitCode: 0, stdout: '', stderr: '', durationMs: 1, argv: ['dotnet', ...args], ...partial };
        },
        sdkVersion: sdkVersion ?? (async (cwd: string): Promise<SdkInfo | undefined> => {
            const globalJson = await findUp(cwd, ['global.json'], fixture());
            if (globalJson === undefined) {
                return sdk10;
            }
            const pinned = (JSON.parse(await fs.promises.readFile(globalJson, 'utf-8')) as { sdk?: { version?: string } }).sdk?.version;
            return pinned === undefined ? sdk10 : sdkInfoFromVersion(pinned);
        }),
        clearSdkCache() { /* no-op */ },
    };
}

function fakeSources(sources: NuGetSource[] | Error = []): SourceProvider & { listSources: ReturnType<typeof vi.fn<SourceProvider['listSources']>> } {
    const unused = async () => ({ ok: false as const, error: 'not used' });
    return {
        listSources: vi.fn<SourceProvider['listSources']>(async () => {
            if (sources instanceof Error) {
                throw sources;
            }
            return sources;
        }),
        configFiles: () => [],
        add: unused,
        remove: unused,
        enable: unused,
        disable: unused,
        invalidate: () => undefined,
    };
}

function fakeLogger() {
    return {
        trace: vi.fn<Logger['trace']>(),
        debug: vi.fn<Logger['debug']>(),
        info: vi.fn<Logger['info']>(),
        warn: vi.fn<Logger['warn']>(),
        error: vi.fn<Logger['error']>(),
    } satisfies Logger;
}

const scratches: ScratchDir[] = [];
async function scratchProject(files: Record<string, string> = {}): Promise<{ dir: string; project: string }> {
    const scratch = await createScratchDir('context');
    scratches.push(scratch);
    await writeTree(scratch.dir, { [path.join('App', 'App.csproj')]: '<Project Sdk="Microsoft.NET.Sdk" />', ...files });
    return { dir: scratch.dir, project: path.join(scratch.dir, 'App', 'App.csproj') };
}

afterEach(async () => {
    await Promise.all(scratches.splice(0).map(scratch => scratch.cleanup()));
});

describe('ProjectContextProvider', () => {
    const project = fixture('cpm', 'App', 'App.csproj');
    const projectDir = fixture('cpm', 'App');
    const nearest = path.join(projectDir, 'nuget.config');
    const user = path.join(path.resolve('/home/user/.nuget/NuGet'), 'NuGet.Config');

    it('builds the context of a project', async () => {
        const runner = fakeDotnet(`${nearest}\r\n\r\n  ${user}  \n`);
        const sources = fakeSources([
            { name: 'private', url: 'https://feed.example/v3/index.json', enabled: true },
            { name: 'off', url: 'https://disabled.example/v3/index.json', enabled: false },
            { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
        ]);
        const { context, unsupported } = await new ProjectContextProvider({ runner, sources, stopDirs: [fixture('cpm')] }).get(project, 'workspace');
        expect(unsupported).toBeUndefined();
        expect(context).toEqual({
            projectPath: project,
            projectDir,
            workspaceFolder: 'workspace',
            sdk: sdk10,
            configFiles: [nearest, user],
            sourceUrls: ['https://feed.example/v3/index.json', 'https://api.nuget.org/v3/index.json'],
            revision: expect.stringMatching(/^[0-9a-f]{16}$/) as string,
        });
        expect(runner.calls).toEqual([{ args: ['nuget', 'config', 'paths'], options: { cwd: projectDir, timeoutMs: 15_000 } }]);
        expect(sources.listSources).toHaveBeenCalledWith(projectDir);
    });

    it('configFilesFor lists the chain of a directory without a project', async () => {
        const runner = fakeDotnet(`${nearest}\r\n\r\n  ${user}  \n`);
        const directory = path.resolve('/work/no-project-here');

        await expect(new ProjectContextProvider({ runner, sources: fakeSources() }).configFilesFor(directory)).resolves.toEqual([nearest, user]);
        expect(runner.calls).toEqual([{ args: ['nuget', 'config', 'paths'], options: expect.objectContaining({ cwd: directory }) }]);
        await expect(new ProjectContextProvider({ runner: fakeDotnet('', async () => { throw new Error('gone'); }), sources: fakeSources() }).configFilesFor(directory)).resolves.toEqual([]);
    });

    it('leaves out the workspace folder when none is given', async () => {
        const { context } = await new ProjectContextProvider({ runner: fakeDotnet(), sources: fakeSources() }).get(project);
        expect('workspaceFolder' in context).toBe(false);
        expect(context.configFiles).toEqual([]);
        expect(context.sourceUrls).toEqual([]);
    });

    it('pins SDK 8 through global.json and reports sdk-too-old', async () => {
        const pinned = fixture('sdk8', 'App', 'App.csproj');
        const { context, unsupported } = await new ProjectContextProvider({ runner: fakeDotnet(), sources: fakeSources(), stopDirs: [fixture('sdk8')] }).get(pinned);
        expect(context.sdk).toMatchObject({ version: '8.0.425', major: 8, supported: false });
        expect(unsupported).toEqual({ reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' });
        expect(SDK_TOO_OLD_MESSAGE).toBe('requires .NET SDK 10 or newer');
        // The context is still complete: the project stays readable.
        expect(context.projectDir).toBe(fixture('sdk8', 'App'));
        expect(context.revision).toMatch(/^[0-9a-f]{16}$/);
    });

    it('does not call a project unsupported when the SDK cannot be detected', async () => {
        const undetected = await new ProjectContextProvider({ runner: fakeDotnet('', async () => undefined), sources: fakeSources() }).get(project);
        expect('sdk' in undetected.context).toBe(false);
        expect(undetected.unsupported).toBeUndefined();

        const logger = fakeLogger();
        const failing = await new ProjectContextProvider({ runner: fakeDotnet('', async () => { throw new Error('probe crashed, token=abc123'); }), sources: fakeSources(), logger }).get(project);
        expect('sdk' in failing.context).toBe(false);
        expect(failing.unsupported).toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith(`SDK detection failed for ${projectDir}: probe crashed, token=[REDACTED]`);
    });

    it('has no config files when the command fails, times out or cannot be started', async () => {
        const logger = fakeLogger();
        const cases: Array<() => Partial<DotnetResult>> = [
            () => ({ exitCode: 1, stdout: nearest, stderr: 'error' }),
            () => ({ timedOut: true, exitCode: -1, stdout: nearest }),
            () => ({ cancelled: true, exitCode: -1 }),
            () => { throw new Error('spawn dotnet ENOENT'); },
        ];
        for (const result of cases) {
            const { context } = await new ProjectContextProvider({ runner: fakeDotnet(result), sources: fakeSources(), logger }).get(project);
            expect(context.configFiles).toEqual([]);
            expect(context.revision).toMatch(/^[0-9a-f]{16}$/);
        }
        expect(logger.warn).toHaveBeenCalledTimes(4);
        expect(logger.warn).toHaveBeenLastCalledWith(`dotnet nuget config paths could not be started for ${projectDir}: spawn dotnet ENOENT`);
    });

    it('rejects when the sources cannot be listed: no sources and unknown sources are different facts', async () => {
        const provider = new ProjectContextProvider({ runner: fakeDotnet(), sources: fakeSources(new Error('dotnet nuget list source failed')) });
        await expect(provider.get(project)).rejects.toThrow('dotnet nuget list source failed');
    });

    it('changes the revision when the project, a props file or a config file changes or appears', async () => {
        const { dir, project: scratchApp } = await scratchProject({ 'nuget.config': '<configuration />' });
        const config = path.join(dir, 'nuget.config');
        const provider = new ProjectContextProvider({ runner: fakeDotnet(config), sources: fakeSources(), stopDirs: [dir] });
        const touch = (file: string, seconds: number) => fs.promises.utimes(file, new Date(seconds * 1000), new Date(seconds * 1000));
        await touch(scratchApp, 1_700_000_000);
        await touch(config, 1_700_000_000);
        const revisions = [(await provider.get(scratchApp)).context.revision];
        expect((await provider.get(scratchApp)).context.revision).toBe(revisions[0]);

        await touch(scratchApp, 1_700_000_100);
        revisions.push((await provider.get(scratchApp)).context.revision);
        await touch(config, 1_700_000_100);
        revisions.push((await provider.get(scratchApp)).context.revision);
        await writeTree(dir, { 'Directory.Packages.props': '<Project />' });
        revisions.push((await provider.get(scratchApp)).context.revision);
        await writeTree(dir, { [path.join('App', 'global.json')]: '{}' });
        revisions.push((await provider.get(scratchApp)).context.revision);
        expect(new Set(revisions).size).toBe(5);
    });

    it.skipIf(process.env.NUIGET_SDK_TESTS !== '1')('reads the config chain of the real SDK nearest first', async () => {
        const { dir, project: scratchApp } = await scratchProject({ 'nuget.config': '<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n</configuration>\n', [path.join('App', 'nuget.config')]: '<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n</configuration>\n' });
        const { context, unsupported } = await new ProjectContextProvider({ runner: new DefaultDotnetRunner(), sources: fakeSources(), stopDirs: [dir] }).get(scratchApp);
        expect(unsupported).toBeUndefined();
        expect(context.sdk?.supported).toBe(true);
        // The CLI reports its own spelling of the file name (`NuGet.Config`) on a case-insensitive file system.
        const reported = context.configFiles.map(file => file.toLowerCase());
        expect(reported.slice(0, 2)).toEqual([path.join(dir, 'App', 'nuget.config').toLowerCase(), path.join(dir, 'nuget.config').toLowerCase()]);
        expect(reported.length).toBeGreaterThanOrEqual(2);
    }, 60_000);
});
