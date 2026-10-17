import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { DotnetResult, DotnetRunner, Logger, SourceMutationResult, SourceProvider } from '../contracts';
import type { NuGetSource } from '../../protocol/domain';
import {
    DotnetCommandError,
    listSourceArgs,
    nugetAddSourceArgs,
    nugetDisableSourceArgs,
    nugetEnableSourceArgs,
    nugetRemoveSourceArgs,
} from '../cli';
import { redact } from '../logging';
import { normalizeProjectPath } from '../util/paths';
import { parseListSourceOutput } from './listSourceOutput';

export interface DotnetSourceProviderOptions {
    runner: DotnetRunner;
    platform?: NodeJS.Platform;
    env?: Record<string, string | undefined>;
    homedir?: () => string;
    logger?: Logger;
}

type AddOptions = Parameters<SourceProvider['add']>[0];

const EMPTY_CONFIG = '<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n</configuration>\n';
const WORKSPACE_CONFIG_NAMES = ['nuget.config', 'NuGet.Config', 'NuGet.config'];
const FALLBACK_SOURCE_NAME = 'custom-source';
const REDACTED = '[REDACTED]';

/**
 * Package sources as the dotnet CLI sees them from a project directory (ADR-005). The CLI applies
 * the config chain, `<clear />` and disabled sources; this class only asks, parses and remembers.
 * A listing is remembered per directory until `invalidate()` or a mutation; a failed listing rejects
 * and is not remembered, so "no sources" and "could not find out" stay different answers.
 */
export class DotnetSourceProvider implements SourceProvider {
    private readonly runner: DotnetRunner;
    private readonly platform: NodeJS.Platform;
    private readonly env: Record<string, string | undefined>;
    private readonly homedir: () => string;
    private readonly logger: Logger | undefined;
    private readonly listings = new Map<string, Promise<NuGetSource[]>>();

    constructor(options: DotnetSourceProviderOptions) {
        this.runner = options.runner;
        this.platform = options.platform ?? process.platform;
        this.env = options.env ?? process.env;
        this.homedir = options.homedir ?? os.homedir;
        this.logger = options.logger;
    }

    listSources(projectDir: string): Promise<NuGetSource[]> {
        const key = normalizeProjectPath(projectDir);
        const cached = this.listings.get(key);
        if (cached !== undefined) {
            return cached.then(sources => sources.map(source => ({ ...source })));
        }
        const listing = this.list(projectDir);
        this.listings.set(key, listing);
        listing.catch(() => {
            // Only this attempt is forgotten: an invalidation may already have replaced it.
            if (this.listings.get(key) === listing) {
                this.listings.delete(key);
            }
        });
        return listing.then(sources => sources.map(source => ({ ...source })));
    }

    private async list(projectDir: string): Promise<NuGetSource[]> {
        const result = await this.runner.run(listSourceArgs(), { cwd: projectDir });
        if (!succeeded(result)) {
            throw new DotnetCommandError(result);
        }
        return parseListSourceOutput(result.stdout);
    }

    configFiles(workspaceDir?: string): Array<{ path: string; label: string }> {
        const userLevel = this.platform === 'win32'
            ? path.join(this.env.APPDATA ?? path.join(this.homedir(), 'AppData', 'Roaming'), 'NuGet', 'NuGet.Config')
            : path.join(this.homedir(), '.nuget', 'NuGet', 'NuGet.Config');
        const files = [{ path: userLevel, label: 'User' }];
        if (workspaceDir !== undefined) {
            const existing = WORKSPACE_CONFIG_NAMES.map(name => path.join(workspaceDir, name)).find(candidate => fs.existsSync(candidate));
            files.push({ path: existing ?? path.join(workspaceDir, WORKSPACE_CONFIG_NAMES[0]), label: `Workspace: ${path.basename(workspaceDir)}` });
        }
        return files;
    }

