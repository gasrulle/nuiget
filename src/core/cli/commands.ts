import {
    assertCredentialValue,
    assertMsBuildName,
    assertPackageId,
    assertPath,
    assertSourceName,
    assertSourceUrl,
    assertVersion,
    InvalidArgumentError,
} from './validate';

export interface AddPackageOptions {
    projectPath: string;
    packageId: string;
    version?: string;
    sourceUrl?: string;
    /**
     * Skip the restore that `package add` runs by default. Never combined with `isCpm`: 2.0 does not pass
     * `--no-restore` to `package add` on a Central Package Management project (ADR-004), and
     * `addPackageArgs` throws when both are set.
     */
    noRestore?: boolean;
    /** The project uses Central Package Management. */
    isCpm?: boolean;
}

export interface RemovePackageOptions {
    projectPath: string;
    packageId: string;
}

export interface PackageSearchOptions {
    query: string;
    sources?: string[];
    prerelease?: boolean;
    exactMatch?: boolean;
    take?: number;
}

export interface AddSourceOptions {
    url: string;
    name: string;
    username?: string;
    password?: string;
    /**
     * Emit `--store-password-in-clear-text`. Required on non-Windows platforms (no DPAPI) and when
     * the user opted out of encryption on Windows; the caller decides, this builder only emits.
     */
    storePasswordInClearText?: boolean;
    configFile?: string;
    /** Emit `--allow-insecure-connections` (http sources). */
    allowInsecure?: boolean;
}

export interface SourceNameOptions {
    name: string;
    configFile?: string;
}

const MAX_SEARCH_QUERY_LENGTH = 512;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Argv for `dotnet package add <id> --project <path>`, the noun-first form of SDK 10 and newer. Throws
 * `InvalidArgumentError` when `noRestore` and `isCpm` are both set.
 */
export function addPackageArgs(options: AddPackageOptions): string[] {
    const projectPath = assertPath(options.projectPath, 'project path');
    const packageId = assertPackageId(options.packageId);
    if (options.noRestore && options.isCpm) {
        throw new InvalidArgumentError('noRestore', 'true', 'must not be combined with a Central Package Management project');
    }
    const args = ['package', 'add', packageId, '--project', projectPath];
    if (options.version !== undefined) {
        args.push('--version', assertVersion(options.version));
    }
    if (options.sourceUrl !== undefined) {
        args.push('--source', assertSourceUrl(options.sourceUrl));
    }
    if (options.noRestore) {
        args.push('--no-restore');
    }
    return args;
}

/** Argv for `dotnet package remove <id> --project <path>`. */
export function removePackageArgs(options: RemovePackageOptions): string[] {
    const projectPath = assertPath(options.projectPath, 'project path');
    const packageId = assertPackageId(options.packageId);
    return ['package', 'remove', packageId, '--project', projectPath];
}

/** Argv for `dotnet restore <project>`. */
export function restoreArgs(projectPath: string): string[] {
    return ['restore', assertPath(projectPath, 'project path')];
}

/** Argv for `dotnet nuget list source --format detailed`. */
export function listSourceArgs(): string[] {
    return ['nuget', 'list', 'source', '--format', 'detailed'];
}

/** Argv for `dotnet package search`. JSON output with normal verbosity is the only machine-readable form. */
export function packageSearchArgs(options: PackageSearchOptions): string[] {
    const query = options.query.trim();
    if (query.length === 0 || query.length > MAX_SEARCH_QUERY_LENGTH || CONTROL_CHARS.test(query)) {
        throw new InvalidArgumentError('search query', options.query, 'expected 1-512 characters without control characters');
    }
    if (query.startsWith('-')) {
        throw new InvalidArgumentError('search query', options.query, 'must not start with "-" (would be parsed as an option)');
    }
    const args = ['package', 'search', query, '--format', 'json', '--verbosity', 'normal'];
    for (const source of options.sources ?? []) {
        args.push('--source', assertSourceUrl(source));
    }
    if (options.prerelease) {
        args.push('--prerelease');
    }
    if (options.exactMatch) {
        args.push('--exact-match');
    }
    if (options.take !== undefined) {
        if (!Number.isInteger(options.take) || options.take <= 0) {
            throw new InvalidArgumentError('take', String(options.take), 'expected a positive integer');
        }
        args.push('--take', String(options.take));
    }
    return args;
}

/**
 * Argv for `dotnet msbuild <project> -nologo -getItem:... -getProperty:... -p:k=v`.
 * Items are comma-separated and properties semicolon-separated, matching MSBuild's documented forms.
 */
export function msbuildGetArgs(
    projectPath: string,
    items: string[],
    properties: string[],
    globalProperties?: Record<string, string>,
): string[] {
    const args = ['msbuild', assertPath(projectPath, 'project path'), '-nologo'];
    if (items.length > 0) {
        args.push(`-getItem:${items.map(item => assertMsBuildName(item, 'item type')).join(',')}`);
    }
    if (properties.length > 0) {
        args.push(`-getProperty:${properties.map(property => assertMsBuildName(property, 'property name')).join(';')}`);
    }
    for (const [key, value] of Object.entries(globalProperties ?? {})) {
        assertMsBuildName(key, 'global property name');
        // MSBuild splits `-p:` on ";" and the Windows build re-parses quotes from the raw command line.
        // eslint-disable-next-line no-control-regex
        if (/[;"\r\n\u0000]/.test(value)) {
            throw new InvalidArgumentError('global property value', value, 'must not contain ";", quotes or control characters');
        }
        args.push(`-p:${key}=${value}`);
    }
    return args;
}

/** Argv for `dotnet nuget add source`. */
export function nugetAddSourceArgs(options: AddSourceOptions): string[] {
    const args = ['nuget', 'add', 'source', assertSourceUrl(options.url), '--name', assertSourceName(options.name)];
    if (options.username !== undefined) {
        args.push('--username', assertCredentialValue(options.username, 'username'));
    }
    if (options.password !== undefined) {
        args.push('--password', assertCredentialValue(options.password, 'password'));
        if (options.storePasswordInClearText) {
            args.push('--store-password-in-clear-text');
        }
    }
    if (options.configFile !== undefined) {
        args.push('--configfile', assertPath(options.configFile, 'config file'));
    }
    if (options.allowInsecure) {
        args.push('--allow-insecure-connections');
    }
    return args;
}

/** Argv for `dotnet nuget remove source <name>`. */
export function nugetRemoveSourceArgs(options: SourceNameOptions): string[] {
    return withConfigFile(['nuget', 'remove', 'source', assertSourceName(options.name)], options.configFile);
}

/** Argv for `dotnet nuget enable source <name>`. */
export function nugetEnableSourceArgs(options: SourceNameOptions): string[] {
    return withConfigFile(['nuget', 'enable', 'source', assertSourceName(options.name)], options.configFile);
}

/** Argv for `dotnet nuget disable source <name>`. */
export function nugetDisableSourceArgs(options: SourceNameOptions): string[] {
    return withConfigFile(['nuget', 'disable', 'source', assertSourceName(options.name)], options.configFile);
}

function withConfigFile(args: string[], configFile: string | undefined): string[] {
    if (configFile !== undefined) {
        args.push('--configfile', assertPath(configFile, 'config file'));
    }
    return args;
}
