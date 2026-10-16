import * as crypto from 'crypto';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DefaultDotnetRunner, resolveDotnetExecutable, runPowerShellEncoded, type ExecFileFunction } from '../cli';
import { XmlParseError } from '../project/xml';
import { createScratchDir, writeTree, type ScratchDir } from '../project/__fixtures__/scratch';
import { decryptPassword, DotnetSourceProvider, NuGetConfigReader, type NuGetConfigDocument } from './index';

const file = path.join('repo', 'nuget.config');
const items = <T>(section: Array<{ kind: 'clear' } | ({ kind: 'item' } & T)>) => section.filter((entry): entry is { kind: 'item' } & T => entry.kind === 'item');
const credentialsOf = (document: NuGetConfigDocument) => Object.fromEntries(items(document.credentials).map(({ name, kind: _kind, ...rest }) => [name, rest]));

const scratches: ScratchDir[] = [];
afterEach(async () => {
    await Promise.all(scratches.splice(0).map(scratch => scratch.cleanup()));
});

describe('NuGetConfigReader', () => {
    it('reads the four sections in document order, with the place of each <clear />', () => {
        const document = new NuGetConfigReader({ env: {} }).parse(`<?xml version="1.0" encoding="utf-8"?>
            <configuration>
              <packageSources>
                <add key="Before" value="https://before.example/v3/index.json" />
                <clear />
                <add key="Private Feed" value=" https://feed.example/v3/index.json " protocolVersion="3" />
                <add key="NoValue" />
              </packageSources>
              <disabledPackageSources><add key="Private Feed" value="TRUE" /><add key="Other" value="false" /></disabledPackageSources>
              <packageSourceMapping>
                <clear />
                <packageSource key="Private Feed"><package pattern="Contoso.*" /><package pattern=" * " /><package /></packageSource>
                <packageSource><package pattern="ignored" /></packageSource>
              </packageSourceMapping>
            </configuration>`, file);
        expect(document.path).toBe(file);
        expect(document.sources).toEqual([
            { kind: 'item', key: 'Before', value: 'https://before.example/v3/index.json' },
            { kind: 'clear' },
            { kind: 'item', key: 'Private Feed', value: 'https://feed.example/v3/index.json' },
        ]);
        expect(document.disabled).toEqual([{ kind: 'item', key: 'Private Feed', disabled: true }, { kind: 'item', key: 'Other', disabled: false }]);
        expect(document.mapping).toEqual([{ kind: 'clear' }, { kind: 'item', key: 'Private Feed', patterns: ['Contoso.*', '*'] }]);
        expect(document.credentials).toEqual([]);
    });

    it('has no mapping without the element, and empty sections for a file without a configuration', () => {
        const reader = new NuGetConfigReader({ env: {} });
        expect(reader.parse('<configuration><packageSources /></configuration>', file).mapping).toBeUndefined();
        expect(reader.parse('<settings />', file)).toEqual({ path: file, sources: [], disabled: [], credentials: [] });
        // Attribute values stay as written: entities are not expanded.
        expect(items(reader.parse('<configuration><packageSources><add key="A" value="https://a.example/?x=1&amp;y=2" /></packageSources></configuration>', file).sources)[0].value).toBe('https://a.example/?x=1&amp;y=2');
    });

    it('reader: decodes _xHHHH_ element names', () => {
        const document = new NuGetConfigReader({ env: {} }).parse(`<configuration><packageSourceCredentials>
            <Private_x0020_Feed><add key="Username" value="alice" /><add key="ClearTextPassword" value="pw" /></Private_x0020_Feed>
            <_x0031_stFeed><add key="Username" value="bob" /><add key="ClearTextPassword" value="pw" /></_x0031_stFeed>
            <Plain_Name><add key="Username" value="carol" /><add key="ClearTextPassword" value="pw" /></Plain_Name>
        </packageSourceCredentials></configuration>`, file);
        // An underscore that is not part of an escape stays an underscore.
        expect(Object.keys(credentialsOf(document))).toEqual(['Private Feed', '1stFeed', 'Plain_Name']);
    });

    it('reader: expands %VAR% from the injected environment and leaves unset variables literal', () => {
        const reader = new NuGetConfigReader({ env: { FEED_USER: 'alice', FEED_TOKEN: 's3cret' } });
        const document = reader.parse(`<configuration><packageSourceCredentials>
            <Feed><add key="Username" value="%FEED_USER%@corp" /><add key="ClearTextPassword" value="%FEED_TOKEN%" /></Feed>
            <Unset><add key="Username" value="%NOT_SET%" /><add key="ClearTextPassword" value="100% sure %NOT_SET%" /></Unset>
        </packageSourceCredentials></configuration>`, file);
        expect(credentialsOf(document)).toEqual({
            Feed: { username: 'alice@corp', password: 's3cret', passwordKind: 'clear' },
            Unset: { username: '%NOT_SET%', password: '100% sure %NOT_SET%', passwordKind: 'clear' },
        });
    });

    it('reader: Password is encrypted and ClearTextPassword is clear', () => {
        const reader = new NuGetConfigReader({ env: { QUJD: 'expanded' } });
        const document = reader.parse(`<configuration><packageSourceCredentials>
            <Encrypted><add key="Username" value="alice" /><add key="Password" value="%QUJD%" /></Encrypted>
            <Clear><add key="username" value="bob" /><add key="CLEARTEXTPASSWORD" value="pw" /></Clear>
            <Both><add key="Password" value="QUJD" /><add key="ClearTextPassword" value="clear wins" /></Both>
            <UserOnly><add key="Username" value="carol" /></UserOnly>
            <Empty><add key="ValidAuthenticationTypes" value="basic" /></Empty>
        </packageSourceCredentials></configuration>`, file);
        expect(credentialsOf(document)).toEqual({
            // An encrypted value is never expanded or changed.
            Encrypted: { username: 'alice', password: '%QUJD%', passwordKind: 'encrypted' },
            Clear: { username: 'bob', password: 'pw', passwordKind: 'clear' },
            Both: { password: 'clear wins', passwordKind: 'clear' },
            UserOnly: { username: 'carol', passwordKind: 'clear' },
        });
    });

    it('reader: a BOM is accepted and malformed XML rejects with XmlParseError', async () => {
        const scratch = await createScratchDir('sources');
        scratches.push(scratch);
        await writeTree(scratch.dir, {
            'bom.config': '\uFEFF<configuration><packageSources><add key="A" value="https://a.example/" /></packageSources></configuration>',
            'broken.config': '<configuration><packageSources><add key="A" value="https://a.example/"></packageSources></configuration>',
        });
        const reader = new NuGetConfigReader({ env: {} });
        expect(items((await reader.read(path.join(scratch.dir, 'bom.config')))?.sources ?? [])).toEqual([{ kind: 'item', key: 'A', value: 'https://a.example/' }]);
        const broken = path.join(scratch.dir, 'broken.config');
        await expect(reader.read(broken)).rejects.toBeInstanceOf(XmlParseError);
        await expect(reader.read(broken)).rejects.toMatchObject({ filePath: broken });
        await expect(reader.readChain([broken])).rejects.toBeInstanceOf(XmlParseError);
    });

    it('reader: a missing file resolves undefined', async () => {
        const scratch = await createScratchDir('sources');
        scratches.push(scratch);
        await writeTree(scratch.dir, { 'nuget.config': '<configuration />' });
        const reader = new NuGetConfigReader({ env: {} });
        const present = path.join(scratch.dir, 'nuget.config');
        const missing = path.join(scratch.dir, 'missing', 'nuget.config');
        expect(await reader.read(missing)).toBeUndefined();
        expect((await reader.readChain([missing, present, missing])).map(document => document.path)).toEqual([present]);
        // A directory in place of the file is a real failure, not a missing file.
        await expect(reader.read(scratch.dir)).rejects.toMatchObject({ code: expect.stringMatching(/^E/) as string });
    });
});

