/**
 * NuGet version *specifications*: exact, minimum, interval ranges and floating patterns.
 *
 * A specification is a different concept from a version — a `PackageReference` carries a
 * specification, the resolved assets file carries versions. Keeping them as separate types
 * prevents specifications such as `[1.0.0]` or `1.*` from reaching a version comparator.
 *
 * Grammar (https://learn.microsoft.com/en-us/nuget/concepts/package-versioning#version-ranges):
 *   1.0            minimum, inclusive
 *   [1.0]          exact
 *   [1.0,2.0)      1.0 ≤ x < 2.0        (,2.0]  x ≤ 2.0        [1.0,)  x ≥ 1.0
 *   *, 1.*, 1.0.*, 1.0.0.*   floating (highest matching stable version)
 *   1.0.0-*, 1.0.*-*, 1.0.0-beta*, 1.0.0-beta.*   floating with prerelease labels
 */

import { compare, normalizeId, parseVersion, type NuGetVersion } from './NuGetVersion';
import type { VersionSpec } from '../../protocol/domain';

export type VersionSpecKind = 'exact' | 'minimum' | 'range' | 'floating' | 'invalid';

export interface FloatingPattern {
    /** Numeric prefix that must match (`''` for `*`). */
    prefix: string;
    /**
     * Position of the wildcard, counted in fixed components: 0 for `*` and `*-*`, 1 for `1.*` (major fixed),
     * 2 for `1.0.*`, 3 for `1.0.0.*`, 4 when every numeric component is fixed and the wildcard sits in the
     * prerelease label (`1.0.0-*`, `1.0.0-beta*`). The value travels unchanged as `VersionSpec.floatingDepth`
     * (`src/protocol/domain.ts`), whose comment names 1 to 3 as major, minor and patch.
     */
    depth: 0 | 1 | 2 | 3 | 4;
    /** Whether prerelease versions are admitted by the pattern. */
    prerelease: boolean;
    /** Prerelease label prefix that must match when `prerelease` is true (`''` = any). */
    releasePrefix: string;
    isAlwaysLatest: boolean;
}

export interface ParsedVersionSpec {
    kind: VersionSpecKind;
    original: string;
    min?: NuGetVersion;
    minInclusive?: boolean;
    max?: NuGetVersion;
    maxInclusive?: boolean;
    floating?: FloatingPattern;
}

const FLOATING = /^(?:(\d+(?:\.\d+){0,3})\.)?\*(?:-(.*))?$/;
const PRERELEASE_FLOATING = /^(\d+(?:\.\d+){0,3})-([0-9A-Za-z.-]*)\*$/;

function invalid(original: string): ParsedVersionSpec {
    return { kind: 'invalid', original };
}

/** Parse a version specification as written in a project file. Never throws. */
export function parseVersionSpec(text: string): ParsedVersionSpec {
    if (typeof text !== 'string') {
        return invalid('');
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return invalid(text);
    }

    if (trimmed === '*' || trimmed === '*-*') {
        return {
            kind: 'floating',
            original: text,
            floating: { prefix: '', depth: 0, prerelease: trimmed === '*-*', releasePrefix: '', isAlwaysLatest: true },
        };
    }

    const floatingMatch = FLOATING.exec(trimmed);
    if (floatingMatch) {
        const prefix = floatingMatch[1] ?? '';
        const releaseSuffix = floatingMatch[2];
        const depth = prefix.length === 0 ? 0 : (prefix.split('.').length as 1 | 2 | 3 | 4);
        const prerelease = releaseSuffix !== undefined;
        if (prerelease && releaseSuffix !== '*' && !/^[0-9A-Za-z.-]*\*$/.test(releaseSuffix)) {
            return invalid(text);
        }
        const releasePrefix = prerelease ? releaseSuffix.replace(/\*$/, '') : '';
        return {
            kind: 'floating',
            original: text,
            floating: { prefix, depth, prerelease, releasePrefix, isAlwaysLatest: false },
            min: prefix.length > 0 ? parseVersion(padPrefix(prefix)) : undefined,
            minInclusive: true,
        };
    }

    const prereleaseFloating = PRERELEASE_FLOATING.exec(trimmed);
    if (prereleaseFloating) {
        const prefix = prereleaseFloating[1];
        const min = parseVersion(padPrefix(prefix));
        if (!min) {
            return invalid(text);
        }
        return {
            kind: 'floating',
            original: text,
            floating: { prefix, depth: 4, prerelease: true, releasePrefix: prereleaseFloating[2], isAlwaysLatest: false },
            min,
            minInclusive: true,
        };
    }

    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    const opensInterval = first === '[' || first === '(';
    const closesInterval = last === ']' || last === ')';
    if (opensInterval || closesInterval) {
        if (!opensInterval || !closesInterval) {
            return invalid(text);
        }
        const inner = trimmed.slice(1, -1);
        const comma = inner.indexOf(',');
        if (comma === -1) {
            if (first !== '[' || last !== ']') {
                return invalid(text);
            }
            const exact = parseVersion(inner.trim());
            if (!exact) {
                return invalid(text);
            }
            return { kind: 'exact', original: text, min: exact, minInclusive: true, max: exact, maxInclusive: true };
        }
        const minText = inner.slice(0, comma).trim();
        const maxText = inner.slice(comma + 1).trim();
        if (maxText.includes(',')) {
            return invalid(text);
        }
        const min = minText.length > 0 ? parseVersion(minText) : undefined;
        const max = maxText.length > 0 ? parseVersion(maxText) : undefined;
        if ((minText.length > 0 && !min) || (maxText.length > 0 && !max) || (!min && !max)) {
            return invalid(text);
        }
        if (min && max && compare(min, max) > 0) {
            return invalid(text);
        }
        return {
            kind: 'range',
            original: text,
            min,
            minInclusive: first === '[',
            max,
            maxInclusive: last === ']',
        };
    }

    const minimum = parseVersion(trimmed);
    if (!minimum) {
        return invalid(text);
    }
    return { kind: 'minimum', original: text, min: minimum, minInclusive: true };
}

