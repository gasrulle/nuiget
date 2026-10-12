import * as fs from 'fs';
import * as path from 'path';

export const fixturesRoot = __dirname;

/** Absolute path of a fixture file or directory. */
export function fixture(...segments: string[]): string {
    return path.join(fixturesRoot, ...segments);
}

export interface ScratchDir {
    dir: string;
    cleanup(): Promise<void>;
}

/**
 * Create a writable scratch directory under `__fixtures__/.scratch`. Kept inside the repository
 * so tests never touch the system temp folder; callers must `cleanup()` in `afterEach`/`afterAll`.
 */
export async function createScratchDir(prefix: string): Promise<ScratchDir> {
    const root = path.join(fixturesRoot, '.scratch');
    await fs.promises.mkdir(root, { recursive: true });
    // Self-ignoring marker so scratch output can never be committed, even when cleanup is skipped.
    await fs.promises.writeFile(path.join(root, '.gitignore'), '*\n', 'utf-8');
    const dir = await fs.promises.mkdtemp(path.join(root, `${prefix}-`));
    return {
        dir,
        async cleanup() {
            // The root and its self-ignoring `.gitignore` stay behind: they are invisible to git
            // and removing them would race with scratch directories owned by parallel workers.
            await fs.promises.rm(dir, { recursive: true, force: true });
        },
    };
}

/** Write `files` (relative path → content) beneath `dir`, creating directories as needed. */
export async function writeTree(dir: string, files: Record<string, string>): Promise<void> {
    for (const [relative, content] of Object.entries(files)) {
        const target = path.join(dir, relative);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.writeFile(target, content, 'utf-8');
    }
}

/** Copy a fixture file to `targetRelative` beneath `dir`. */
export async function copyFixture(fixtureRelative: string, dir: string, targetRelative: string): Promise<string> {
    const target = path.join(dir, targetRelative);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.copyFile(fixture(fixtureRelative), target);
    return target;
}
