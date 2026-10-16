import * as fs from 'fs';
import { runPowerShellEncoded, type ExecFileFunction } from '../cli';
import { attribute, childrenNamed, parseConfigXml, type ConfigElement } from './configXml';

/** The entries of one section in document order. `<clear />` discards what precedes it, in this file and in farther ones. */
export type ConfigSection<T> = Array<{ kind: 'clear' } | ({ kind: 'item' } & T)>;

export interface ConfigCredential {
    username?: string;
    password?: string;
    /** `'encrypted'` for a `Password` value (DPAPI, Windows only); `'clear'` for `ClearTextPassword`. */
    passwordKind: 'clear' | 'encrypted';
}

/** One parsed `nuget.config`; nothing is merged or resolved here. */
export interface NuGetConfigDocument {
    path: string;
    sources: ConfigSection<{ key: string; value: string }>;
    disabled: ConfigSection<{ key: string; disabled: boolean }>;
    credentials: ConfigSection<{ name: string } & ConfigCredential>;
    /** `undefined` when the file has no `<packageSourceMapping>` element. */
    mapping?: ConfigSection<{ key: string; patterns: string[] }>;
}

export interface NuGetConfigReaderOptions {
    /** Environment for `%VAR%` placeholders in credentials. */
    env?: Record<string, string | undefined>;
}

// XmlConvert.EncodeName form: a character that an XML name cannot hold is written as `_xHHHH_`.
const ENCODED_NAME_CHARACTER = /_x([0-9A-Fa-f]{4})_/g;
const ENVIRONMENT_PLACEHOLDER = /%([^%\s]+)%/g;

export class NuGetConfigReader {
    private readonly env: Record<string, string | undefined>;

    constructor(options: NuGetConfigReaderOptions = {}) {
        this.env = options.env ?? process.env;
    }

    /** Parse one file. A missing file resolves `undefined`; malformed XML rejects with `XmlParseError`. */
    async read(configPath: string): Promise<NuGetConfigDocument | undefined> {
        let text: string;
        try {
            text = await fs.promises.readFile(configPath, 'utf-8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
                return undefined;
            }
            throw error;
        }
        return this.parse(text, configPath);
    }

    /** Parse the files of a config chain, keeping the given order (nearest first) and leaving out missing files. */
    async readChain(configPaths: readonly string[]): Promise<NuGetConfigDocument[]> {
        const documents = await Promise.all(configPaths.map(configPath => this.read(configPath)));
        return documents.filter((document): document is NuGetConfigDocument => document !== undefined);
    }

    parse(text: string, configPath: string): NuGetConfigDocument {
        const configuration = parseConfigXml(text, configPath).find(element => element.name.toLowerCase() === 'configuration');
        const document: NuGetConfigDocument = {
            path: configPath,
            sources: section(childrenNamed(configuration, 'packageSources'), add => {
                const key = attribute(add, 'key')?.trim();
                const value = attribute(add, 'value')?.trim();
                return add.name.toLowerCase() === 'add' && key && value ? { key, value } : undefined;
            }),
            disabled: section(childrenNamed(configuration, 'disabledPackageSources'), add => {
                const key = attribute(add, 'key')?.trim();
                return add.name.toLowerCase() === 'add' && key ? { key, disabled: attribute(add, 'value')?.trim().toLowerCase() === 'true' } : undefined;
            }),
            credentials: section(childrenNamed(configuration, 'packageSourceCredentials'), element => this.credential(element)),
        };
        const mappings = childrenNamed(configuration, 'packageSourceMapping');
        if (mappings.length > 0) {
            document.mapping = section(mappings, element => {
                const key = attribute(element, 'key')?.trim();
                if (element.name.toLowerCase() !== 'packagesource' || !key) {
                    return undefined;
                }
                const patterns = childrenNamed(element, 'package').map(pkg => attribute(pkg, 'pattern')?.trim()).filter((pattern): pattern is string => !!pattern);
                return { key, patterns };
            });
        }
        return document;
    }

    private credential(element: ConfigElement): ({ name: string } & ConfigCredential) | undefined {
        const values = new Map<string, string>();
        for (const add of childrenNamed(element, 'add')) {
            const key = attribute(add, 'key')?.trim().toLowerCase();
            const value = attribute(add, 'value');
            if (key && value !== undefined) {
                values.set(key, value);
            }
        }
        const name = element.name.replace(ENCODED_NAME_CHARACTER, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
        const credential: { name: string } & ConfigCredential = { name, passwordKind: 'clear' };
        const username = values.get('username');
        if (username !== undefined) {
            credential.username = this.expand(username);
        }
        const clearText = values.get('cleartextpassword');
        const encrypted = values.get('password');
        if (clearText !== undefined) {
            credential.password = this.expand(clearText);
        } else if (encrypted !== undefined) {
            credential.password = encrypted;
            credential.passwordKind = 'encrypted';
        }
        return credential.username === undefined && credential.password === undefined ? undefined : credential;
    }

    /** `%VAR%` → the variable's value; a variable that is not set stays as written. */
    private expand(value: string): string {
        return value.replace(ENVIRONMENT_PLACEHOLDER, (placeholder, name: string) => this.env[name] ?? placeholder);
    }
}

function section<T>(elements: ConfigElement[], read: (element: ConfigElement) => T | undefined): ConfigSection<T> {
    const entries: ConfigSection<T> = [];
    for (const element of elements) {
        for (const child of element.children) {
            // XML names are case-sensitive: `<clear />` is the marker, `<Clear>` can be the credentials of a source of that name.
            if (child.name === 'clear') {
                entries.push({ kind: 'clear' });
                continue;
            }
            const item = read(child);
            if (item !== undefined) {
                entries.push({ kind: 'item', ...item });
            }
        }
    }
    return entries;
}

export interface DecryptOptions {
    platform?: NodeJS.Platform;
    execFile?: ExecFileFunction;
    timeoutMs?: number;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const DECRYPT_TIMEOUT_MS = 5_000;

/**
 * Decrypt a `Password` value of a `nuget.config` with DPAPI. Windows only: elsewhere, and for a value
 * that is not base64 or that cannot be decrypted, the answer is `undefined`. Never rejects, and the
 * value is checked before it becomes part of a script.
 */
export async function decryptPassword(encrypted: string, options: DecryptOptions = {}): Promise<string | undefined> {
    const platform = options.platform ?? process.platform;
    const value = encrypted.trim();
    if (platform !== 'win32' || !BASE64.test(value)) {
        return undefined;
    }
    // NuGet protects the password with the entropy `NuGet` (verified on windows-latest, CI run 38829853849, job
    // 116745869544). One statement per element: the elements are joined with `; `, and a try/catch split over two
    // elements is a parse error (N80).
    const script = [
        'Add-Type -AssemblyName System.Security',
        `$bytes = [Convert]::FromBase64String('${value}')`,
        '$scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser',
        "$plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, [System.Text.Encoding]::UTF8.GetBytes('NuGet'), $scope)",
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        '[Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($plain))',
    ].join('; ');
    const result = await runPowerShellEncoded(script, { platform, execFile: options.execFile, timeoutMs: options.timeoutMs ?? DECRYPT_TIMEOUT_MS });
    return result.exitCode === 0 && result.stdout.length > 0 ? result.stdout : undefined;
}
