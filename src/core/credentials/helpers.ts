import * as path from 'path';
import type { Logger } from '../contracts';
import type { NuGetSource } from '../../protocol/domain';
import type { ConfigCredential, MergedNuGetConfig } from '../sources';

export interface UsernamePassword {
    username: string;
    password: string;
}

/** The user name NuGet's Azure Artifacts tooling uses when a token stands in for a password. */
export const TOKEN_USERNAME = 'VssSessionToken';

const AZURE_ARTIFACTS_HOST = 'pkgs.dev.azure.com';
const LEGACY_AZURE_ARTIFACTS_SUFFIX = '.pkgs.visualstudio.com';
const ON_PREMISES_FEED_PATH = '/_packaging/';
const PLUGIN_FILE = 'CredentialProvider.Microsoft.dll';

/** The form in which source URLs are compared and cached: trimmed, lower-cased, without one trailing slash. */
export function normalizeSourceUrl(url: string): string {
    const normalized = url.trim().toLowerCase();
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

/**
 * The `nuget.config` credential of a source URL: the URL names a source of `sources`, and the
 * merged config chain holds credentials under that source's name.
 */
export function credentialForUrl(sourceUrl: string, sources: readonly NuGetSource[], merged: MergedNuGetConfig): (ConfigCredential & { sourceName: string; configFile: string }) | undefined {
    const wanted = normalizeSourceUrl(sourceUrl);
    const source = sources.find(candidate => normalizeSourceUrl(candidate.url) === wanted);
    const credential = source === undefined ? undefined : merged.credentials.get(source.name.toLowerCase());
    return source === undefined || credential === undefined ? undefined : { ...credential, sourceName: source.name };
}

/** `Basic` authorization with the pair encoded as UTF-8. */
export function basicAuthHeader(username: string, password: string): string {
    return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

/** Azure Artifacts in the cloud by host name, an on-premises Azure DevOps Server by its feed path. */
export function isAzureArtifactsUrl(url: string): boolean {
    const parsed = parse(url);
    if (parsed === undefined) {
        return false;
    }
    const host = parsed.hostname.toLowerCase();
    return host === AZURE_ARTIFACTS_HOST
        || host.endsWith(`.${AZURE_ARTIFACTS_HOST}`)
        || host.endsWith(LEGACY_AZURE_ARTIFACTS_SUFFIX)
        || parsed.pathname.toLowerCase().includes(ON_PREMISES_FEED_PATH);
}

/** Hosts that the user added for the credential provider, compared by host name and its subdomains. */
export function isSupportedCredentialProviderHost(url: string, env: Record<string, string | undefined>): boolean {
    const host = parse(url)?.hostname.toLowerCase();
    const configured = env.ARTIFACTS_CREDENTIALPROVIDER_HOSTS ?? env.NUGET_CREDENTIALPROVIDER_VSTS_HOSTS;
    if (host === undefined || configured === undefined) {
        return false;
    }
    return configured.split(';').map(entry => entry.trim().toLowerCase()).filter(entry => entry.length > 0)
        .some(entry => host === entry || host.endsWith(`.${entry}`));
}

/**
 * The first entry of an `endpointCredentials` list that has a password and whose endpoint is the
 * source URL, a path prefix of it, or a path below it.
 */
export function matchExternalFeedEndpoint(sourceUrl: string, entries: unknown): UsernamePassword | undefined {
    if (!Array.isArray(entries)) {
        return undefined;
    }
    const wanted = normalizeSourceUrl(sourceUrl);
    for (const entry of entries as unknown[]) {
        if (typeof entry !== 'object' || entry === null) {
            continue;
        }
        const { endpoint, username, password } = entry as Record<string, unknown>;
        if (typeof endpoint !== 'string' || typeof password !== 'string' || password.length === 0) {
            continue;
        }
        const candidate = normalizeSourceUrl(endpoint);
        if (candidate === wanted || wanted.startsWith(`${candidate}/`) || candidate.startsWith(`${wanted}/`)) {
            return { username: typeof username === 'string' && username.length > 0 ? username : TOKEN_USERNAME, password };
        }
    }
    return undefined;
}

/**
 * The Azure Artifacts Credential Provider as the cross-platform plugin that `dotnet` itself loads:
 * the first existing `.dll` among `NUGET_NETCORE_PLUGIN_PATHS` (or, when that is unset,
 * `NUGET_PLUGIN_PATHS`) and the default location below the home directory. An `.exe` is never chosen.
 */
export async function findCredentialPlugin(
    env: Record<string, string | undefined>,
    homedir: () => string,
    fileExists: (filePath: string) => Promise<boolean>,
    logger?: Logger,
): Promise<string | undefined> {
    const configured = env.NUGET_NETCORE_PLUGIN_PATHS ?? env.NUGET_PLUGIN_PATHS;
    const candidates = [
        ...(configured ?? '').split(path.delimiter).map(entry => entry.trim()).filter(entry => entry.length > 0),
        path.join(homedir(), '.nuget', 'plugins', 'netcore', 'CredentialProvider.Microsoft', PLUGIN_FILE),
    ];
    for (const candidate of candidates) {
        if (!candidate.toLowerCase().endsWith('.dll')) {
            logger?.debug(`Credential plugin candidate skipped, only a .dll is started: ${candidate}`);
            continue;
        }
        if (await fileExists(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

/** The credential in a plugin's answer: the last line that is a JSON object with `Username` and `Password`. */
export function parsePluginOutput(stdout: string): UsernamePassword | undefined {
    const line = stdout.split(/\r?\n/).map(candidate => candidate.trim()).filter(candidate => candidate.startsWith('{')).pop();
    if (line === undefined) {
        return undefined;
    }
    try {
        const { Username: username, Password: password } = JSON.parse(line) as Record<string, unknown>;
        return typeof username === 'string' && username.length > 0 && typeof password === 'string' && password.length > 0 ? { username, password } : undefined;
    } catch {
        return undefined;
    }
}

function parse(url: string): URL | undefined {
    try {
        return new URL(url);
    } catch {
        return undefined;
    }
}
