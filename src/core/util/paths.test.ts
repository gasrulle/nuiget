import { describe, expect, it } from 'vitest';
import { fromMsBuildPath, isPathInside, normalizeProjectPath } from './paths';

describe('normalizeProjectPath', () => {
    it('lower-cases and normalizes Windows paths', () => {
        expect(normalizeProjectPath('C:\\Repo\\Src\\..\\Src\\App.csproj', 'win32')).toBe('c:\\repo\\src\\app.csproj');
    });

    it('accepts forward slashes on Windows', () => {
        expect(normalizeProjectPath('C:/Repo/Src/App.csproj', 'win32')).toBe('c:\\repo\\src\\app.csproj');
    });

    it('preserves case on POSIX', () => {
        expect(normalizeProjectPath('/repo/Src/./App.csproj', 'linux')).toBe('/repo/Src/App.csproj');
    });

    it('defaults to the current platform', () => {
        const input = process.platform === 'win32' ? 'C:\\Repo\\App.csproj' : '/repo/App.csproj';
        expect(normalizeProjectPath(input)).toBe(normalizeProjectPath(input, process.platform));
    });
});

describe('isPathInside', () => {
    it('matches files beneath the root', () => {
        expect(isPathInside('/ws/src/App/App.csproj', '/ws', 'linux')).toBe(true);
        expect(isPathInside('/ws/src/App/App.csproj', '/ws/', 'linux')).toBe(true);
    });

    it('does not treat a sibling with a shared prefix as inside', () => {
        expect(isPathInside('/workspace2/App.csproj', '/workspace', 'linux')).toBe(false);
    });

    it('treats the root itself as inside', () => {
        expect(isPathInside('/ws', '/ws', 'linux')).toBe(true);
    });

    it('is case-insensitive on Windows only', () => {
        expect(isPathInside('C:\\WS\\App\\App.csproj', 'c:\\ws', 'win32')).toBe(true);
        expect(isPathInside('/WS/App/App.csproj', '/ws', 'linux')).toBe(false);
    });
});

describe('fromMsBuildPath', () => {
    it('converts backslashes to forward slashes on POSIX', () => {
        expect(fromMsBuildPath('..\\Shared\\Shared.csproj', 'darwin')).toBe('../Shared/Shared.csproj');
    });

    it('leaves paths untouched on Windows', () => {
        expect(fromMsBuildPath('..\\Shared\\Shared.csproj', 'win32')).toBe('..\\Shared\\Shared.csproj');
    });
});