describe('decryptPassword', () => {
    function recorder(reply: { error?: Error & { code?: number }; stdout?: string; stderr?: string } = {}) {
        const calls: Array<{ file: string; args: readonly string[] }> = [];
        const execFile: ExecFileFunction = (execFile_file, args, _options, callback) => {
            calls.push({ file: execFile_file, args });
            callback(reply.error ?? null, reply.stdout ?? '', reply.stderr ?? '');
            return undefined as never;
        };
        return { calls, execFile: vi.fn(execFile) };
    }
    const scriptOf = (args: readonly string[]) => Buffer.from(args[args.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le');

    it('dpapi: decrypts through runPowerShellEncoded with an injected execFile on win32', async () => {
        const { calls, execFile } = recorder({ stdout: 'hunter2' });
        expect(await decryptPassword(' QUJDRA== ', { platform: 'win32', execFile })).toBe('hunter2');
        expect(calls).toHaveLength(1);
        expect(calls[0].args).toContain('-EncodedCommand');
        const script = scriptOf(calls[0].args);
        expect(script).toContain("[Convert]::FromBase64String('QUJDRA==')");
        expect(script).toContain('ProtectedData]::Unprotect');
        // The value NuGet writes is protected with the entropy "NuGet".
        expect(script).toContain("GetBytes('NuGet')");
    });

    it('dpapi: returns undefined off Windows without spawning', async () => {
        for (const platform of ['linux', 'darwin'] as const) {
            const { execFile } = recorder({ stdout: 'hunter2' });
            expect(await decryptPassword('QUJDRA==', { platform, execFile })).toBeUndefined();
            expect(execFile).not.toHaveBeenCalled();
        }
    });

    it('dpapi: rejects a value that is not base64 before building a script', async () => {
        for (const value of ["'; Remove-Item C:\\x; '", 'QUJD$(calc)', 'has space', '', '====']) {
            const { execFile } = recorder({ stdout: 'never' });
            expect(await decryptPassword(value, { platform: 'win32', execFile })).toBeUndefined();
            expect(execFile).not.toHaveBeenCalled();
        }
    });

    const notWindowsWithSdk = process.platform !== 'win32' || process.env.NUIGET_SDK_TESTS !== '1';

    /** Adds a source with an encrypted password to a scratch `nuget.config` through the CLI and reads back what it stored. */
    async function storeEncrypted(name: string): Promise<{ password: string; stored: string }> {
        const scratch = await createScratchDir('sources');
        scratches.push(scratch);
        const runner = new DefaultDotnetRunner({ resolveExecutable: () => resolveDotnetExecutable() });
        const password = `p73-${crypto.randomBytes(12).toString('hex')}`;
        const configFile = path.join(scratch.dir, 'nuget.config');
        const added = await new DotnetSourceProvider({ runner, platform: 'win32', env: {} })
            .add({ url: 'https://example.invalid/v3/index.json', name, username: 'u', password, configFile, storeEncrypted: true }, scratch.dir);
        expect(added).toEqual({ ok: true });
        const document = await new NuGetConfigReader({ env: {} }).read(configFile);
        const credential = credentialsOf(document as NuGetConfigDocument)[name];
        expect(credential).toMatchObject({ username: 'u', passwordKind: 'encrypted' });
        const stored = credential.password as string;
        expect(stored).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
        expect(stored).not.toBe(password);
        return { password, stored };
    }

    it.skipIf(notWindowsWithSdk)('dpapi (Windows, SDK 10): a password that dotnet nuget add source encrypted decrypts to the value that was stored', async () => {
        const { password, stored } = await storeEncrypted('p73');
        expect(await decryptPassword(stored)).toBe(password);
    }, 120_000);

    it.skipIf(notWindowsWithSdk)('dpapi (Windows): the stored value is protected with the entropy "NuGet" and not without it (N54)', async () => {
        const { password, stored } = await storeEncrypted('p73-entropy');
        const unprotect = (entropy: string) => runPowerShellEncoded([
            'Add-Type -AssemblyName System.Security',
            `$bytes = [Convert]::FromBase64String('${stored}')`,
            '$scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser',
            `try { $plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, ${entropy}, $scope); [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($plain)) } catch { [Console]::Out.Write('unprotect failed') }`,
        ].join('; '), { timeoutMs: 60_000 });

        const withEntropy = await unprotect("[System.Text.Encoding]::UTF8.GetBytes('NuGet')");
        expect(withEntropy.exitCode).toBe(0);
        expect(withEntropy.stdout).toBe(password);
        const withoutEntropy = await unprotect('$null');
        expect(withoutEntropy.stdout).toBe('unprotect failed');
        expect(withoutEntropy.stdout).not.toBe(password);
    }, 120_000);

    it('answers undefined when PowerShell fails or prints nothing', async () => {
        const failed = recorder({ error: Object.assign(new Error('Command failed'), { code: 1 }), stderr: 'The data is invalid.' });
        expect(await decryptPassword('QUJDRA==', { platform: 'win32', execFile: failed.execFile })).toBeUndefined();
        expect(await decryptPassword('QUJDRA==', { platform: 'win32', execFile: recorder().execFile })).toBeUndefined();
    });
});
