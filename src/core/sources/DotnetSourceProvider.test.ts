import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DotnetResult, DotnetRunOptions, DotnetRunner } from '../contracts';
import { DefaultDotnetRunner, DotnetCommandError } from '../cli';
import { createScratchDir, writeTree, type ScratchDir } from '../project/__fixtures__/scratch';
import { DotnetSourceProvider, parseListSourceOutput, suggestSourceName } from './index';

const fixtureDir = path.join(__dirname, '__fixtures__', 'list-source');
const capture = fs.readFileSync(path.join(fixtureDir, '10.0.401.txt'), 'utf-8');
const listArgs = ['nuget', 'list', 'source', '--format', 'detailed'];
const isList = (args: string[]) => args[1] === 'list';

interface FakeDotnet extends DotnetRunner {
    calls: Array<{ args: string[]; cwd: string }>;
}

function fakeDotnet(script: (args: string[], options: DotnetRunOptions) => Partial<DotnetResult> | Promise<Partial<DotnetResult>> = () => ({})): FakeDotnet {
    const calls: FakeDotnet['calls'] = [];
    return {
        calls,
        async run(args, options) {
            calls.push({ args, cwd: options.cwd });
            const partial = await script(args, options);
            return { exitCode: 0, stdout: isList(args) ? capture : '', stderr: '', durationMs: 1, argv: ['dotnet', ...args], ...partial };
        },
        async sdkVersion() { return undefined; },
        clearSdkCache() { /* no-op */ },
    };
}

const projectDir = path.resolve('/w/App');
const otherDir = path.resolve('/w/Other');
const mutations = (runner: FakeDotnet) => runner.calls.filter(call => !isList(call.args)).map(call => call.args);

const scratches: ScratchDir[] = [];
async function scratchDir(files: Record<string, string> = {}): Promise<string> {
    const scratch = await createScratchDir('sources');
    scratches.push(scratch);
    await writeTree(scratch.dir, files);
    return scratch.dir;
}
afterEach(async () => {
    await Promise.all(scratches.splice(0).map(scratch => scratch.cleanup()));
});

describe('DotnetSourceProvider.listSources', () => {
    it('provider: lists through the runner from the project directory', async () => {
        const runner = fakeDotnet();
        const sources = await new DotnetSourceProvider({ runner }).listSources(projectDir);
        expect(runner.calls).toEqual([{ args: listArgs, cwd: projectDir }]);
        expect(sources.map(source => [source.name, source.enabled])).toEqual([['Private Feed', true], ['Disabled Feed', false], ['Local Packages', true]]);
        expect(sources.every(source => source.configFile === undefined)).toBe(true);
    });

    it('provider: caches per directory and shares an in-flight listing', async () => {
        const runner = fakeDotnet();
        const provider = new DotnetSourceProvider({ runner });
        const [first, second] = await Promise.all([provider.listSources(projectDir), provider.listSources(path.join(projectDir, '.'))]);
        expect(runner.calls).toHaveLength(1);
        // Each caller gets its own copy.
        first[0].enabled = false;
        expect(second[0].enabled).toBe(true);
        expect((await provider.listSources(projectDir))[0].enabled).toBe(true);
        expect(runner.calls).toHaveLength(1);

        await provider.listSources(otherDir);
        expect(runner.calls.map(call => call.cwd)).toEqual([projectDir, otherDir]);
    });

    it('provider: invalidate clears every directory', async () => {
        const runner = fakeDotnet();
        const provider = new DotnetSourceProvider({ runner });
        await provider.listSources(projectDir);
        await provider.listSources(otherDir);
        provider.invalidate();
        await provider.listSources(projectDir);
        await provider.listSources(otherDir);
        expect(runner.calls).toHaveLength(4);
    });

    it('provider: failed listing rejects and is not cached', async () => {
        let attempt = 0;
        const runner = fakeDotnet(() => {
            attempt++;
            if (attempt === 1) {
                return { exitCode: 1, stdout: '', stderr: 'error: NU1301: Unable to load the service index, --password hunter2' };
            }
            if (attempt === 2) {
                throw new Error('spawn dotnet ENOENT');
            }
            if (attempt === 3) {
                return { timedOut: true, exitCode: -1, stdout: capture };
            }
            return {};
        });
        const provider = new DotnetSourceProvider({ runner });
        const failure = await provider.listSources(projectDir).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(DotnetCommandError);
        expect((failure as Error).message).toContain('exited with code 1');
        expect((failure as Error).message).not.toContain('hunter2');
        await expect(provider.listSources(projectDir)).rejects.toThrow('spawn dotnet ENOENT');
        await expect(provider.listSources(projectDir)).rejects.toBeInstanceOf(DotnetCommandError);
        // Nothing of the three failures was remembered: the fourth call asks again and succeeds.
        expect(await provider.listSources(projectDir)).toHaveLength(3);
        expect(runner.calls).toHaveLength(4);
    });
});

