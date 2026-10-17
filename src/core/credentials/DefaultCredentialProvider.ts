import * as fs from 'fs';
import * as os from 'os';
import type { CredentialProvider, DotnetRunner, Logger } from '../contracts';
import { isValidSourceUrl, type ExecFileFunction } from '../cli';
import { redact } from '../logging';
import { decryptPassword, type ConfigCredential } from '../sources';
import {
    basicAuthHeader,
    findCredentialPlugin,
    isAzureArtifactsUrl,
    isSupportedCredentialProviderHost,
    matchExternalFeedEndpoint,
    normalizeSourceUrl,
    parsePluginOutput,
    TOKEN_USERNAME,
    type UsernamePassword,
} from './helpers';

export interface CredentialProviderOptions {
    runner: DotnetRunner;
    /** The `nuget.config` credential of a source URL in the caller's project context (see `credentialForUrl`). */
    lookupConfigCredential: (sourceUrl: string) => Promise<ConfigCredential | undefined>;
    /** Working directory for the credential plugin. */
    cwd?: string;
    env?: Record<string, string | undefined>;
    platform?: NodeJS.Platform;
    homedir?: () => string;
    fileExists?: (filePath: string) => Promise<boolean>;
    decrypt?: (encrypted: string) => Promise<string | undefined>;
    /** Passed on to the DPAPI decryption and used for nothing else. */
    execFile?: ExecFileFunction;
    now?: () => number;
    logger?: Logger;
}

export const SUCCESS_TTL_MS = 30 * 60_000;
export const FAILURE_TTL_MS = 5 * 60_000;
export const PLUGIN_TIMEOUT_MS = 10_000;

const UNRESOLVED_PLACEHOLDER = /%[^%\s]+%/;

/** `transient`: it could not be found out this time; the answer is not remembered. */
type Outcome = { kind: 'credential'; credential: UsernamePassword } | { kind: 'none' } | { kind: 'transient' };

const NONE: Outcome = { kind: 'none' };
const TRANSIENT: Outcome = { kind: 'transient' };

/**
 * The `Authorization` header for a source URL, looked for in three places in this order: the
 * environment, the `nuget.config` chain, the Azure Artifacts Credential Provider. An answer is kept
 * for 30 minutes, "none" for 5; what could not be found out (a timeout, a failed start) is not kept.
 * Nothing secret is logged: not a header, a password, a token, a variable's content or the plugin's output.
 */
export class DefaultCredentialProvider implements CredentialProvider {
    private readonly runner: DotnetRunner;
    private readonly lookupConfigCredential: (sourceUrl: string) => Promise<ConfigCredential | undefined>;
    private readonly cwd: string;
    private readonly env: Record<string, string | undefined>;
    private readonly homedir: () => string;
    private readonly fileExists: (filePath: string) => Promise<boolean>;
    private readonly decrypt: (encrypted: string) => Promise<string | undefined>;
    private readonly now: () => number;
    private readonly logger: Logger | undefined;

    private readonly cache = new Map<string, { header: string | undefined; expiresAt: number }>();
    private readonly inFlight = new Map<string, Promise<string | undefined>>();
    private plugin: Promise<string | undefined> | undefined;
    private epoch = 0;

    constructor(options: CredentialProviderOptions) {
        const platform = options.platform ?? process.platform;
        const execFile = options.execFile;
        this.runner = options.runner;
        this.lookupConfigCredential = options.lookupConfigCredential;
        this.env = options.env ?? process.env;
        this.homedir = options.homedir ?? os.homedir;
        this.cwd = options.cwd ?? this.homedir();
        this.fileExists = options.fileExists ?? (filePath => fs.promises.access(filePath).then(() => true, () => false));
        this.decrypt = options.decrypt ?? (encrypted => decryptPassword(encrypted, { platform, execFile }));
        this.now = options.now ?? Date.now;
        this.logger = options.logger;
    }

    /** Never rejects. Sources that are not http(s) have no header. */
    getAuthHeader(sourceUrl: string): Promise<string | undefined> {
        if (!isRemote(sourceUrl)) {
            return Promise.resolve(undefined);
        }
        const key = normalizeSourceUrl(sourceUrl);
        const cached = this.cache.get(key);
        if (cached !== undefined) {
            if (this.now() < cached.expiresAt) {
                return Promise.resolve(cached.header);
            }
            this.cache.delete(key);
        }
        const running = this.inFlight.get(key);
        if (running !== undefined) {
            return running;
        }
        const epoch = this.epoch;
        const acquisition = this.acquire(sourceUrl).then(outcome => {
            // A `clear()` in the meantime means the answer may rest on what was cleared.
            if (epoch === this.epoch) {
                this.inFlight.delete(key);
                if (outcome.kind !== 'transient') {
                    const header = outcome.kind === 'credential' ? basicAuthHeader(outcome.credential.username, outcome.credential.password) : undefined;
                    this.cache.set(key, { header, expiresAt: this.now() + (header === undefined ? FAILURE_TTL_MS : SUCCESS_TTL_MS) });
                }
            }
            return outcome.kind === 'credential' ? basicAuthHeader(outcome.credential.username, outcome.credential.password) : undefined;
        });
        this.inFlight.set(key, acquisition);
        return acquisition;
    }

