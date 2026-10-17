import * as path from 'path';
import { fileExists } from '../util/fs';
import { isPathInside } from '../util/paths';
import { attr, childText, elements, parseMsBuildXml, rootProject, type XmlObject } from './xml';

export const CENTRAL_PROPS_FILE = 'Directory.Packages.props';
export const BUILD_PROPS_FILE = 'Directory.Build.props';
export const BUILD_TARGETS_FILE = 'Directory.Build.targets';

/** A `PackageVersion` entry from `Directory.Packages.props`. */
export interface CentralPackageVersion {
    version: string;
    /** Absolute path of the props file that declares the entry. */
    definedIn: string;
    /**
     * The entry depends on a `Condition` (on the item, on its `ItemGroup`, or on an entry it updates).
     * Conditions are not evaluated at this tier, so `version` is the last value written and may not be
     * the one MSBuild uses.
     */
    conditioned: boolean;
}

/**
 * The `stopDirs` entry that contains `startDir` (the deepest one when several do). Walks stop at
 * that directory inclusively, mirroring how MSBuild stops at the drive root and we at the
 * workspace folder.
 */
export function nearestStopDir(startDir: string, stopDirs: readonly string[] | undefined): string | undefined {
    let best: string | undefined;
    for (const stopDir of stopDirs ?? []) {
        if (isPathInside(startDir, stopDir) && (best === undefined || stopDir.length > best.length)) {
            best = stopDir;
        }
    }
    return best;
}

/**
 * Nearest `fileName` walking up from `startDir` (inclusive) until the filesystem root or the
 * containing stop directory (inclusive).
 */
export async function findNearestFile(startDir: string, fileName: string, stopDirs?: readonly string[]): Promise<string | undefined> {
    const matches = await findFilesUpwards(startDir, fileName, stopDirs, 1);
    return matches[0];
}

/**
 * Every `fileName` on the way up from `startDir` (nearest first) until the filesystem root or the
 * containing stop directory (inclusive). `limit` caps the number of matches.
 */
export async function findFilesUpwards(
    startDir: string,
    fileName: string,
    stopDirs?: readonly string[],
    limit = Number.POSITIVE_INFINITY,
): Promise<string[]> {
    const stop = nearestStopDir(startDir, stopDirs);
    const stopResolved = stop === undefined ? undefined : path.resolve(stop);
    const matches: string[] = [];
    let current = path.resolve(startDir);

    for (;;) {
        const candidate = path.join(current, fileName);
        if (await fileExists(candidate)) {
            matches.push(candidate);
            if (matches.length >= limit) {
                return matches;
            }
        }
        const parent = path.dirname(current);
        if (parent === current || (stopResolved !== undefined && current === stopResolved)) {
            return matches;
        }
        current = parent;
    }
}

/** Nearest `Directory.Packages.props` for a project directory (MSBuild imports only the nearest one). */
export function findCentralPropsPath(projectDir: string, stopDirs?: readonly string[]): Promise<string | undefined> {
    return findNearestFile(projectDir, CENTRAL_PROPS_FILE, stopDirs);
}

/**
 * MSBuild boolean property semantics: `true`/`false` case-insensitively (surrounding whitespace
 * ignored); anything else — including an unset property — is `undefined`.
 */
export function parseBooleanProperty(value: string | undefined): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
        return true;
    }
    if (normalized === 'false') {
        return false;
    }
    return undefined;
}

/**
 * `PackageVersion` items of a `Directory.Packages.props` document keyed by lower-cased package id.
 * `Include` declares, `Update` modifies an earlier declaration (and is ignored without one), and the
 * last declaration wins — the same order MSBuild applies within one file. Conditions are not
 * evaluated at this tier: a guarded entry is returned with the latest value seen and `conditioned`.
 */
export function parseCentralPackageVersions(xml: string | XmlObject, propsPath: string): Map<string, CentralPackageVersion> {
    const doc = typeof xml === 'string' ? parseMsBuildXml(xml, propsPath) : xml;
    const project = rootProject(doc);
    const versions = new Map<string, CentralPackageVersion>();
    if (!project) {
        return versions;
    }

    for (const group of elements(project, 'ItemGroup')) {
        const groupConditioned = attr(group, 'Condition') !== undefined;
        for (const item of elements(group, 'PackageVersion')) {
            const version = attr(item, 'Version') ?? childText(item, 'Version');
            const conditioned = groupConditioned || attr(item, 'Condition') !== undefined;
            const include = attr(item, 'Include')?.trim();
            if (include) {
                if (version !== undefined) {
                    // A guarded declaration over an earlier one leaves open which of the two applies.
                    versions.set(include.toLowerCase(), { version: version.trim(), definedIn: propsPath, conditioned });
                }
                continue;
            }
            const update = attr(item, 'Update')?.trim();
            const updated = update === undefined ? undefined : versions.get(update.toLowerCase());
            if (update && version !== undefined && updated !== undefined) {
                versions.set(update.toLowerCase(), { version: version.trim(), definedIn: propsPath, conditioned: conditioned || updated.conditioned });
            }
        }
    }
    return versions;
}
