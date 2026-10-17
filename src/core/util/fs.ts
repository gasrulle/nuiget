import * as fs from 'fs';
import * as path from 'path';

/** Non-blocking existence check for a file or directory. */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/** Read a UTF-8 text file, returning `undefined` when it does not exist or cannot be read. */
export async function readTextIfExists(filePath: string): Promise<string | undefined> {
    try {
        return await fs.promises.readFile(filePath, 'utf-8');
    } catch {
        return undefined;
    }
}

/**
 * Walk up from `startDir` looking for the first directory containing any of `names`
 * (checked in the given order). Returns the matching file path, or `undefined` when the
 * filesystem root — or `stopDir`, inclusive — is reached without a match.
 */
export async function findUp(startDir: string, names: string[], stopDir?: string): Promise<string | undefined> {
    let current = path.resolve(startDir);
    const stop = stopDir === undefined ? undefined : path.resolve(stopDir);

    for (;;) {
        for (const name of names) {
            const candidate = path.join(current, name);
            if (await fileExists(candidate)) {
                return candidate;
            }
        }

        const parent = path.dirname(current);
        if (parent === current || (stop !== undefined && current === stop)) {
            return undefined;
        }
        current = parent;
    }
}