    prewarm(sourceUrls: string[]): void {
        for (const url of sourceUrls) {
            void this.getAuthHeader(url);
        }
    }

    clear(): void {
        this.cache.clear();
        this.inFlight.clear();
        this.plugin = undefined;
        this.epoch++;
    }

    private async acquire(sourceUrl: string): Promise<Outcome> {
        const steps: Array<[string, () => Promise<Outcome> | Outcome]> = [
            ['environment', () => this.fromEnvironment(sourceUrl)],
            ['nuget.config', () => this.fromConfig(sourceUrl)],
            ['credential provider', () => this.fromPlugin(sourceUrl)],
        ];
        for (const [name, step] of steps) {
            try {
                const outcome = await step();
                if (outcome.kind !== 'none') {
                    return outcome;
                }
            } catch (error) {
                this.logger?.warn(redact(`Credential lookup (${name}) failed for ${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`));
                return TRANSIENT;
            }
        }
        return NONE;
    }

    private fromEnvironment(sourceUrl: string): Outcome {
        const endpoints = this.env.ARTIFACTS_CREDENTIALPROVIDER_EXTERNAL_FEED_ENDPOINTS ?? this.env.VSS_NUGET_EXTERNAL_FEED_ENDPOINTS;
        if (endpoints !== undefined) {
            try {
                const match = matchExternalFeedEndpoint(sourceUrl, (JSON.parse(endpoints) as { endpointCredentials?: unknown }).endpointCredentials);
                if (match !== undefined) {
                    return { kind: 'credential', credential: match };
                }
            } catch {
                this.logger?.debug('The external feed endpoints variable does not hold JSON and is ignored');
            }
        }
        const token = this.env.ARTIFACTS_CREDENTIALPROVIDER_ACCESSTOKEN ?? this.env.VSS_NUGET_ACCESSTOKEN;
        return token !== undefined && token.length > 0 && isAzureArtifactsUrl(sourceUrl)
            ? { kind: 'credential', credential: { username: TOKEN_USERNAME, password: token } }
            : NONE;
    }

    private async fromConfig(sourceUrl: string): Promise<Outcome> {
        const configured = await this.lookupConfigCredential(sourceUrl);
        if (configured?.password === undefined || configured.password.length === 0) {
            return NONE;
        }
        let password: string | undefined = configured.password;
        if (configured.passwordKind === 'encrypted') {
            password = await this.decrypt(configured.password);
            if (password === undefined) {
                this.logger?.debug(redact(`The encrypted password of ${sourceUrl} could not be decrypted; trying the credential provider`));
                return NONE;
            }
        } else if (UNRESOLVED_PLACEHOLDER.test(password)) {
            this.logger?.debug(redact(`The credential of ${sourceUrl} refers to an environment variable that is not set`));
            return NONE;
        }
        if (configured.username !== undefined && UNRESOLVED_PLACEHOLDER.test(configured.username)) {
            this.logger?.debug(redact(`The credential of ${sourceUrl} refers to an environment variable that is not set`));
            return NONE;
        }
        return { kind: 'credential', credential: { username: configured.username || TOKEN_USERNAME, password } };
    }

    private async fromPlugin(sourceUrl: string): Promise<Outcome> {
        if (!isAzureArtifactsUrl(sourceUrl) && !isSupportedCredentialProviderHost(sourceUrl, this.env)) {
            return NONE;
        }
        this.plugin ??= findCredentialPlugin(this.env, this.homedir, this.fileExists, this.logger);
        const plugin = await this.plugin;
        if (plugin === undefined) {
            return NONE;
        }
        let result;
        try {
            // The URL is one argument of its own; nothing interprets it.
            result = await this.runner.run([plugin, '-U', sourceUrl, '-N', '-F', 'Json'], { cwd: this.cwd, timeoutMs: PLUGIN_TIMEOUT_MS });
        } catch (error) {
            this.logger?.debug(redact(`The credential provider could not be started: ${error instanceof Error ? error.message : String(error)}`));
            return TRANSIENT;
        }
        // The output holds the credential and is never logged, redacted or not.
        const firstErrorLine = result.stderr.split(/\r?\n/).map(line => line.trim()).find(line => line.length > 0) ?? '';
        this.logger?.debug(redact(`The credential provider exited with code ${result.exitCode} after ${result.durationMs} ms${firstErrorLine ? `: ${firstErrorLine}` : ''}`));
        if (result.timedOut || result.cancelled) {
            return TRANSIENT;
        }
        const credential = result.exitCode === 0 ? parsePluginOutput(result.stdout) : undefined;
        return credential === undefined ? NONE : { kind: 'credential', credential };
    }
}

function isRemote(sourceUrl: string): boolean {
    if (!isValidSourceUrl(sourceUrl)) {
        return false;
    }
    try {
        const protocol = new URL(sourceUrl).protocol;
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}
