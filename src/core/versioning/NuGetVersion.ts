/**
 * NuGet version parsing, normalization and precedence.
 *
 * Rules follow https://learn.microsoft.com/en-us/nuget/concepts/package-versioning :
 *   - 1–4 numeric components (`major.minor.patch[.revision]`), optional `-prerelease` labels,
 *     optional `+metadata` (ignored for precedence);
 *   - normalized form drops leading zeros, pads to three components, drops a zero fourth
 *     component, keeps prerelease labels as written and drops metadata;
 *   - prerelease identifiers compare per SemVer 2 except that alphanumeric identifiers compare
 *     case-insensitively (NuGet uses an ordinal-ignore-case comparison).
 *
 * Parsing NEVER coerces: an unparsable string yields `undefined` so that `'unknown'`, ranges
 * and floating patterns can never masquerade as `0.0.0`.
 */

export interface NuGetVersion {
    major: number;
    minor: number;
    patch: number;
    revision: number;
    /** Prerelease identifiers (empty for a release). */
    release: string[];
    metadata?: string;
    original: string;
    normalized: string;
    isPrerelease: boolean;
    /** True when a non-zero fourth component is present. */
    isLegacy: boolean;
}

const NUMERIC = /^(0|[1-9]\d*|0\d+)$/;
const IDENTIFIER = /^[0-9A-Za-z-]+$/;

/** Parse a NuGet version string; returns `undefined` for anything that is not a plain version. */
export function parseVersion(text: string): NuGetVersion | undefined {
    if (typeof text !== 'string') {
        return undefined;
    }
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed !== text.trim() || /\s/.test(trimmed)) {
        return undefined;
    }

    let rest = trimmed;
    let metadata: string | undefined;
    const plus = rest.indexOf('+');
    if (plus !== -1) {
        metadata = rest.slice(plus + 1);
        rest = rest.slice(0, plus);
        if (metadata.length === 0 || !metadata.split('.').every(part => IDENTIFIER.test(part))) {
            return undefined;
        }
    }

    let release: string[] = [];
    const dash = rest.indexOf('-');
    if (dash !== -1) {
        const label = rest.slice(dash + 1);
        rest = rest.slice(0, dash);
        if (label.length === 0) {
            return undefined;
        }
        release = label.split('.');
        if (!release.every(part => part.length > 0 && IDENTIFIER.test(part))) {
            return undefined;
        }
    }

    const parts = rest.split('.');
    if (parts.length < 1 || parts.length > 4 || !parts.every(part => NUMERIC.test(part))) {
        return undefined;
    }
    const numbers = parts.map(part => Number.parseInt(part, 10));
    if (numbers.some(n => !Number.isSafeInteger(n))) {
        return undefined;
    }
    const [major, minor = 0, patch = 0, revision = 0] = numbers;

    const normalizedCore = revision === 0 ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch}.${revision}`;
    const normalized = release.length > 0 ? `${normalizedCore}-${release.join('.')}` : normalizedCore;

    return {
        major,
        minor,
        patch,
        revision,
        release,
        metadata,
        original: text,
        normalized,
        isPrerelease: release.length > 0,
        isLegacy: revision !== 0,
    };
}

/** Normalized string form, or `undefined` when unparsable. */
export function normalize(text: string): string | undefined {
    return parseVersion(text)?.normalized;
}

function compareIdentifiers(a: string, b: string): number {
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
        const an = Number.parseInt(a, 10);
        const bn = Number.parseInt(b, 10);
        return an === bn ? 0 : an < bn ? -1 : 1;
    }
    if (aNumeric !== bNumeric) {
        // Numeric identifiers always have lower precedence than alphanumeric ones.
        return aNumeric ? -1 : 1;
    }
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    return al === bl ? 0 : al < bl ? -1 : 1;
}

/** SemVer-2 precedence with NuGet's case-insensitive prerelease comparison; metadata is ignored. */
export function compare(a: NuGetVersion, b: NuGetVersion): -1 | 0 | 1 {
    const numeric: Array<[number, number]> = [
        [a.major, b.major],
        [a.minor, b.minor],
        [a.patch, b.patch],
        [a.revision, b.revision],
    ];
    for (const [x, y] of numeric) {
        if (x !== y) {
            return x < y ? -1 : 1;
        }
    }
    if (a.release.length === 0 && b.release.length === 0) {
        return 0;
    }
    if (a.release.length === 0) {
        return 1;
    }
    if (b.release.length === 0) {
        return -1;
    }
    const len = Math.min(a.release.length, b.release.length);
    for (let i = 0; i < len; i++) {
        const c = compareIdentifiers(a.release[i], b.release[i]);
        if (c !== 0) {
            return c < 0 ? -1 : 1;
        }
    }
    if (a.release.length === b.release.length) {
        return 0;
    }
    return a.release.length < b.release.length ? -1 : 1;
}

/** Compare two version strings; `undefined` when either is unparsable. */
export function compareText(a: string, b: string): -1 | 0 | 1 | undefined {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa || !pb) {
        return undefined;
    }
    return compare(pa, pb);
}

/** True when `candidate` has strictly higher precedence than `installed`; false when either is unparsable. */
export function isNewer(candidate: string, installed: string): boolean {
    return compareText(candidate, installed) === 1;
}

/** True when both parse and have equal precedence (metadata ignored). */
export function equals(a: string, b: string): boolean {
    return compareText(a, b) === 0;
}

/** Sort version strings descending; unparsable strings keep their relative order at the end. */
export function sortDescending(versions: readonly string[]): string[] {
    const parsed = versions.map((text, index) => ({ text, index, version: parseVersion(text) }));
    const valid = parsed.filter(entry => entry.version !== undefined) as Array<{ text: string; index: number; version: NuGetVersion }>;
    const invalid = parsed.filter(entry => entry.version === undefined);
    valid.sort((x, y) => {
        const c = compare(y.version, x.version);
        return c !== 0 ? c : x.index - y.index;
    });
    return [...valid.map(entry => entry.text), ...invalid.map(entry => entry.text)];
}

/** Highest version in `versions`, optionally admitting prerelease versions. */
export function selectLatest(versions: readonly string[], options: { includePrerelease: boolean }): string | undefined {
    let best: { text: string; version: NuGetVersion } | undefined;
    for (const text of versions) {
        const version = parseVersion(text);
        if (!version) {
            continue;
        }
        if (version.isPrerelease && !options.includePrerelease) {
            continue;
        }
        if (!best || compare(version, best.version) > 0) {
            best = { text, version };
        }
    }
    return best?.text;
}

/** Case-insensitive package-id key used by every map/set that is keyed by package id. */
export function normalizeId(id: string): string {
    return id.trim().toLowerCase();
}
