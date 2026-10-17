/**
 * Argument validation for the dotnet CLI argv builders.
 *
 * Arguments are passed to `child_process.spawn` as separate argv entries, so there is no shell to
 * inject into. Validation exists to (a) reject values the CLI would misinterpret as options or
 * split into several tokens, (b) keep control characters out of project files and logs, and
 * (c) fail early with a precise message instead of a cryptic CLI error.
 */

/** Thrown when a value handed to an argv builder is not a valid CLI argument. */
export class InvalidArgumentError extends Error {
    constructor(public readonly argument: string, public readonly value: string, reason: string) {
        super(`Invalid ${argument} ${JSON.stringify(value)}: ${reason}`);
        this.name = 'InvalidArgumentError';
    }
}

// NuGet limits package ids to 100 characters; the character class mirrors the NuGet id grammar.
const PACKAGE_ID_MAX_LENGTH = 100;
const PACKAGE_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;
const VERSION_PATTERN = /^[a-zA-Z0-9._+-]+$/;
const SOURCE_NAME_PATTERN = /^[a-zA-Z0-9._\- ]+$/;
const SOURCE_NAME_MAX_LENGTH = 256;
// Characters that no feed URL or local feed path needs. Backslashes and URL punctuation such as `'`, `(`,
// `)`, `$`, `&`, `!` and `#` are not listed: Windows paths and NuGet v2 URLs (`Packages(Id='x')`) use them,
// and the value is one argv entry that no shell interprets.
const SOURCE_URL_FORBIDDEN = /["`|><;{}]/;
// `C:\feeds`, `C:/feeds` and `\\server\share`. Tested before `new URL`, which would read `C:` as a scheme.
const WINDOWS_PATH_PATTERN = /^(?:[a-zA-Z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/;
const LOCAL_FEED_PATH_PATTERN = /^[a-zA-Z0-9.:/_\- \\]+$/;
const CREDENTIAL_MAX_LENGTH = 512;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const MSBUILD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
// A positional argument that starts with this would be read by the CLI as an option.
const OPTION_PREFIX = '-';

/**
 * True when `packageId` is a syntactically valid NuGet package id. An id never starts with `-`; the
 * builders place it as a positional argument, where the CLI would read such a value as an option.
 */
export function isValidPackageId(packageId: string): boolean {
    return packageId.length > 0
        && packageId.length <= PACKAGE_ID_MAX_LENGTH
        && !packageId.startsWith(OPTION_PREFIX)
        && PACKAGE_ID_PATTERN.test(packageId);
}

/** True when `version` only contains characters allowed in a NuGet version string. */
export function isValidVersion(version: string): boolean {
    return VERSION_PATTERN.test(version);
}

/** True when `name` is an acceptable `nuget.config` package source name. Positional, so no leading `-`. */
export function isValidSourceName(name: string): boolean {
    return name.length > 0 && name.length <= SOURCE_NAME_MAX_LENGTH && !name.startsWith(OPTION_PREFIX) && SOURCE_NAME_PATTERN.test(name);
}

/** True when `url` is an http(s)/file URL, a Windows drive or UNC path, or a plain local feed path. */
export function isValidSourceUrl(url: string): boolean {
    if (url.length === 0 || CONTROL_CHARS.test(url) || SOURCE_URL_FORBIDDEN.test(url)) {
        return false;
    }
    if (WINDOWS_PATH_PATTERN.test(url)) {
        return true;
    }
    try {
        const parsed = new URL(url);
        return ['http:', 'https:', 'file:'].includes(parsed.protocol);
    } catch {
        return !url.startsWith(OPTION_PREFIX) && LOCAL_FEED_PATH_PATTERN.test(url);
    }
}

/** True when a username/password may be passed to `dotnet nuget add source` (no control characters). */
export function isValidCredentialValue(value: string): boolean {
    return value.length > 0 && value.length <= CREDENTIAL_MAX_LENGTH && !CONTROL_CHARS.test(value);
}

/** True when `value` can be an MSBuild item type, property name or global-property key. */
export function isValidMsBuildName(value: string): boolean {
    return MSBUILD_NAME_PATTERN.test(value);
}

/** Returns `packageId` or throws `InvalidArgumentError`. */
export function assertPackageId(packageId: string): string {
    if (!isValidPackageId(packageId)) {
        throw new InvalidArgumentError('package id', packageId, 'expected letters, digits, ".", "_" or "-" (max 100 chars)');
    }
    return packageId;
}

/** Returns `version` or throws `InvalidArgumentError`. */
export function assertVersion(version: string): string {
    if (!isValidVersion(version)) {
        throw new InvalidArgumentError('version', version, 'expected letters, digits, ".", "_", "+" or "-"');
    }
    return version;
}

/** Returns `name` or throws `InvalidArgumentError`. */
export function assertSourceName(name: string): string {
    if (!isValidSourceName(name)) {
        throw new InvalidArgumentError('source name', name, 'expected letters, digits, ".", "_", "-" or spaces (1-256 chars)');
    }
    return name;
}

/** Returns `url` or throws `InvalidArgumentError`. */
export function assertSourceUrl(url: string): string {
    if (!isValidSourceUrl(url)) {
        throw new InvalidArgumentError('source URL', url, 'expected an http(s)/file URL or a local feed path without quotes, backticks, "|", "<", ">", ";", braces or control characters');
    }
    return url;
}

/**
 * Returns `value` or throws `InvalidArgumentError`; `label` names the credential in the message. The error
 * never carries the value: it may be a password, and error messages reach logs and notifications.
 */
export function assertCredentialValue(value: string, label: string): string {
    if (!isValidCredentialValue(value)) {
        throw new InvalidArgumentError(label, '[REDACTED]', 'expected 1-512 characters without control characters');
    }
    return value;
}

/**
 * Returns `filePath` or throws `InvalidArgumentError`. Paths are never quoted or escaped: they are
 * passed as one argv entry, so only empty values and control characters are rejected.
 */
export function assertPath(filePath: string, label: string): string {
    if (filePath.length === 0 || CONTROL_CHARS.test(filePath)) {
        throw new InvalidArgumentError(label, filePath, 'expected a non-empty path without control characters');
    }
    return filePath;
}

/** Returns `value` or throws `InvalidArgumentError`; used for MSBuild item/property names. */
export function assertMsBuildName(value: string, label: string): string {
    if (!isValidMsBuildName(value)) {
        throw new InvalidArgumentError(label, value, 'expected an MSBuild identifier (letters, digits, "_")');
    }
    return value;
}
