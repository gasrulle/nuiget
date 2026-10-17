import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeProjectPath } from '../util/paths';
import { BUILD_PROPS_FILE, BUILD_TARGETS_FILE, CENTRAL_PROPS_FILE, findNearestFile } from './central';

export const GLOBAL_JSON_FILE = 'global.json';

/**
 * The files whose change can change what a project references or how its commands run: the
 * project, the nearest `Directory.Build.props`, `Directory.Build.targets` and
 * `Directory.Packages.props`, the nearest `global.json`, and the `nuget.config` chain.
 *
 * `global.json` is looked for up to the filesystem root, as the SDK does; the props and targets
 * files up to the stop directory, as the inspector does. A file that does not exist yet is not in
 * the list; it enters it, and changes the revision, once it is created.
 */
export async function revisionInputs(projectPath: string, configFiles: readonly string[], stopDirs?: readonly string[]): Promise<string[]> {
    const projectDir = path.dirname(projectPath);
    const found = await Promise.all([
        findNearestFile(projectDir, BUILD_PROPS_FILE, stopDirs),
        findNearestFile(projectDir, BUILD_TARGETS_FILE, stopDirs),
        findNearestFile(projectDir, CENTRAL_PROPS_FILE, stopDirs),
        findNearestFile(projectDir, GLOBAL_JSON_FILE),
    ]);
    const seen = new Set<string>();
    const inputs: string[] = [];
    for (const file of [projectPath, ...found, ...configFiles]) {
        if (file !== undefined && !seen.has(normalizeProjectPath(file))) {
            seen.add(normalizeProjectPath(file));
            inputs.push(file);
        }
    }
    return inputs;
}

/**
 * A short hash over the paths, modification times and sizes of `files`. It changes when a file
 * changes, appears or disappears, and when the list itself changes; the order of `files` does not
 * matter. It never reads file contents and never rejects: a file that cannot be read counts as missing.
 */
export async function computeRevision(files: readonly string[]): Promise<string> {
    const lines = await Promise.all(files.map(async file => {
        try {
            const stat = await fs.promises.stat(file);
            return `${normalizeProjectPath(file)}|${stat.mtimeMs}|${stat.size}`;
        } catch {
            return `${normalizeProjectPath(file)}|missing`;
        }
    }));
    return createHash('sha256').update(lines.sort().join('\n')).digest('hex').slice(0, 16);
}