    async add(options: AddOptions, cwd: string): Promise<SourceMutationResult> {
        const secret = options.password;
        return this.mutate(cwd, secret, async () => {
            const name = options.name ?? await this.freeName(options.url, cwd);
            if (options.configFile !== undefined) {
                await ensureConfigFile(options.configFile);
            }
            return nugetAddSourceArgs({
                url: options.url,
                name,
                username: options.username,
                password: options.password,
                // DPAPI exists on Windows only; elsewhere the CLI refuses to store an encrypted password.
                storePasswordInClearText: this.platform !== 'win32' || options.storeEncrypted === false,
                configFile: options.configFile,
                allowInsecure: options.allowInsecure,
            });
        });
    }

    remove(name: string, cwd: string, configFile?: string): Promise<SourceMutationResult> {
        return this.mutate(cwd, undefined, async () => nugetRemoveSourceArgs({ name, configFile }));
    }

    enable(name: string, cwd: string): Promise<SourceMutationResult> {
        return this.mutate(cwd, undefined, async () => nugetEnableSourceArgs({ name }));
    }

    disable(name: string, cwd: string): Promise<SourceMutationResult> {
        return this.mutate(cwd, undefined, async () => nugetDisableSourceArgs({ name }));
    }

    invalidate(): void {
        this.listings.clear();
    }

    /** Runs one source command. Never rejects, and forgets every listing whatever the outcome. */
    private async mutate(cwd: string, secret: string | undefined, build: () => Promise<string[]>): Promise<SourceMutationResult> {
        try {
            const result = await this.runner.run(await build(), { cwd });
            if (succeeded(result)) {
                return { ok: true };
            }
            return { ok: false, error: withoutSecret(redact(firstLine(result.stderr) || firstLine(result.stdout) || `dotnet exited with code ${result.exitCode}`), secret) };
        } catch (error) {
            const message = withoutSecret(redact(error instanceof Error ? error.message : String(error)), secret);
            this.logger?.warn(`Source command failed: ${message}`);
            return { ok: false, error: message };
        } finally {
            this.invalidate();
        }
    }

    /** A name for a source that was given none: from its address, made unique among the sources of `cwd`. */
    private async freeName(url: string, cwd: string): Promise<string> {
        const taken = new Set((await this.listSources(cwd)).map(source => source.name.toLowerCase()));
        const base = suggestSourceName(url);
        let name = base;
        for (let suffix = 2; taken.has(name.toLowerCase()); suffix++) {
            name = `${base}-${suffix}`;
        }
        return name;
    }
}

/** The host name of a web address, the last segment of a path, or a fixed fallback; only characters a source name may have. */
export function suggestSourceName(url: string): string {
    const candidate = /^https?:\/\//i.test(url) ? hostnameOf(url) : url.split(/[\\/]/).filter(segment => segment.length > 0).pop() ?? '';
    const name = candidate.replace(/[^a-zA-Z0-9._ -]/g, '-').replace(/^[-\s]+/, '').trim();
    return name.length > 0 ? name : FALLBACK_SOURCE_NAME;
}

function hostnameOf(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

function succeeded(result: DotnetResult): boolean {
    return result.exitCode === 0 && !result.timedOut && !result.cancelled;
}

function firstLine(text: string): string {
    return text.split(/\r?\n/).map(line => line.trim()).find(line => line.length > 0) ?? '';
}

/** `redact` knows the forms a secret takes on a command line; this removes the value itself wherever it appears. */
function withoutSecret(text: string, secret: string | undefined): string {
    return secret === undefined || secret.length === 0 ? text : text.split(secret).join(REDACTED);
}

/** `--configfile` must name an existing file. */
async function ensureConfigFile(configFile: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(configFile), { recursive: true });
    try {
        await fs.promises.writeFile(configFile, EMPTY_CONFIG, { encoding: 'utf-8', flag: 'wx' });
    } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code !== 'EEXIST') {
            throw error;
        }
    }
}
