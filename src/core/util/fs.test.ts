import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { fileExists, findUp, readTextIfExists } from './fs';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

describe('fileExists', () => {
    it('returns true for an existing file and directory', async () => {
        expect(await fileExists(path.join(repoRoot, 'package.json'))).toBe(true);
        expect(await fileExists(path.join(repoRoot, 'src'))).toBe(true);
    });

    it('returns false for a missing path', async () => {
        expect(await fileExists(path.join(repoRoot, 'definitely-missing-file.txt'))).toBe(false);
    });
});

describe('readTextIfExists', () => {
    it('returns file contents for an existing file', async () => {
        const text = await readTextIfExists(path.join(repoRoot, 'package.json'));
        expect(text).toContain('"name"');
    });

    it('returns undefined for a missing file', async () => {
        expect(await readTextIfExists(path.join(repoRoot, 'nope', 'missing.json'))).toBeUndefined();
    });

    it('returns undefined when the path is a directory', async () => {
        expect(await readTextIfExists(path.join(repoRoot, 'src'))).toBeUndefined();
    });
});

describe('findUp', () => {
    it('finds the nearest ancestor containing one of the names', async () => {
        const found = await findUp(__dirname, ['package.json']);
        expect(found).toBe(path.join(repoRoot, 'package.json'));
    });

    it('checks names in order within the same directory', async () => {
        const found = await findUp(repoRoot, ['missing.json', 'package.json', 'tsconfig.json']);
        expect(found).toBe(path.join(repoRoot, 'package.json'));
    });

    it('returns a match in the start directory itself', async () => {
        const found = await findUp(repoRoot, ['package.json']);
        expect(found).toBe(path.join(repoRoot, 'package.json'));
    });

    it('stops at stopDir (inclusive) without a match', async () => {
        const found = await findUp(__dirname, ['package.json'], path.join(repoRoot, 'src'));
        expect(found).toBeUndefined();
    });

    it('still matches when the file lives in stopDir itself', async () => {
        const found = await findUp(__dirname, ['package.json'], repoRoot);
        expect(found).toBe(path.join(repoRoot, 'package.json'));
    });

    it('returns undefined when the filesystem root is reached', async () => {
        const found = await findUp(__dirname, ['this-file-should-not-exist-anywhere.nuiget']);
        expect(found).toBeUndefined();
    });
});
