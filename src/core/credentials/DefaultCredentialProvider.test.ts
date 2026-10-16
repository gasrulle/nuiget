import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DotnetResult, DotnetRunOptions, DotnetRunner, Logger } from '../contracts';
import type { NuGetSource } from '../../protocol/domain';
import { DotnetSpawnError, type ExecFileFunction } from '../cli';
import { createScratchDir, writeTree, type ScratchDir } from '../project/__fixtures__/scratch';
import { mergeConfigChain, NuGetConfigReader, type ConfigCredential } from '../sources';
import {
    basicAuthHeader,
    credentialForUrl,
    DefaultCredentialProvider,
    FAILURE_TTL_MS,
    findCredentialPlugin,
    isAzureArtifactsUrl,
    isSupportedCredentialProviderHost,
    matchExternalFeedEndpoint,
    normalizeSourceUrl,
    parsePluginOutput,
    PLUGIN_TIMEOUT_MS,
    SUCCESS_TTL_MS,
    type CredentialProviderOptions,
} from './index';

const azureUrl = 'https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json';
const privateUrl = 'https://feed.example/v3/index.json';
const home = path.resolve('/home/alice');
const pluginPath = path.join(home, '.nuget', 'plugins', 'netcore', 'CredentialProvider.Microsoft', 'CredentialProvider.Microsoft.dll');
const pluginAnswer = (password = 'plugin-secret') => `some banner\n{"Username":"VssSessionToken","Password":"${password}"}\n`;
const basic = (username: string, password: string) => `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;

interface FakeDotnet extends DotnetRunner {
    calls: Array<{ args: string[]; options: DotnetRunOptions }>;
}

function fakeDotnet(script: (args: string[]) => Partial<DotnetResult> | Promise<Partial<DotnetResult>> = () => ({ stdout: pluginAnswer() })): FakeDotnet {
    const calls: FakeDotnet['calls'] = [];
    return {
        calls,
        async run(args, options) {
            calls.push({ args, options });
            return { exitCode: 0, stdout: '', stderr: '', durationMs: 7, argv: ['dotnet', ...args], ...(await script(args)) };
        },
        async sdkVersion() { return undefined; },
        clearSdkCache() { /* no-op */ },
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
const logged = (logger: ReturnType<typeof fakeLogger>) => [logger.trace, logger.debug, logger.info, logger.warn, logger.error].flatMap(fn => fn.mock.calls.map(call => call.map(String).join(' '))).join('\n');

/** A provider in an environment where nothing is configured and the plugin is installed at its default place. */
function provider(overrides: Partial<CredentialProviderOptions> = {}): DefaultCredentialProvider {
    return new DefaultCredentialProvider({
        runner: fakeDotnet(),
        lookupConfigCredential: async () => undefined,
        cwd: path.resolve('/w/App'),
        env: {},
        platform: 'linux',
        homedir: () => home,
        fileExists: async filePath => filePath === pluginPath,
        decrypt: async () => undefined,
        ...overrides,
    });
}
const configured = (credential: ConfigCredential) => ({ lookupConfigCredential: async () => credential });

const scratches: ScratchDir[] = [];
afterEach(async () => {
    await Promise.all(scratches.splice(0).map(scratch => scratch.cleanup()));
});

describe('DefaultCredentialProvider: environment', () => {
    it('env: external feed endpoint matches by equality or path prefix in either direction', async () => {
        const endpoints = JSON.stringify({ endpointCredentials: [
            { endpoint: 'https://other.example/v3/index.json', username: 'nobody', password: 'x' },
            { endpoint: 'https://Feed.Example/v3/', username: 'alice', password: 'endpoint-secret' },
            { endpoint: privateUrl, password: 'later entry' },
        ] });
        const runner = fakeDotnet();
        const instance = provider({ runner, env: { VSS_NUGET_EXTERNAL_FEED_ENDPOINTS: endpoints }, ...configured({ username: 'config', password: 'config', passwordKind: 'clear' }) });
        // The endpoint is a path prefix of the source URL; the environment comes before nuget.config.
        expect(await instance.getAuthHeader(privateUrl)).toBe(basic('alice', 'endpoint-secret'));
        expect(runner.calls).toEqual([]);

        const entries = [{ endpoint: 'https://feed.example/v3/index.json/extra', password: 'p' }, { endpoint: 'https://feed.example/v3/index.jsonx', username: 'no', password: 'p' }, { endpoint: 'https://feed.example/nopassword', password: '' }, 'junk', null];
        expect(matchExternalFeedEndpoint('HTTPS://FEED.EXAMPLE/v3/index.json/', entries)).toEqual({ username: 'VssSessionToken', password: 'p' });
        expect(matchExternalFeedEndpoint('https://feed.example/v3/index.js', entries)).toBeUndefined();
        expect(matchExternalFeedEndpoint(privateUrl, { not: 'an array' })).toBeUndefined();
        // The first variable wins over the legacy one.
        const both = provider({ env: { ARTIFACTS_CREDENTIALPROVIDER_EXTERNAL_FEED_ENDPOINTS: JSON.stringify({ endpointCredentials: [{ endpoint: privateUrl, username: 'new', password: 'n' }] }), VSS_NUGET_EXTERNAL_FEED_ENDPOINTS: endpoints } });
        expect(await both.getAuthHeader(privateUrl)).toBe(basic('new', 'n'));
    });

    it('env: access token is used only for an Azure Artifacts host', async () => {
        const runner = fakeDotnet();
        const instance = provider({ runner, env: { VSS_NUGET_ACCESSTOKEN: 'legacy-token', ARTIFACTS_CREDENTIALPROVIDER_ACCESSTOKEN: 'env-token' }, fileExists: async () => false });
        expect(await instance.getAuthHeader(azureUrl)).toBe(basic('VssSessionToken', 'env-token'));
        expect(await instance.getAuthHeader(privateUrl)).toBeUndefined();
        expect(await provider({ env: { VSS_NUGET_ACCESSTOKEN: 'legacy-token' } }).getAuthHeader(azureUrl)).toBe(basic('VssSessionToken', 'legacy-token'));
        expect(runner.calls).toEqual([]);
    });

    it('env: malformed endpoint JSON is ignored without logging its content', async () => {
        const logger = fakeLogger();
        const instance = provider({ logger, env: { ARTIFACTS_CREDENTIALPROVIDER_EXTERNAL_FEED_ENDPOINTS: '{"endpointCredentials":[{"password":"leaky-secret"' }, ...configured({ username: 'bob', password: 'config-secret', passwordKind: 'clear' }) });
        expect(await instance.getAuthHeader(privateUrl)).toBe(basic('bob', 'config-secret'));
        expect(logger.debug).toHaveBeenCalledWith('The external feed endpoints variable does not hold JSON and is ignored');
        expect(logged(logger)).not.toContain('leaky-secret');
        // Valid JSON of another shape is no match either.
        expect(await provider({ env: { VSS_NUGET_EXTERNAL_FEED_ENDPOINTS: '{"endpointCredentials":"nope"}' } }).getAuthHeader(privateUrl)).toBeUndefined();
    });
});

describe('DefaultCredentialProvider: nuget.config', () => {
    it('config: clear-text password becomes a Basic header', async () => {
        const lookup = vi.fn(async () => ({ username: 'alice', password: 'hunter2', passwordKind: 'clear' as const }));
        const runner = fakeDotnet();
        expect(await provider({ runner, lookupConfigCredential: lookup }).getAuthHeader(privateUrl)).toBe('Basic YWxpY2U6aHVudGVyMg==');
        expect(lookup).toHaveBeenCalledWith(privateUrl);
        expect(runner.calls).toEqual([]);
    });

    it('config: encrypted password is decrypted through decryptPassword with an injected execFile on win32', async () => {
        const seen: string[][] = [];
        const fakePowerShell: ExecFileFunction = (_file, args, _options, callback) => {
            seen.push([...args]);
            callback(null, 'hunter2', '');
            return undefined as never;
        };
        const instance = new DefaultCredentialProvider({ runner: fakeDotnet(), ...configured({ username: 'alice', password: 'QUJDRA==', passwordKind: 'encrypted' }), env: {}, platform: 'win32', homedir: () => home, fileExists: async () => false, execFile: fakePowerShell });
        expect(await instance.getAuthHeader(privateUrl)).toBe(basic('alice', 'hunter2'));
        expect(seen).toHaveLength(1);
        expect(seen[0]).toContain('-EncodedCommand');
    });

    it('config: DPAPI failure falls through to the provider', async () => {
        const logger = fakeLogger();
        const runner = fakeDotnet();
        const decrypt = vi.fn(async () => undefined);
        const instance = provider({ runner, logger, decrypt, ...configured({ username: 'alice', password: 'RU5DUllQVEVE', passwordKind: 'encrypted' }) });
        // Not the encrypted text as a password: the next step answers.
        expect(await instance.getAuthHeader(azureUrl)).toBe(basic('VssSessionToken', 'plugin-secret'));
        expect(decrypt).toHaveBeenCalledWith('RU5DUllQVEVE');
        expect(runner.calls).toHaveLength(1);
        expect(logged(logger)).toContain('could not be decrypted; trying the credential provider');
        expect(logged(logger)).not.toContain('RU5DUllQVEVE');
        // Without a provider for the host there is no header at all.
        expect(await provider({ decrypt, ...configured({ username: 'alice', password: 'RU5DUllQVEVE', passwordKind: 'encrypted' }) }).getAuthHeader(privateUrl)).toBeUndefined();
    });

    it('config: unresolved %VAR% placeholder is not used', async () => {
        const runner = fakeDotnet();
        for (const credential of [{ username: 'alice', password: '%FEED_TOKEN%' }, { username: '%FEED_USER%', password: 'pw' }, { username: 'alice', password: '' }, { username: 'alice' }]) {
            expect(await provider({ runner, ...configured({ ...credential, passwordKind: 'clear' }) }).getAuthHeader(privateUrl)).toBeUndefined();
        }
        // A percent sign that is not a placeholder is an ordinary character.
        expect(await provider({ ...configured({ username: 'alice', password: '100% sure', passwordKind: 'clear' }) }).getAuthHeader(privateUrl)).toBe(basic('alice', '100% sure'));
        expect(runner.calls).toEqual([]);
    });

    it('config: missing username defaults to VssSessionToken', async () => {
        expect(await provider(configured({ password: 'pat', passwordKind: 'clear' })).getAuthHeader(privateUrl)).toBe(basic('VssSessionToken', 'pat'));
        expect(await provider(configured({ username: '', password: 'pat', passwordKind: 'clear' })).getAuthHeader(privateUrl)).toBe(basic('VssSessionToken', 'pat'));
    });
});

describe('DefaultCredentialProvider: credential provider plugin', () => {
    it('provider: runs the netcore plugin through the runner with the URL as one argv element', async () => {
        const hostile = 'https://pkgs.dev.azure.com/org/_packaging/$(whoami)/nuget/v3/index.json?a=1&b=2';
        const runner = fakeDotnet();
        const cwd = path.resolve('/w/App');
        expect(await provider({ runner, cwd }).getAuthHeader(hostile)).toBe(basic('VssSessionToken', 'plugin-secret'));
        expect(runner.calls).toEqual([{ args: [pluginPath, '-U', hostile, '-N', '-F', 'Json'], options: { cwd, timeoutMs: 10_000 } }]);
        expect(PLUGIN_TIMEOUT_MS).toBe(10_000);
        // Without a working directory given, the home directory is used.
        const defaulted = fakeDotnet();
        await provider({ runner: defaulted, cwd: undefined }).getAuthHeader(azureUrl);
        expect(defaulted.calls[0].options.cwd).toBe(home);
    });

    it('provider: answer without Username or Password yields no header', async () => {
        for (const stdout of ['{"Username":"VssSessionToken"}', '{"Username":"","Password":"x"}', 'not json', '', '{"Username":"u","Password":"p"', '[1,2]']) {
            expect(await provider({ runner: fakeDotnet(() => ({ stdout })) }).getAuthHeader(azureUrl)).toBeUndefined();
        }
        // A non-zero exit code is "none", whatever was printed.
        expect(await provider({ runner: fakeDotnet(() => ({ exitCode: 2, stdout: pluginAnswer(), stderr: 'interactive login required' })) }).getAuthHeader(azureUrl)).toBeUndefined();
        expect(parsePluginOutput('{"Username":"a","Password":"old"}\r\nnoise\r\n  {"Username":"b","Password":"new"}  \r\n')).toEqual({ username: 'b', password: 'new' });
    });

    it('provider: is not started for a host that is not eligible', async () => {
        const runner = fakeDotnet();
        const fileExists = vi.fn(async () => true);
        expect(await provider({ runner, fileExists }).getAuthHeader(privateUrl)).toBeUndefined();
        expect(await provider({ runner, fileExists }).getAuthHeader('https://notpkgs.dev.azure.com.evil.test/v3/index.json')).toBeUndefined();
        expect(runner.calls).toEqual([]);
        expect(fileExists).not.toHaveBeenCalled();
        // Eligible, but no plugin installed.
        expect(await provider({ runner, fileExists: async () => false }).getAuthHeader(azureUrl)).toBeUndefined();
        expect(runner.calls).toEqual([]);
    });

    it('provider: ARTIFACTS_CREDENTIALPROVIDER_HOSTS extends the eligible hosts by host name', async () => {
        const env = { ARTIFACTS_CREDENTIALPROVIDER_HOSTS: ' Feed.Example ; ;corp.test' };
        const runner = fakeDotnet();
        expect(await provider({ runner, env }).getAuthHeader(privateUrl)).toBe(basic('VssSessionToken', 'plugin-secret'));
        expect(await provider({ runner, env }).getAuthHeader('https://nuget.corp.test/v3/index.json')).toBe(basic('VssSessionToken', 'plugin-secret'));
        expect(runner.calls).toHaveLength(2);
        expect(isSupportedCredentialProviderHost('https://feed.example.evil.test/', env)).toBe(false);
        expect(isSupportedCredentialProviderHost('https://evil.test/feed.example/', env)).toBe(false);
        expect(isSupportedCredentialProviderHost('https://xcorp.test/', env)).toBe(false);
        expect(isSupportedCredentialProviderHost(privateUrl, { NUGET_CREDENTIALPROVIDER_VSTS_HOSTS: 'feed.example' })).toBe(true);
        expect(isSupportedCredentialProviderHost(privateUrl, {})).toBe(false);
        expect(isSupportedCredentialProviderHost('not a url', env)).toBe(false);
    });

    it('provider: NUGET_NETCORE_PLUGIN_PATHS wins over NUGET_PLUGIN_PATHS and an .exe entry is skipped', async () => {
        const scratch = await createScratchDir('credentials');
        scratches.push(scratch);
        await writeTree(scratch.dir, { 'netcore/Plugin.DLL': '', 'generic/Other.dll': '', 'netfx/CredentialProvider.Microsoft.exe': '' });
        const netcore = path.join(scratch.dir, 'netcore', 'Plugin.DLL');
        const generic = path.join(scratch.dir, 'generic', 'Other.dll');
        const exe = path.join(scratch.dir, 'netfx', 'CredentialProvider.Microsoft.exe');
        const missing = path.join(scratch.dir, 'missing.dll');
        const logger = fakeLogger();
        const exists = (filePath: string) => import('fs').then(fs => fs.promises.access(filePath).then(() => true, () => false));

        expect(await findCredentialPlugin({ NUGET_NETCORE_PLUGIN_PATHS: [exe, missing, netcore].join(path.delimiter), NUGET_PLUGIN_PATHS: generic }, () => scratch.dir, exists, logger)).toBe(netcore);
        expect(logger.debug).toHaveBeenCalledWith(`Credential plugin candidate skipped, only a .dll is started: ${exe}`);
        expect(await findCredentialPlugin({ NUGET_PLUGIN_PATHS: generic }, () => scratch.dir, exists)).toBe(generic);
        // The variable for the .NET Framework plugin is not read.
        expect(await findCredentialPlugin({ NUGET_NETFX_PLUGIN_PATHS: netcore }, () => scratch.dir, exists)).toBeUndefined();
        expect(await findCredentialPlugin({}, () => home, async filePath => filePath === pluginPath)).toBe(pluginPath);

        // The provider's own default for "does the file exist" finds a real file.
        const runner = fakeDotnet();
        const instance = new DefaultCredentialProvider({ runner, lookupConfigCredential: async () => undefined, env: { NUGET_NETCORE_PLUGIN_PATHS: netcore }, homedir: () => scratch.dir });
        expect(await instance.getAuthHeader(azureUrl)).toBe(basic('VssSessionToken', 'plugin-secret'));
        expect(runner.calls[0].args[0]).toBe(netcore);
    });

    it('provider: stdout never reaches the logger', async () => {
        const logger = fakeLogger();
        const runner = fakeDotnet(() => ({ stdout: pluginAnswer('abc123SECRET'), stderr: '\n  warning: token cache refreshed\nmore' }));
        expect(await provider({ runner, logger }).getAuthHeader(azureUrl)).toBe(basic('VssSessionToken', 'abc123SECRET'));
        const text = logged(logger);
        expect(text).toContain('The credential provider exited with code 0 after 7 ms: warning: token cache refreshed');
        expect(text).not.toContain('abc123SECRET');
        expect(text).not.toContain(Buffer.from('VssSessionToken:abc123SECRET').toString('base64'));
        expect(text).not.toContain('Username');
    });
});

describe('DefaultCredentialProvider: URLs, cache and header', () => {
    it('url: local, file and invalid source URLs yield undefined without any step', async () => {
        const lookup = vi.fn(async () => ({ username: 'alice', password: 'pw', passwordKind: 'clear' as const }));
        const runner = fakeDotnet();
        const instance = provider({ runner, lookupConfigCredential: lookup, env: { VSS_NUGET_ACCESSTOKEN: 'token' } });
        for (const url of ['/srv/packages', 'C:\\feeds', '\\\\server\\share', 'file:///srv/packages', 'ftp://feed.example/', 'https://feed.example/a"b', 'https://feed.example/`x`', '', 'not a url']) {
            expect(await instance.getAuthHeader(url)).toBeUndefined();
        }
        expect(lookup).not.toHaveBeenCalled();
        expect(runner.calls).toEqual([]);
    });

    it('cache: a credential lives 30 minutes and a miss 5 minutes', async () => {
        let now = 1_000_000;
        const lookup = vi.fn(async (url: string) => url === privateUrl ? { username: 'alice', password: 'pw', passwordKind: 'clear' as const } : undefined);
        const instance = provider({ lookupConfigCredential: lookup, now: () => now });
        const missUrl = 'https://none.example/v3/index.json';
        await instance.getAuthHeader(privateUrl);
        await instance.getAuthHeader(missUrl);
        expect(lookup).toHaveBeenCalledTimes(2);

        now += FAILURE_TTL_MS - 1;
        expect(await instance.getAuthHeader(' HTTPS://FEED.EXAMPLE/v3/index.json/ ')).toBe(basic('alice', 'pw'));
        expect(await instance.getAuthHeader(missUrl)).toBeUndefined();
        expect(lookup).toHaveBeenCalledTimes(2);

        now += 1;
        await instance.getAuthHeader(missUrl);
        expect(lookup).toHaveBeenCalledTimes(3);

        now = 1_000_000 + SUCCESS_TTL_MS - 1;
        await instance.getAuthHeader(privateUrl);
        expect(lookup.mock.calls.filter(call => call[0] === privateUrl)).toHaveLength(1);
        now += 1;
        await instance.getAuthHeader(privateUrl);
        expect(lookup.mock.calls.filter(call => call[0] === privateUrl)).toHaveLength(2);
        expect([SUCCESS_TTL_MS, FAILURE_TTL_MS]).toEqual([1_800_000, 300_000]);
    });

    it('cache: timeout, cancellation and spawn failure are not cached', async () => {
        const cause = Object.assign(new Error('spawn dotnet EACCES'), { code: 'EACCES' });
        const outcomes: Array<() => Partial<DotnetResult>> = [
            () => ({ timedOut: true, exitCode: -1 }),
            () => ({ cancelled: true, exitCode: -1 }),
            () => { throw new DotnetSpawnError('Could not start "dotnet" (EACCES).', 'dotnet', cause); },
            () => ({ stdout: pluginAnswer() }),
        ];
        let attempt = 0;
        const runner = fakeDotnet(() => outcomes[attempt++]());
        const lookup = vi.fn(async () => undefined);
        const instance = provider({ runner, lookupConfigCredential: lookup });
        expect(await instance.getAuthHeader(azureUrl)).toBeUndefined();
        expect(await instance.getAuthHeader(azureUrl)).toBeUndefined();
        expect(await instance.getAuthHeader(azureUrl)).toBeUndefined();
        expect(await instance.getAuthHeader(azureUrl)).toBe(basic('VssSessionToken', 'plugin-secret'));
        expect(await instance.getAuthHeader(azureUrl)).toBe(basic('VssSessionToken', 'plugin-secret'));
        expect(runner.calls).toHaveLength(4);

        // A lookup that throws is not remembered as "none" either, and nothing rejects.
        const logger = fakeLogger();
        const failing = vi.fn(async () => { throw new Error('listing failed, --password hunter2'); });
        const broken = provider({ lookupConfigCredential: failing, logger });
        expect(await broken.getAuthHeader(privateUrl)).toBeUndefined();
        expect(await broken.getAuthHeader(privateUrl)).toBeUndefined();
        expect(failing).toHaveBeenCalledTimes(2);
        expect(logger.warn).toHaveBeenCalledWith(`Credential lookup (nuget.config) failed for ${privateUrl}: listing failed, --password [REDACTED]`);
    });

    it('config: a decryption that times out is not remembered and is asked again', async () => {
        const logger = fakeLogger();
        const decrypt = vi.fn<(encrypted: string) => Promise<string | undefined>>()
            .mockRejectedValueOnce(new Error('PowerShell timed out after 10000 ms'))
            .mockResolvedValueOnce('s3cret');
        const instance = provider({ logger, decrypt, ...configured({ username: 'alice', password: 'RU5DUllQVEVE', passwordKind: 'encrypted' }) });
        expect(await instance.getAuthHeader(privateUrl)).toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith(`Credential lookup (nuget.config) failed for ${privateUrl}: PowerShell timed out after 10000 ms`);
        expect(await instance.getAuthHeader(privateUrl)).toBe(basic('alice', 's3cret'));
        expect(decrypt).toHaveBeenCalledTimes(2);
        expect(logged(logger)).not.toContain('s3cret');
    });

    it('cache: concurrent calls share one acquisition', async () => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const lookup = vi.fn(async () => { await gate; return { username: 'alice', password: 'pw', passwordKind: 'clear' as const }; });
        const instance = provider({ lookupConfigCredential: lookup });
        const pending = [instance.getAuthHeader(privateUrl), instance.getAuthHeader(`${privateUrl}/`), instance.getAuthHeader(privateUrl.toUpperCase())];
        release();
        expect(await Promise.all(pending)).toEqual([basic('alice', 'pw'), basic('alice', 'pw'), basic('alice', 'pw')]);
        expect(lookup).toHaveBeenCalledTimes(1);
    });

    it('cache: clear empties the cache and an acquisition started before clear does not repopulate', async () => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        let password = 'old';
        const lookup = vi.fn(async () => { const answer = password; await gate; return { username: 'alice', password: answer, passwordKind: 'clear' as const }; });
        const fileExists = vi.fn(async () => false);
        const instance = provider({ lookupConfigCredential: lookup, fileExists });
        const early = instance.getAuthHeader(privateUrl);
        await Promise.resolve();
        instance.clear();
        password = 'new';
        release();
        // The early caller still gets its answer, but it is not what later callers see.
        expect(await early).toBe(basic('alice', 'old'));
        expect(await instance.getAuthHeader(privateUrl)).toBe(basic('alice', 'new'));
        expect(lookup).toHaveBeenCalledTimes(2);
        expect(await instance.getAuthHeader(privateUrl)).toBe(basic('alice', 'new'));
        expect(lookup).toHaveBeenCalledTimes(2);

        // clear() also forgets where the plugin was looked for.
        const eligible = provider({ fileExists });
        await eligible.getAuthHeader(azureUrl);
        await eligible.getAuthHeader('https://pkgs.dev.azure.com/other/_packaging/feed/nuget/v3/index.json');
        expect(fileExists).toHaveBeenCalledTimes(1);
        eligible.clear();
        await eligible.getAuthHeader(azureUrl);
        expect(fileExists).toHaveBeenCalledTimes(2);
    });

    it('prewarm: starts acquisitions for every URL and never rejects', async () => {
        const lookup = vi.fn(async (url: string) => { if (url === azureUrl) { throw new Error('boom'); } return { username: 'alice', password: 'pw', passwordKind: 'clear' as const }; });
        const instance = provider({ lookupConfigCredential: lookup });
        expect(instance.prewarm([privateUrl, azureUrl, 'not a url', privateUrl])).toBeUndefined();
        // The call that follows joins the acquisition that prewarm started.
        expect(await instance.getAuthHeader(privateUrl)).toBe(basic('alice', 'pw'));
        expect(await instance.getAuthHeader(azureUrl)).toBeUndefined();
        expect(lookup.mock.calls.map(call => call[0])).toEqual([privateUrl, azureUrl, azureUrl]);
    });

    it('header: encodes non-ASCII user name and password as UTF-8', async () => {
        expect(basicAuthHeader('zoë', 'pässwörd✓')).toBe(`Basic ${Buffer.from('zoë:pässwörd✓', 'utf8').toString('base64')}`);
        expect(Buffer.from(basicAuthHeader('zoë', 'pässwörd✓').slice('Basic '.length), 'base64').toString('utf8')).toBe('zoë:pässwörd✓');
        expect(await provider(configured({ username: 'zoë', password: 'pässwörd✓', passwordKind: 'clear' })).getAuthHeader(privateUrl)).toBe(basicAuthHeader('zoë', 'pässwörd✓'));
    });
});

describe('credentialForUrl and the URL helpers', () => {
    const reader = new NuGetConfigReader({ env: {} });
    const merged = mergeConfigChain([reader.parse(`<configuration><packageSourceCredentials>
        <Private_x0020_Feed><add key="Username" value="alice" /><add key="ClearTextPassword" value="pw" /></Private_x0020_Feed>
    </packageSourceCredentials></configuration>`, path.join('repo', 'nuget.config'))]);
    const sources: NuGetSource[] = [
        { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
        { name: 'PRIVATE FEED', url: 'https://Feed.Example/v3/index.json/', enabled: true },
    ];

    it('join: finds the credential by source name case-insensitively and without a trailing slash', () => {
        expect(credentialForUrl(' https://feed.example/v3/index.json ', sources, merged)).toEqual({ username: 'alice', password: 'pw', passwordKind: 'clear', configFile: path.join('repo', 'nuget.config'), sourceName: 'PRIVATE FEED' });
        expect(normalizeSourceUrl(' HTTPS://Feed.Example/v3/index.json/ ')).toBe('https://feed.example/v3/index.json');
        expect(normalizeSourceUrl('https://feed.example//')).toBe('https://feed.example/');
    });

    it('join: unknown URL yields undefined', () => {
        expect(credentialForUrl('https://other.example/v3/index.json', sources, merged)).toBeUndefined();
        // A known source without credentials in the chain.
        expect(credentialForUrl('https://api.nuget.org/v3/index.json', sources, merged)).toBeUndefined();
        expect(credentialForUrl(privateUrl, [], merged)).toBeUndefined();
    });

    it.each([
        ['https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json', true],
        ['https://PKGS.DEV.AZURE.COM/org/project/', true],
        ['https://org.pkgs.visualstudio.com/_packaging/feed/nuget/v3/index.json', true],
        ['https://tfs.corp.example/tfs/Col/_packaging/x/nuget/v3/index.json', true],
        ['https://notpkgs.dev.azure.com.evil.test/v3/index.json', false],
        ['https://example.test/pkgs.dev.azure.com/', false],
        ['https://example.test/?next=.pkgs.visualstudio.com', false],
        ['https://feed.example/v3/index.json', false],
        ['not a url', false],
    ])('azure: host and /_packaging/ path tests (%s)', (url, expected) => {
        expect(isAzureArtifactsUrl(url)).toBe(expected);
    });
});