describe('DotnetSourceProvider mutations', () => {
    it('provider: add names a source from its URL when no name is given', async () => {
        const runner = fakeDotnet(args => isList(args) ? { stdout: 'Registered Sources:\n  1.  feed.example [Enabled]\n      https://feed.example/v3/index.json\n  2.  FEED.EXAMPLE-2 [Enabled]\n      https://feed.example/other/index.json\n' } : {});
        const provider = new DotnetSourceProvider({ runner, platform: 'win32' });
        expect(await provider.add({ url: 'https://feed.example:8443/v3/index.json' }, projectDir)).toEqual({ ok: true });
        expect(await provider.add({ url: 'https://api.nuget.org/v3/index.json' }, projectDir)).toEqual({ ok: true });
        expect(await provider.add({ url: 'https://feed.example/v3/index.json', name: 'Given Name' }, projectDir)).toEqual({ ok: true });
        expect(mutations(runner)).toEqual([
            ['nuget', 'add', 'source', 'https://feed.example:8443/v3/index.json', '--name', 'feed.example-3'],
            ['nuget', 'add', 'source', 'https://api.nuget.org/v3/index.json', '--name', 'api.nuget.org'],
            ['nuget', 'add', 'source', 'https://feed.example/v3/index.json', '--name', 'Given Name'],
        ]);
        expect(runner.calls.every(call => call.cwd === projectDir)).toBe(true);
    });

    it('suggests a name from a host, a path or nothing', () => {
        expect(suggestSourceName('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json')).toBe('pkgs.dev.azure.com');
        expect(suggestSourceName('http://[::1]:5000/v3/index.json')).toBe('1-');
        expect(suggestSourceName('/srv/feeds/Local Packages/')).toBe('Local Packages');
        expect(suggestSourceName('C:\\feeds\\internal')).toBe('internal');
        expect(suggestSourceName('\\\\server\\share$')).toBe('share-');
        expect(suggestSourceName('./-packages')).toBe('packages');
        expect(suggestSourceName('///')).toBe('custom-source');
        expect(suggestSourceName('https://')).toBe('custom-source');
    });

    it('provider: add stores the password in clear text off Windows and when storeEncrypted is false', async () => {
        const argvFor = async (platform: NodeJS.Platform, storeEncrypted: boolean | undefined) => {
            const runner = fakeDotnet();
            await new DotnetSourceProvider({ runner, platform }).add({ url: 'https://feed.example/v3/index.json', name: 'Feed', username: 'alice', password: 'hunter2', storeEncrypted, allowInsecure: true }, projectDir);
            return mutations(runner)[0];
        };
        const base = ['nuget', 'add', 'source', 'https://feed.example/v3/index.json', '--name', 'Feed', '--username', 'alice', '--password', 'hunter2'];
        expect(await argvFor('linux', true)).toEqual([...base, '--store-password-in-clear-text', '--allow-insecure-connections']);
        expect(await argvFor('darwin', undefined)).toEqual([...base, '--store-password-in-clear-text', '--allow-insecure-connections']);
        expect(await argvFor('win32', false)).toEqual([...base, '--store-password-in-clear-text', '--allow-insecure-connections']);
        expect(await argvFor('win32', true)).toEqual([...base, '--allow-insecure-connections']);
        expect(await argvFor('win32', undefined)).toEqual([...base, '--allow-insecure-connections']);
    });

    it('provider: add creates a missing config file before calling dotnet', async () => {
        const dir = await scratchDir({ 'existing.config': '<configuration><packageSources /></configuration>' });
        const created = path.join(dir, 'nested', 'nuget.config');
        const existing = path.join(dir, 'existing.config');
        const seen: Array<string | undefined> = [];
        const runner = fakeDotnet(args => {
            const configFile = args[args.indexOf('--configfile') + 1];
            seen.push(args.includes('--configfile') ? fs.readFileSync(configFile, 'utf-8') : undefined);
            return {};
        });
        const provider = new DotnetSourceProvider({ runner });
        expect(await provider.add({ url: 'https://feed.example/v3/index.json', name: 'Feed', configFile: created }, dir)).toEqual({ ok: true });
        expect(await provider.add({ url: 'https://feed.example/v3/index.json', name: 'Feed', configFile: existing }, dir)).toEqual({ ok: true });
        expect(seen).toEqual(['<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n</configuration>\n', '<configuration><packageSources /></configuration>']);
        expect(mutations(runner)[0].slice(-2)).toEqual(['--configfile', created]);
    });

    it('provider: mutation error is redacted and never contains the password', async () => {
        const failing = fakeDotnet(args => isList(args) ? {} : { exitCode: 1, stderr: '\nerror: Unable to add https://alice:hunter2@feed.example/ (password hunter2 was rejected)\nusage: …' });
        const provider = new DotnetSourceProvider({ runner: failing, platform: 'linux' });
        const result = await provider.add({ url: 'https://feed.example/v3/index.json', name: 'Feed', username: 'alice', password: 'hunter2' }, projectDir);
        expect(result.ok).toBe(false);
        expect(result.error).toBe('error: Unable to add https://[REDACTED]@feed.example/ (password [REDACTED] was rejected)');
        expect(JSON.stringify(result)).not.toContain('hunter2');

        // A value that the argument builder refuses never reaches dotnet.
        const untouched = fakeDotnet();
        const refused = await new DotnetSourceProvider({ runner: untouched }).add({ url: 'https://feed.example/v3/index.json', name: 'bad;name', password: 'hunter2' }, projectDir);
        expect(refused.ok).toBe(false);
        expect(refused.error).toContain('source name');
        expect(JSON.stringify(refused)).not.toContain('hunter2');
        expect(untouched.calls).toEqual([]);
        expect((await new DotnetSourceProvider({ runner: untouched }).remove('-name', projectDir)).ok).toBe(false);

        const broken = fakeDotnet(args => { if (!isList(args)) { throw new Error('spawn dotnet EACCES, --password hunter2'); } return {}; });
        const spawnFailure = await new DotnetSourceProvider({ runner: broken }).add({ url: 'https://feed.example/v3/index.json', name: 'Feed', password: 'hunter2' }, projectDir);
        expect(spawnFailure).toEqual({ ok: false, error: 'spawn dotnet EACCES, --password [REDACTED]' });

        const silent = fakeDotnet(args => isList(args) ? {} : { exitCode: 3 });
        expect(await new DotnetSourceProvider({ runner: silent }).disable('Feed', projectDir)).toEqual({ ok: false, error: 'dotnet exited with code 3' });
    });

    it('provider: a mutation invalidates the cache', async () => {
        const runner = fakeDotnet(args => args[1] === 'disable' ? { exitCode: 1, stderr: 'error: no such source' } : {});
        const provider = new DotnetSourceProvider({ runner });
        const config = path.resolve('/w/nuget.config');
        await provider.listSources(projectDir);
        expect(await provider.enable('Private Feed', projectDir)).toEqual({ ok: true });
        await provider.listSources(projectDir);
        expect(await provider.remove('Private Feed', projectDir, config)).toEqual({ ok: true });
        await provider.listSources(projectDir);
        // A failed command may have changed something too.
        expect((await provider.disable('Missing', projectDir)).ok).toBe(false);
        await provider.listSources(projectDir);
        await provider.listSources(projectDir);
        expect(runner.calls.filter(call => isList(call.args))).toHaveLength(4);
        expect(mutations(runner)).toEqual([
            ['nuget', 'enable', 'source', 'Private Feed'],
            ['nuget', 'remove', 'source', 'Private Feed', '--configfile', config],
            ['nuget', 'disable', 'source', 'Missing'],
        ]);
    });

    it('provider: configFiles lists the user-level file and the workspace file', async () => {
        const home = path.resolve('/home/alice');
        const runner = fakeDotnet();
        const unix = new DotnetSourceProvider({ runner, platform: 'linux', env: {}, homedir: () => home });
        expect(unix.configFiles()).toEqual([{ path: path.join(home, '.nuget', 'NuGet', 'NuGet.Config'), label: 'User' }]);

        const appData = path.join(home, 'AppData', 'Roaming');
        expect(new DotnetSourceProvider({ runner, platform: 'win32', env: { APPDATA: path.join(home, 'Custom') }, homedir: () => home }).configFiles()[0].path).toBe(path.join(home, 'Custom', 'NuGet', 'NuGet.Config'));
        expect(new DotnetSourceProvider({ runner, platform: 'win32', env: {}, homedir: () => home }).configFiles()[0].path).toBe(path.join(appData, 'NuGet', 'NuGet.Config'));

        const empty = await scratchDir();
        expect(unix.configFiles(empty)[1]).toEqual({ path: path.join(empty, 'nuget.config'), label: `Workspace: ${path.basename(empty)}` });
        const withConfig = await scratchDir({ 'NuGet.Config': '<configuration />' });
        // On a case-insensitive file system the first candidate spelling already matches.
        expect(unix.configFiles(withConfig)[1].path.toLowerCase()).toBe(path.join(withConfig, 'nuget.config').toLowerCase());
        expect(fs.existsSync(unix.configFiles(withConfig)[1].path)).toBe(true);
        expect(runner.calls).toEqual([]);
    });
});

describe('DotnetSourceProvider with the real SDK', () => {
    it.skipIf(process.env.NUIGET_SDK_TESTS !== '1')('real SDK: a nested nuget.config with <clear /> hides the user-level sources', async () => {
        const dir = await scratchDir({ 'nuget.config': fs.readFileSync(path.join(fixtureDir, 'config.xml'), 'utf-8'), [path.join('App', 'App.csproj')]: '<Project Sdk="Microsoft.NET.Sdk" />' });
        const live = await new DotnetSourceProvider({ runner: new DefaultDotnetRunner() }).listSources(path.join(dir, 'App'));
        // Local addresses come back absolute and in the platform's spelling.
        const comparable = (sources: typeof live) => sources.map(source => source.isLocal ? { ...source, url: path.normalize(source.url).toLowerCase() } : source);
        expect(comparable(live)).toEqual(comparable(parseListSourceOutput(capture.split('{dir}').join(dir))));
        for (const source of live.filter(candidate => !candidate.isLocal)) {
            const host = new URL(source.url).hostname;
            expect(host === 'api.nuget.org' || host === 'www.nuget.org' || host === 'nuget.org').toBe(false);
        }
    }, 60_000);
});