function padPrefix(prefix: string): string {
    const parts = prefix.split('.');
    while (parts.length < 3) {
        parts.push('0');
    }
    return parts.join('.');
}

/** Map a parsed specification onto the protocol's `VersionSpec` shape. */
export function toDomainSpec(parsed: ParsedVersionSpec): VersionSpec {
    switch (parsed.kind) {
        case 'floating':
            return {
                type: 'floating',
                original: parsed.original,
                floatingPrefix: parsed.floating?.prefix || undefined,
                // Passed as is: the domain comment names 1 to 3; 0 and 4 are defined on `FloatingPattern.depth`.
                floatingDepth: parsed.floating?.depth,
                isAlwaysLatest: parsed.floating?.isAlwaysLatest ?? false,
            };
        case 'exact':
            return { type: 'exact', original: parsed.original };
        case 'range':
            return { type: 'range', original: parsed.original };
        case 'minimum':
            return { type: 'standard', original: parsed.original };
        case 'invalid':
        default:
            return { type: 'unresolved', original: parsed.original };
    }
}

function matchesFloating(pattern: FloatingPattern, version: NuGetVersion): boolean {
    if (version.isPrerelease && !pattern.prerelease) {
        return false;
    }
    if (pattern.depth > 0) {
        const fixed = pattern.prefix.split('.').map(part => Number.parseInt(part, 10));
        const actual = [version.major, version.minor, version.patch, version.revision];
        for (let i = 0; i < fixed.length; i++) {
            if (fixed[i] !== actual[i]) {
                return false;
            }
        }
    }
    if (pattern.prerelease && pattern.releasePrefix.length > 0) {
        if (!version.isPrerelease) {
            return false;
        }
        const label = version.release.join('.').toLowerCase();
        return label.startsWith(pattern.releasePrefix.toLowerCase());
    }
    return true;
}

/** Whether `version` satisfies the specification. */
export function satisfies(spec: ParsedVersionSpec, version: NuGetVersion): boolean {
    switch (spec.kind) {
        case 'invalid':
            return false;
        case 'floating':
            return spec.floating ? matchesFloating(spec.floating, version) : false;
        case 'exact':
            return spec.min !== undefined && compare(version, spec.min) === 0;
        case 'minimum':
        case 'range': {
            if (spec.min) {
                const c = compare(version, spec.min);
                if (spec.minInclusive ? c < 0 : c <= 0) {
                    return false;
                }
            }
            if (spec.max) {
                const c = compare(version, spec.max);
                if (spec.maxInclusive ? c > 0 : c >= 0) {
                    return false;
                }
            }
            return true;
        }
        default:
            return false;
    }
}

/** Convenience: does the version string satisfy the specification string? False when either is invalid. */
export function satisfiesText(specText: string, versionText: string): boolean {
    const version = parseVersion(versionText);
    if (!version) {
        return false;
    }
    return satisfies(parseVersionSpec(specText), version);
}

/**
 * Resolve a floating specification against the available versions: the highest version matching
 * the pattern. `includePrerelease` admits prerelease versions even when the pattern does not.
 */
export function resolveFloating(spec: ParsedVersionSpec, available: readonly string[], includePrerelease: boolean): string | undefined {
    if (spec.kind !== 'floating' || !spec.floating) {
        return undefined;
    }
    const pattern: FloatingPattern = includePrerelease ? { ...spec.floating, prerelease: true } : spec.floating;
    let best: { text: string; version: NuGetVersion } | undefined;
    for (const text of available) {
        const version = parseVersion(text);
        if (!version || !matchesFloating(pattern, version)) {
            continue;
        }
        if (!best || compare(version, best.version) > 0) {
            best = { text, version };
        }
    }
    return best?.text;
}

/**
 * Whether an installed reference can be checked for updates. Floating/range specifications need
 * a resolved version (from assets or lock files); a minimum specification carries its own; an exact
 * pin such as `[1.0.0]` is never a candidate, because its author fixed the version.
 */
export function isUpdateCandidate(spec: ParsedVersionSpec, resolvedVersion: string | undefined): boolean {
    switch (spec.kind) {
        case 'invalid':
            return false;
        case 'floating':
            return !(spec.floating?.isAlwaysLatest ?? false) && resolvedVersion !== undefined && parseVersion(resolvedVersion) !== undefined;
        case 'range':
            return resolvedVersion !== undefined && parseVersion(resolvedVersion) !== undefined;
        case 'exact':
            return false;
        case 'minimum':
            return true;
        default:
            return false;
    }
}

/** The version to compare update candidates against for a reference. */
export function effectiveInstalledVersion(spec: ParsedVersionSpec, resolvedVersion: string | undefined): string | undefined {
    if (spec.kind === 'exact' || spec.kind === 'minimum') {
        return resolvedVersion && parseVersion(resolvedVersion) ? resolvedVersion : spec.min?.original;
    }
    return resolvedVersion && parseVersion(resolvedVersion) ? resolvedVersion : undefined;
}

export { normalizeId };
