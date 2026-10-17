import * as path from 'path';

export type PlatformId = NodeJS.Platform;

function pathModuleFor(platform: PlatformId): path.PlatformPath {
    return platform === 'win32' ? path.win32 : path.posix;
}

/**
 * Normalize a project path for comparisons: platform-specific normalization, lower-cased on
 * Windows where the filesystem is case-insensitive. Use the result as a map key, never for I/O.
 */
export function normalizeProjectPath(projectPath: string, platform: PlatformId = process.platform): string {
    const normalized = pathModuleFor(platform).normalize(projectPath);
    return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/** True when `candidate` equals `root` or lives beneath it (separator-aware, case-insensitive on Windows). */
export function isPathInside(candidate: string, root: string, platform: PlatformId = process.platform): boolean {
    const p = pathModuleFor(platform);
    const normalizedCandidate = normalizeProjectPath(candidate, platform);
    const normalizedRoot = normalizeProjectPath(root, platform).replace(/[\\/]+$/, '');
    if (normalizedCandidate === normalizedRoot) {
        return true;
    }
    return normalizedCandidate.startsWith(normalizedRoot + p.sep);
}

/**
 * Convert an MSBuild-style relative path (which may use backslashes on any OS) to a path the
 * current platform understands. On Windows forward slashes are already accepted natively.
 */
export function fromMsBuildPath(msbuildPath: string, platform: PlatformId = process.platform): string {
    return platform === 'win32' ? msbuildPath : msbuildPath.replace(/\\/g, '/');
}
